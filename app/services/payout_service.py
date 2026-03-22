import uuid
from decimal import Decimal
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi import HTTPException

from app.models.transaction import Transaction, TransactionStatus
from app.models.wallet import SubWallet
from app.services.wallet_service import deduct_balance, refund_balance
from app.services.xpaysafe import xpaysafe_client


async def create_single_payout(
    db: AsyncSession,
    wallet: SubWallet,
    amount: Decimal,
    currency: str,
    beneficiary_name: str,
    account_number: str,
    ifsc: str,
    bank_name: str,
) -> Transaction:
    """
    1. Deduct balance (raises 400 if insufficient).
    2. Call xpaysafe.
    3. Persist transaction record.
    4. Refund on API failure.
    """
    # Step 1: deduct balance
    await deduct_balance(db, wallet.id, amount)

    order_id = f"PAYOUT-{uuid.uuid4().hex[:12].upper()}"

    # Step 2: call API
    try:
        result = await xpaysafe_client.initiate_payout(
            amount=float(amount),
            currency=currency,
            beneficiary_name=beneficiary_name,
            account_number=account_number,
            ifsc=ifsc,
            bank_name=bank_name or "",
            order_id=order_id,
        )
        api_response = result["response"]
        gateway_txn_id = api_response.get("transactionId")
        gateway_ref_id = api_response.get("data", {}).get("gateway_ref_id")
        initial_status = TransactionStatus.PENDING

    except Exception as exc:
        # Refund on failure
        await refund_balance(db, wallet.id, amount)
        raise HTTPException(status_code=502, detail=f"Payment gateway error: {str(exc)}")

    # Step 3: persist
    txn = Transaction(
        wallet_id=wallet.id,
        order_id=order_id,
        transaction_id=gateway_txn_id,
        gateway_ref_id=gateway_ref_id,
        amount=amount,
        currency=currency,
        beneficiary_name=beneficiary_name,
        account_number=account_number,
        ifsc=ifsc,
        bank_name=bank_name,
        status=initial_status,
        raw_gateway_response=api_response,
    )
    db.add(txn)
    await db.flush()
    return txn


async def get_transaction_by_order_id(db: AsyncSession, order_id: str) -> Transaction:
    result = await db.execute(
        select(Transaction).where(Transaction.order_id == order_id)
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return txn


async def list_wallet_transactions(
    db: AsyncSession,
    wallet_id,
    page: int = 1,
    page_size: int = 20,
    status_filter: str = None,
):
    query = select(Transaction).where(Transaction.wallet_id == wallet_id)
    count_query = select(func.count()).where(Transaction.wallet_id == wallet_id)

    if status_filter:
        query = query.where(Transaction.status == status_filter)
        count_query = count_query.where(Transaction.status == status_filter)

    query = query.order_by(Transaction.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    items_result = await db.execute(query)
    count_result = await db.execute(count_query)

    return items_result.scalars().all(), count_result.scalar()


async def handle_webhook_update(
    db: AsyncSession,
    order_id: str,
    new_status: str,
    transaction_id: str,
    utr: str = None,
    gateway_response: dict = None,
) -> Transaction:
    """Update transaction status from xpaysafe webhook."""
    result = await db.execute(
        select(Transaction).where(Transaction.order_id == order_id)
    )
    txn = result.scalar_one_or_none()
    if not txn:
        return None

    status_map = {
        "SUCCESS": TransactionStatus.SUCCESS,
        "FAILED": TransactionStatus.FAILED,
        "EXPIRED": TransactionStatus.EXPIRED,
        "PENDING": TransactionStatus.PENDING,
    }
    mapped = status_map.get(new_status.upper())
    if not mapped:
        return txn

    # Refund on failure/expiry
    if mapped in (TransactionStatus.FAILED, TransactionStatus.EXPIRED):
        if txn.status == TransactionStatus.PENDING:
            await refund_balance(db, txn.wallet_id, txn.amount)

    txn.status = mapped
    if transaction_id:
        txn.transaction_id = transaction_id
    if utr:
        txn.utr = utr
    if gateway_response:
        txn.raw_gateway_response = gateway_response
    txn.updated_at = datetime.utcnow()

    await db.flush()
    return txn
