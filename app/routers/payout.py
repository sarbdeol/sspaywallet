import uuid
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Query, HTTPException, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.auth import get_current_user
from app.models.wallet import User
from app.models.transaction import BulkPayoutJob, BulkJobStatus
from app.schemas.payout import (
    SinglePayoutRequest, PayoutOut, BulkPayoutJobOut, TransactionListOut
)
from app.services.wallet_service import get_sub_wallet_by_user
from app.services.payout_service import (
    create_single_payout,
    list_wallet_transactions,
    get_transaction_by_order_id,
)
from app.services.bulk_service import parse_bulk_excel_with_mapping, split_valid_invalid, get_excel_headers

router = APIRouter(prefix="/payout", tags=["Payout"])


# ── Wallet Balance ─────────────────────────────────────────────────────────────

@router.get("/wallet/balance")
async def get_my_balance(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet = await get_sub_wallet_by_user(db, current_user.id)
    return {
        "balance": float(wallet.balance),
        "currency": wallet.currency,
        "is_active": wallet.is_active,
    }


# ── Single Payout ──────────────────────────────────────────────────────────────

@router.post("/single", response_model=PayoutOut, status_code=201)
async def single_payout(
    body: SinglePayoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet = await get_sub_wallet_by_user(db, current_user.id)
    txn = await create_single_payout(
        db=db,
        wallet=wallet,
        amount=body.amount,
        currency=body.currency,
        beneficiary_name=body.beneficiary.name,
        account_number=body.beneficiary.account_number,
        ifsc=body.beneficiary.ifsc,
        bank_name=body.beneficiary.bank_name or "",
    )
    return txn


# ── Bulk Payout Step 1: Read Headers ──────────────────────────────────────────
# NOTE: /bulk/headers MUST be before /bulk/{job_id} — FastAPI matches top to bottom

@router.post("/bulk/headers")
async def get_bulk_headers(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="Only .xlsx, .xls, or .csv files are supported")

    file_bytes = await file.read()
    if len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 5MB.")

    headers = get_excel_headers(file_bytes, file.filename)

    import base64
    encoded = base64.b64encode(file_bytes).decode()

    return {
        "filename": file.filename,
        "headers": headers,
        "file_data": encoded,
        "required_fields": ["beneficiary_name", "account_number", "ifsc", "amount"],
        "optional_fields": ["bank_name", "currency"],
    }


# ── Bulk Payout Step 2: Submit with Mapping ───────────────────────────────────

@router.post("/bulk", response_model=BulkPayoutJobOut, status_code=202)
async def bulk_payout(
    file: UploadFile = File(...),
    mapping: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json as _json
    from decimal import Decimal

    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="Only .xlsx, .xls, or .csv files are supported")

    file_bytes = await file.read()
    if len(file_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 5MB.")

    try:
        mapping_dict = _json.loads(mapping)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid mapping JSON")

    rows = parse_bulk_excel_with_mapping(file_bytes, file.filename, mapping_dict)
    valid_rows, invalid_rows = split_valid_invalid(rows)

    wallet = await get_sub_wallet_by_user(db, current_user.id)
    total_amount = sum(Decimal(str(r["amount"])) for r in valid_rows)

    job = BulkPayoutJob(
        wallet_id=wallet.id,
        uploaded_by=current_user.id,
        filename=file.filename,
        total_rows=len(rows),
        total_amount=total_amount,
        status=BulkJobStatus.QUEUED,
        error_log=invalid_rows if invalid_rows else None,
        failed_count=len(invalid_rows),
    )
    db.add(job)
    await db.flush()

    if valid_rows:
        from app.workers.payout_worker import process_bulk_payout
        task = process_bulk_payout.delay(str(job.id), str(wallet.id), valid_rows)
        job.celery_task_id = task.id

    await db.flush()
    return job


# ── Bulk Jobs List ─────────────────────────────────────────────────────────────

@router.get("/bulk", response_model=list)
async def list_bulk_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 20,
):
    wallet = await get_sub_wallet_by_user(db, current_user.id)
    result = await db.execute(
        select(BulkPayoutJob)
        .where(BulkPayoutJob.wallet_id == wallet.id)
        .order_by(BulkPayoutJob.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    jobs = result.scalars().all()
    return [BulkPayoutJobOut.model_validate(j) for j in jobs]


# ── Bulk Job Status ────────────────────────────────────────────────────────────
# NOTE: /bulk/{job_id} MUST be after /bulk/headers and /bulk

@router.get("/bulk/{job_id}", response_model=BulkPayoutJobOut)
async def get_bulk_job_status(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    wallet = await get_sub_wallet_by_user(db, current_user.id)
    result = await db.execute(
        select(BulkPayoutJob).where(
            BulkPayoutJob.id == job_id,
            BulkPayoutJob.wallet_id == wallet.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Bulk job not found")
    return job


# ── Transaction History ───────────────────────────────────────────────────────

@router.get("/transactions", response_model=TransactionListOut)
async def my_transactions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    wallet = await get_sub_wallet_by_user(db, current_user.id)
    items, total = await list_wallet_transactions(
        db, wallet.id, page, page_size, status, date_from, date_to
    )
    return TransactionListOut(items=items, total=total, page=page, page_size=page_size)


# ── Transaction Detail ─────────────────────────────────────────────────────────

@router.get("/transactions/{order_id}", response_model=PayoutOut)
async def get_transaction(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    txn = await get_transaction_by_order_id(db, order_id)
    wallet = await get_sub_wallet_by_user(db, current_user.id)
    if txn.wallet_id != wallet.id:
        raise HTTPException(status_code=403, detail="Not your transaction")
    return txn


# ── Manual Status Check ────────────────────────────────────────────────────────
# NOTE: /transactions/{order_id}/check-status MUST be after /transactions/{order_id}

@router.post("/transactions/{order_id}/check-status")
async def check_transaction_status(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.xpaysafe import xpaysafe_client
    from app.services.payout_service import handle_webhook_update

    txn = await get_transaction_by_order_id(db, order_id)
    wallet = await get_sub_wallet_by_user(db, current_user.id)
    if txn.wallet_id != wallet.id:
        raise HTTPException(status_code=403, detail="Not your transaction")

    if not txn.transaction_id:
        raise HTTPException(status_code=400, detail="Transaction not yet submitted to gateway")

    try:
        result = await xpaysafe_client.check_status(txn.transaction_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gateway status check failed: {str(e)}")

    updated = await handle_webhook_update(
        db=db,
        order_id=order_id,
        new_status=result.get("status", "PENDING"),
        transaction_id=result.get("transactionId"),
        utr=result.get("utr"),
        gateway_response=result,
    )

    return {
        "order_id": order_id,
        "status":   updated.status if updated else txn.status,
        "utr":      updated.utr    if updated else txn.utr,
        "gateway_response": result,
    }