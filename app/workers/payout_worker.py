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
    task_acks_late=True,                # ack only after task completes
    worker_prefetch_multiplier=1,       # one task at a time per worker
)


@celery_app.task(bind=True, max_retries=0, name="process_bulk_payout")
def process_bulk_payout(self, job_id: str, wallet_id: str, rows: list):
    """
    Celery task: process all valid rows in a bulk payout job.
    Each row is submitted to xpaysafe independently.
    Insufficient balance rows are skipped (REJECTED).
    """
    return asyncio.run(_async_process_bulk(job_id, wallet_id, rows))


async def _async_process_bulk(job_id: str, wallet_id: str, rows: list):
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from sqlalchemy import select
    from app.models.transaction import BulkPayoutJob, BulkJobStatus, Transaction, TransactionStatus
    from app.models.wallet import SubWallet
    from app.services.xpaysafe import xpaysafe_client
    from app.services.wallet_service import deduct_balance, refund_balance

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    success_count = 0
    failed_count = 0
    skipped_count = 0
    error_log = []

    async with SessionLocal() as db:
        # Mark job as PROCESSING
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
            row_num = row.get("row", "?")
            amount = Decimal(str(row["amount"]))
            order_id = f"BULK-{uuid.uuid4().hex[:10].upper()}"

            async with SessionLocal() as row_db:
                try:
                    # Deduct balance (raises if insufficient)
                    await deduct_balance(row_db, uuid.UUID(wallet_id), amount)

                    # Call xpaysafe
                    api_result = await xpaysafe_client.initiate_payout(
                        amount=float(amount),
                        currency=row.get("currency", "INR"),
                        beneficiary_name=row["beneficiary_name"],
                        account_number=row["account_number"],
                        ifsc=row["ifsc"],
                        bank_name=row.get("bank_name", ""),
                        order_id=order_id,
                    )
                    api_response = api_result["response"]
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

                    # Distinguish insufficient balance vs other errors
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

        # Update job completion
        async with SessionLocal() as final_db:
            result = await final_db.execute(
                select(BulkPayoutJob).where(BulkPayoutJob.id == job_id)
            )
            job = result.scalar_one_or_none()
            if job:
                job.success_count = success_count
                job.failed_count = failed_count
                job.skipped_count = skipped_count
                job.error_log = error_log
                job.completed_at = datetime.utcnow()

                if failed_count == 0 and skipped_count == 0:
                    job.status = BulkJobStatus.COMPLETED
                elif success_count > 0:
                    job.status = BulkJobStatus.PARTIAL
                else:
                    job.status = BulkJobStatus.FAILED

                await final_db.commit()

    await engine.dispose()
    return {
        "success": success_count,
        "failed": failed_count,
        "skipped": skipped_count,
    }
