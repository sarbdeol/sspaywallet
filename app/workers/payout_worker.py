import asyncio
import uuid
from decimal import Decimal
from datetime import datetime
from celery import Celery
from app.config import settings

celery_app = Celery(
    "xpay_workers",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
)


@celery_app.task(bind=True, max_retries=0, name="process_bulk_payout")
def process_bulk_payout(self, job_id: str, wallet_id: str, rows: list):
    return asyncio.run(_async_process_bulk(job_id, wallet_id, rows))


async def _async_process_bulk(job_id: str, wallet_id: str, rows: list):
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy import select
    from app.models.transaction import BulkPayoutJob, BulkJobStatus, Transaction, TransactionStatus
    from app.services.wallet_service import deduct_balance, refund_balance

    # Always create fresh client inside the async function
    # This ensures settings are loaded fresh in the worker process
    from app.config import get_settings
    fresh_settings = get_settings()

    import hashlib, hmac as hmac_lib, base64, json, time, httpx

    def deep_sort(obj):
        if isinstance(obj, dict):
            return {k: deep_sort(v) for k, v in sorted(obj.items())}
        if isinstance(obj, list):
            return [deep_sort(i) for i in obj]
        return obj

    def build_sig(payload):
        sorted_p = deep_sort(payload)
        payload_str = json.dumps(sorted_p, separators=(",", ":"))
        key = (fresh_settings.XPAYSAFE_API_SECRET + fresh_settings.XPAYSAFE_SALT).encode("utf-8")
        sig = hmac_lib.new(key, payload_str.encode("utf-8"), hashlib.sha256).digest()
        return base64.b64encode(sig).decode("utf-8")

    async def call_payout(amount_f, currency, beneficiary_name, account_number, ifsc, bank_name, order_id):
        ts = int(time.time())
        payload = {
            "orderId": order_id,
            "amount": round(float(amount_f), 2),
            "currency": currency,
            "beneficiary_details": {
                "account_number": account_number,
                "bank_name": bank_name or "",
                "ifsc": ifsc,
                "name": beneficiary_name,
            },
            "timestamp": ts,
        }
        signature = build_sig(payload)
        headers = {
            "Content-Type": "application/json",
            "X-API-Key":    fresh_settings.XPAYSAFE_API_KEY,
            "X-Signature":  signature,
            "X-Timestamp":  str(ts),
        }
        body = json.dumps(deep_sort(payload), separators=(",", ":"))
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            resp = await client.post(
                f"{fresh_settings.XPAYSAFE_BASE_URL}/transactions/payout",
                content=body,
                headers=headers,
            )
            if resp.status_code == 401:
                raise Exception(f"401 Unauthorized from xpaysafe — check credentials/IP whitelist")
            resp.raise_for_status()
            return resp.json()

    engine = create_async_engine(fresh_settings.DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    success_count = 0
    failed_count = 0
    skipped_count = 0
    error_log = []

    async with SessionLocal() as db:
        result = await db.execute(
            select(BulkPayoutJob).where(BulkPayoutJob.id == job_id)
        )
        job = result.scalar_one_or_none()
        if not job:
            await engine.dispose()
            return

        job.status = BulkJobStatus.PROCESSING
        await db.commit()

        for row in rows:
            row_num   = row.get("row", "?")
            amount    = Decimal(str(row["amount"]))
            order_id  = f"BULK-{uuid.uuid4().hex[:10].upper()}"

            async with SessionLocal() as row_db:
                try:
                    await deduct_balance(row_db, uuid.UUID(wallet_id), amount)

                    api_response = await call_payout(
                        amount_f=float(amount),
                        currency=row.get("currency", "INR"),
                        beneficiary_name=row["beneficiary_name"],
                        account_number=row["account_number"],
                        ifsc=row["ifsc"],
                        bank_name=row.get("bank_name", ""),
                        order_id=order_id,
                    )

                    gateway_txn_id = api_response.get("transactionId")
                    gateway_ref_id = api_response.get("data", {}).get("gateway_ref_id")

                    txn = Transaction(
                        wallet_id=uuid.UUID(wallet_id),
                        bulk_job_id=uuid.UUID(job_id),
                        order_id=order_id,
                        transaction_id=gateway_txn_id,
                        gateway_ref_id=gateway_ref_id,
                        amount=amount,
                        currency=row.get("currency", "INR"),
                        beneficiary_name=row["beneficiary_name"],
                        account_number=row["account_number"],
                        ifsc=row["ifsc"],
                        bank_name=row.get("bank_name", ""),
                        status=TransactionStatus.PENDING,
                        raw_gateway_response=api_response,
                    )
                    row_db.add(txn)
                    await row_db.commit()
                    success_count += 1

                except Exception as exc:
                    await row_db.rollback()
                    err_msg = str(exc)

                    if "Insufficient" in err_msg or "balance" in err_msg.lower():
                        skipped_count += 1
                        status_label = "REJECTED"
                    else:
                        failed_count += 1
                        status_label = "FAILED"

                    error_log.append({
                        "row": row_num,
                        "order_id": order_id,
                        "beneficiary_name": row.get("beneficiary_name"),
                        "amount": str(amount),
                        "status": status_label,
                        "reason": err_msg,
                    })

        async with SessionLocal() as final_db:
            result = await final_db.execute(
                select(BulkPayoutJob).where(BulkPayoutJob.id == job_id)
            )
            job = result.scalar_one_or_none()
            if job:
                job.success_count  = success_count
                job.failed_count   = failed_count
                job.skipped_count  = skipped_count
                job.error_log      = error_log
                job.completed_at   = datetime.utcnow()

                if failed_count == 0 and skipped_count == 0:
                    job.status = BulkJobStatus.COMPLETED
                elif success_count > 0:
                    job.status = BulkJobStatus.PARTIAL
                else:
                    job.status = BulkJobStatus.FAILED

                await final_db.commit()

    await engine.dispose()
    return {"success": success_count, "failed": failed_count, "skipped": skipped_count}