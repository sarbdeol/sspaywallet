"""
Public Payout API — authenticated via x-api-key header.

Endpoints:
  POST   /api/v1/public/payout         — create a payout
  GET    /api/v1/public/payout/status/{order_id} — check status
  GET    /api/v1/public/balance        — get wallet balance
  POST   /api/v1/public/webhook-test   — test webhook delivery
"""

import uuid
import hmac
import hashlib
import json
import httpx
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, field_validator

from app.database import get_db
from app.models.wallet import SubWallet
from app.models.transaction import Transaction, TransactionStatus
from app.services.payout_service import (
    create_single_payout,
    get_transaction_by_order_id,
    list_wallet_transactions,
)

router = APIRouter(prefix="/public", tags=["Public API"])


# ── Auth helper ───────────────────────────────────────────────────────────────

async def get_wallet_by_api_key(
    x_api_key: str = Header(..., description="Your API key"),
    db: AsyncSession = Depends(get_db),
) -> SubWallet:
    """Authenticate using x-api-key header. Returns the matching SubWallet."""
    result = await db.execute(
        select(SubWallet).where(SubWallet.api_key == x_api_key)
    )
    wallet = result.scalar_one_or_none()

    if not wallet:
        raise HTTPException(status_code=401, detail="Invalid API key")

    if not wallet.is_active:
        raise HTTPException(status_code=403, detail="Wallet is disabled. Contact support.")

    if not wallet.api_enabled:
        raise HTTPException(status_code=403, detail="API access is disabled for this wallet. Contact admin.")

    return wallet


# ── Schemas ───────────────────────────────────────────────────────────────────

class PublicBeneficiary(BaseModel):
    name: str
    account_number: str
    ifsc: str
    bank_name: str


class PublicPayoutRequest(BaseModel):
    amount: Decimal
    currency: str = "INR"
    beneficiary: PublicBeneficiary
    webhook_url: Optional[str] = None   # override default webhook URL for this request
    client_reference_id: Optional[str] = None  # user's own reference ID

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        return Decimal(str(float(v)))


class PublicPayoutResponse(BaseModel):
    success: bool
    order_id: str
    client_reference_id: Optional[str]
    status: str
    amount: float
    currency: str
    beneficiary_name: str
    account_number: str
    ifsc: str
    bank_name: Optional[str]
    message: str


class PublicStatusResponse(BaseModel):
    success: bool
    order_id: str
    status: str
    amount: float
    currency: str
    utr: Optional[str]
    failure_reason: Optional[str]
    created_at: str
    updated_at: Optional[str]


# ── POST /public/payout ────────────────────────────────────────────────────────

@router.post("/payout", response_model=PublicPayoutResponse, status_code=201)
async def create_public_payout(
    body: PublicPayoutRequest,
    wallet: SubWallet = Depends(get_wallet_by_api_key),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a payout from your wallet.

    - Deducts amount from your wallet balance
    - Sends payout via xpaysafe gateway
    - Fires webhook to your configured URL (or override per-request)
    - Refunds automatically on gateway failure
    """
    txn = await create_single_payout(
        db=db,
        wallet=wallet,
        amount=body.amount,
        currency=body.currency,
        beneficiary_name=body.beneficiary.name,
        account_number=body.beneficiary.account_number,
        ifsc=body.beneficiary.ifsc,
        bank_name=body.beneficiary.bank_name,
    )

    # Store client_reference_id in gateway_ref_id field if provided
    if body.client_reference_id and not txn.gateway_ref_id:
        txn.gateway_ref_id = body.client_reference_id
        await db.flush()

    return PublicPayoutResponse(
        success=True,
        order_id=txn.order_id,
        client_reference_id=body.client_reference_id,
        status=txn.status.value,
        amount=float(txn.amount),
        currency=txn.currency,
        beneficiary_name=txn.beneficiary_name,
        account_number=txn.account_number,
        ifsc=txn.ifsc,
        bank_name=txn.bank_name,
        message="Payout initiated successfully. You will receive a webhook when it is confirmed.",
    )


# ── GET /public/payout/status/{order_id} ──────────────────────────────────────

@router.get("/payout/status/{order_id}", response_model=PublicStatusResponse)
async def get_payout_status(
    order_id: str,
    wallet: SubWallet = Depends(get_wallet_by_api_key),
    db: AsyncSession = Depends(get_db),
):
    """Check the current status of a payout by order_id."""
    txn = await get_transaction_by_order_id(db, order_id)

    # Ensure this transaction belongs to the calling wallet
    if txn.wallet_id != wallet.id:
        raise HTTPException(status_code=403, detail="Transaction not found")

    return PublicStatusResponse(
        success=True,
        order_id=txn.order_id,
        status=txn.status.value,
        amount=float(txn.amount),
        currency=txn.currency,
        utr=txn.utr,
        failure_reason=txn.failure_reason,
        created_at=txn.created_at.isoformat(),
        updated_at=txn.updated_at.isoformat() if txn.updated_at else None,
    )


# ── GET /public/balance ────────────────────────────────────────────────────────

@router.get("/balance")
async def get_public_balance(
    wallet: SubWallet = Depends(get_wallet_by_api_key),
):
    """Get current wallet balance."""
    return {
        "success": True,
        "balance": float(wallet.balance),
        "currency": wallet.currency,
        "wallet_id": str(wallet.id),
    }


# ── GET /public/transactions ───────────────────────────────────────────────────

@router.get("/transactions")
async def get_public_transactions(
    wallet: SubWallet = Depends(get_wallet_by_api_key),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """List your payout transactions with optional filters."""
    items, total = await list_wallet_transactions(
        db, wallet.id, page, page_size, status, date_from, date_to
    )
    return {
        "success": True,
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "order_id":         t.order_id,
                "amount":           float(t.amount),
                "currency":         t.currency,
                "status":           t.status.value,
                "beneficiary_name": t.beneficiary_name,
                "account_number":   t.account_number,
                "ifsc":             t.ifsc,
                "bank_name":        t.bank_name,
                "utr":              t.utr,
                "failure_reason":   t.failure_reason,
                "created_at":       t.created_at.isoformat(),
                "updated_at":       t.updated_at.isoformat() if t.updated_at else None,
            }
            for t in items
        ],
    }


# ── POST /public/webhook-test ──────────────────────────────────────────────────

@router.post("/webhook-test")
async def test_webhook(
    body: dict,
    wallet: SubWallet = Depends(get_wallet_by_api_key),
):
    """
    Send a test webhook to your configured webhook URL.
    Use this to verify your server is correctly receiving and verifying webhooks.
    """
    target_url = body.get("webhook_url") or wallet.webhook_url
    if not target_url:
        raise HTTPException(
            status_code=400,
            detail="No webhook URL. Set one in your dashboard or pass webhook_url in request body."
        )

    test_payload = {
        "event":        "payout.test",
        "order_id":     f"TEST-{uuid.uuid4().hex[:8].upper()}",
        "status":       "SUCCESS",
        "amount":       100.00,
        "currency":     "INR",
        "utr":          f"TEST{uuid.uuid4().hex[:9].upper()}",
        "timestamp":    __import__("time").time(),
    }

    # Sign with api_key as secret
    signature = hmac.new(
        wallet.api_key.encode(),
        json.dumps(test_payload, sort_keys=True).encode(),
        hashlib.sha256
    ).hexdigest()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                target_url,
                json=test_payload,
                headers={
                    "Content-Type":       "application/json",
                    "X-XPay-Signature":   signature,
                    "X-XPay-Event":       "payout.test",
                },
            )
        return {
            "success":    True,
            "message":    "Test webhook delivered",
            "target_url": target_url,
            "http_status": resp.status_code,
            "payload":    test_payload,
            "signature":  signature,
        }
    except Exception as e:
        return {
            "success":    False,
            "message":    f"Webhook delivery failed: {str(e)}",
            "target_url": target_url,
            "payload":    test_payload,
            "signature":  signature,
        }


# ── GET /public/api-info — user views their own API key ───────────────────────

@router.get("/api-info")
async def get_my_api_info(
    wallet: SubWallet = Depends(get_wallet_by_api_key),
):
    """Get your API key info and webhook URL. Requires x-api-key auth."""
    return {
        "success":     True,
        "api_key":     wallet.api_key,
        "api_enabled": wallet.api_enabled,
        "webhook_url": wallet.webhook_url,
        "wallet_id":   str(wallet.id),
    }


# ── GET /public/api-info-jwt — user views key via JWT (for dashboard) ─────────

from app.core.auth import get_current_user
from app.models.wallet import User

@router.get("/my-api-info")
async def get_my_api_info_jwt(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get API key info via JWT — used by the dashboard frontend."""
    from app.services.wallet_service import get_sub_wallet_by_user
    wallet = await get_sub_wallet_by_user(db, current_user.id)
    return {
        "success":     True,
        "api_key":     wallet.api_key,
        "api_enabled": wallet.api_enabled,
        "webhook_url": wallet.webhook_url,
        "wallet_id":   str(wallet.id),
    }


# ── PATCH /public/webhook-url — user saves their webhook URL ──────────────────

@router.patch("/webhook-url")
async def update_my_webhook_url(
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save webhook URL via JWT — used by the dashboard frontend."""
    from app.services.wallet_service import get_sub_wallet_by_user
    webhook_url = body.get("webhook_url", "").strip()
    wallet = await get_sub_wallet_by_user(db, current_user.id)
    wallet.webhook_url = webhook_url or None
    await db.flush()
    return {"success": True, "webhook_url": wallet.webhook_url}
