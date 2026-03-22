import json
from fastapi import APIRouter, Depends, Request, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.xpaysafe import xpaysafe_client
from app.services.payout_service import handle_webhook_update
from app.schemas.payout import WebhookPayload

router = APIRouter(prefix="/webhook", tags=["Webhook"])


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
    """
    if not x_signature:
        raise HTTPException(status_code=401, detail="Missing X-Signature header")

    raw_body = await request.body()

    try:
        payload_dict = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Verify signature
    if not xpaysafe_client.verify_webhook_signature(payload_dict, x_signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = WebhookPayload(**payload_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid payload schema: {e}")

    # Only handle PAYOUT type
    if payload.type.upper() != "PAYOUT":
        return {"message": "Ignored — not a payout event"}

    txn = await handle_webhook_update(
        db=db,
        order_id=payload.orderId,
        new_status=payload.status,
        transaction_id=payload.transactionId,
        utr=payload.utr,
        gateway_response=payload_dict,
    )

    if not txn:
        # Log but don't error — xpaysafe may retry
        return {"message": "Transaction not found, ignored"}

    return {
        "message": "Webhook processed",
        "order_id": payload.orderId,
        "status": payload.status,
    }
