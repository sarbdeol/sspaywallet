import json
import hmac
import hashlib
import httpx
from fastapi import APIRouter, Depends, Request, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.services.xpaysafe import xpaysafe_client
from app.services.payout_service import handle_webhook_update
from app.schemas.payout import WebhookPayload
from app.models.wallet import SubWallet
from app.models.transaction import Transaction, TransactionStatus

router = APIRouter(prefix="/webhook", tags=["Webhook"])


async def _fire_user_webhook(
    wallet: SubWallet,
    transaction: Transaction,
    event: str,
):
    """
    Fire a webhook to the user's configured webhook_url when a payout
    is confirmed or failed. Signed with their api_key as HMAC-SHA256 secret.
    """
    webhook_url = wallet.webhook_url
    if not webhook_url:
        return  # User hasn't configured a webhook URL — skip silently

    payload = {
        "event":            event,
        "order_id":         transaction.order_id,
        "transaction_id":   transaction.transaction_id,
        "status":           transaction.status.value,
        "amount":           float(transaction.amount),
        "currency":         transaction.currency,
        "beneficiary_name": transaction.beneficiary_name,
        "account_number":   transaction.account_number,
        "ifsc":             transaction.ifsc,
        "bank_name":        transaction.bank_name,
        "utr":              transaction.utr,
        "failure_reason":   transaction.failure_reason,
        "timestamp":        __import__("time").time(),
    }

    # Sign with the user's api_key
    signature = hmac.new(
        (wallet.api_key or "").encode(),
        json.dumps(payload, sort_keys=True).encode(),
        hashlib.sha256,
    ).hexdigest()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                webhook_url,
                json=payload,
                headers={
                    "Content-Type":     "application/json",
                    "X-XPay-Signature": signature,
                    "X-XPay-Event":     event,
                },
            )
        print(f"✅ User webhook fired: {event} → {webhook_url}")
    except Exception as e:
        # Log but never fail — webhook delivery is best-effort
        print(f"⚠️ User webhook failed: {webhook_url} — {str(e)}")


@router.post("/xpaysafe")
async def xpaysafe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_signature: str = Header(None, alias="X-Signature"),
    x_timestamp: str = Header(None, alias="X-Timestamp"),
):
    """
    Receive transaction status updates from xpaysafe.
    Verifies HMAC-SHA256 signature before processing.
    After processing, fires webhook to user's configured URL.
    """
    if not x_signature:
        raise HTTPException(status_code=401, detail="Missing X-Signature header")

    raw_body = await request.body()

    try:
        payload_dict = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Verify signature from xpaysafe
    if not xpaysafe_client.verify_webhook_signature(payload_dict, x_signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = WebhookPayload(**payload_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid payload schema: {e}")

    # Only handle PAYOUT type
    if payload.type.upper() != "PAYOUT":
        return {"message": "Ignored — not a payout event"}

    # Update transaction in DB
    txn = await handle_webhook_update(
        db=db,
        order_id=payload.orderId,
        new_status=payload.status,
        transaction_id=payload.transactionId,
        utr=payload.utr,
        gateway_response=payload_dict,
    )

    if not txn:
        return {"message": "Transaction not found, ignored"}

    # ── Fire user webhook if transaction is terminal (SUCCESS or FAILED) ──────
    if txn.status in (TransactionStatus.SUCCESS, TransactionStatus.FAILED, TransactionStatus.EXPIRED):
        # Get the wallet to access webhook_url and api_key
        wallet_result = await db.execute(
            select(SubWallet).where(SubWallet.id == txn.wallet_id)
        )
        wallet = wallet_result.scalar_one_or_none()

        if wallet:
            event = (
                "payout.success" if txn.status == TransactionStatus.SUCCESS
                else "payout.failed"
            )
            await _fire_user_webhook(wallet, txn, event)

    return {
        "message":  "Webhook processed",
        "order_id": payload.orderId,
        "status":   payload.status,
    }
