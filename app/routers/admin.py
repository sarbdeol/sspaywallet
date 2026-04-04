import secrets
from decimal import Decimal
from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.database import get_db
from app.core.auth import require_superadmin, hash_password
from app.models.wallet import User, SuperAdminWallet, SubWallet
from app.models.transaction import Transaction, FundingTransaction
from app.schemas.wallet import (
    UserCreate, UserOut, WalletOut, SubWalletOut,
    SuperAdminWalletOut, FundWalletRequest, FundWalletOut, TopUpAdminWallet
)
from app.services.wallet_service import (
    get_or_create_super_admin_wallet,
    fund_sub_wallet,
    topup_admin_wallet,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


# ── Dashboard Summary ─────────────────────────────────────────────────────────

@router.get("/dashboard")
async def dashboard(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    admin_wallet = await get_or_create_super_admin_wallet(db)

    total_users = await db.execute(
        select(func.count()).select_from(User).where(User.is_superadmin == False)
    )
    total_sub_balance = await db.execute(
        select(func.coalesce(func.sum(SubWallet.balance), 0))
    )
    total_txns = await db.execute(select(func.count()).select_from(Transaction))

    return {
        "admin_wallet_balance":     float(admin_wallet.balance),
        "currency":                 admin_wallet.currency,
        "total_users":              total_users.scalar(),
        "total_sub_wallet_balance": float(total_sub_balance.scalar()),
        "total_transactions":       total_txns.scalar(),
    }


# ── Admin Wallet ──────────────────────────────────────────────────────────────

@router.get("/wallet", response_model=SuperAdminWalletOut)
async def get_admin_wallet(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    wallet = await get_or_create_super_admin_wallet(db)
    return wallet


@router.post("/wallet/topup", response_model=SuperAdminWalletOut)
async def topup_master_wallet(
    body: TopUpAdminWallet,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    wallet = await topup_admin_wallet(db, body.amount, body.note)
    return wallet


# ── User Management ───────────────────────────────────────────────────────────

@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    existing = await db.execute(
        select(User).where((User.username == body.username) | (User.email == body.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username or email already exists")

    user = User(
        username=body.username,
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        plain_password=body.password,
        is_superadmin=body.is_superadmin,
    )
    db.add(user)
    await db.flush()

    # Auto-create sub-wallet with API key
    wallet = SubWallet(user_id=user.id, balance=Decimal("0.00"), currency="INR")
    db.add(wallet)
    await db.flush()

    return user


@router.get("/users", response_model=List[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
    skip: int = 0,
    limit: int = 50,
):
    result = await db.execute(
        select(User)
        .where(User.is_superadmin == False)
        .order_by(User.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/users/{user_id}", response_model=UserOut)
async def get_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.patch("/users/{user_id}/toggle-status")
async def toggle_user_status(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    return {"user_id": str(user_id), "is_active": user.is_active}


# ── Sub-Wallet Management ─────────────────────────────────────────────────────

@router.get("/wallets", response_model=List[SubWalletOut])
async def list_sub_wallets(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
    skip: int = 0,
    limit: int = 50,
):
    result = await db.execute(
        select(SubWallet)
        .options(selectinload(SubWallet.user))
        .order_by(SubWallet.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.post("/wallets/fund", response_model=FundWalletOut, status_code=200)
async def fund_user_wallet(
    body: FundWalletRequest,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    funding_tx = await fund_sub_wallet(
        db,
        user_id=body.user_id,
        amount=body.amount,
        currency=body.currency,
        note=body.note,
    )
    return FundWalletOut(
        funding_id=funding_tx.id,
        admin_wallet_balance=funding_tx.admin_wallet_balance_after,
        sub_wallet_balance=funding_tx.sub_wallet_balance_after,
        amount_funded=funding_tx.amount,
        currency=funding_tx.currency,
        funded_at=funding_tx.created_at,
    )


@router.get("/wallets/{user_id}", response_model=SubWalletOut)
async def get_user_wallet(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    result = await db.execute(
        select(SubWallet)
        .where(SubWallet.user_id == user_id)
        .options(selectinload(SubWallet.user))
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet


@router.patch("/wallets/{user_id}/toggle-status")
async def toggle_wallet_status(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    result = await db.execute(select(SubWallet).where(SubWallet.user_id == user_id))
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    wallet.is_active = not wallet.is_active
    return {"wallet_id": str(wallet.id), "is_active": wallet.is_active}


# ── API Key Management (Admin) ────────────────────────────────────────────────

@router.get("/wallets/{user_id}/api-info")
async def get_api_info(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    """Get API key info for a user's wallet."""
    result = await db.execute(select(SubWallet).where(SubWallet.user_id == user_id))
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return {
        "wallet_id":   str(wallet.id),
        "api_key":     wallet.api_key,
        "api_enabled": wallet.api_enabled,
        "webhook_url": wallet.webhook_url,
    }


@router.patch("/wallets/{user_id}/regenerate-api-key")
async def regenerate_api_key(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    """Regenerate API key for a user. Old key stops working immediately."""
    result = await db.execute(select(SubWallet).where(SubWallet.user_id == user_id))
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    wallet.api_key = f"xpay_sk_{secrets.token_hex(24)}"
    await db.flush()

    return {
        "success":     True,
        "new_api_key": wallet.api_key,
        "message":     "API key regenerated. Old key is now invalid.",
    }


@router.patch("/wallets/{user_id}/toggle-api-access")
async def toggle_api_access(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    """Enable or disable API access for a user."""
    result = await db.execute(select(SubWallet).where(SubWallet.user_id == user_id))
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    wallet.api_enabled = not wallet.api_enabled
    return {
        "success":     True,
        "api_enabled": wallet.api_enabled,
        "message":     f"API access {'enabled' if wallet.api_enabled else 'disabled'}",
    }


# ── Funding History ───────────────────────────────────────────────────────────

@router.get("/funding-history")
async def funding_history(
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
    skip: int = 0,
    limit: int = 50,
):
    result = await db.execute(
        select(FundingTransaction)
        .order_by(FundingTransaction.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        {
            "id":                   str(r.id),
            "sub_wallet_id":        str(r.sub_wallet_id),
            "amount":               float(r.amount),
            "currency":             r.currency,
            "note":                 r.note,
            "admin_balance_before": float(r.admin_wallet_balance_before),
            "admin_balance_after":  float(r.admin_wallet_balance_after),
            "sub_balance_before":   float(r.sub_wallet_balance_before),
            "sub_balance_after":    float(r.sub_wallet_balance_after),
            "created_at":           r.created_at.isoformat(),
        }
        for r in rows
    ]


# ── User Credentials ──────────────────────────────────────────────────────────

@router.get("/users/{user_id}/credentials")
async def get_user_credentials(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "user_id":   str(user.id),
        "username":  user.username,
        "email":     user.email,
        "full_name": user.full_name,
        "password":  user.plain_password or "— not stored —",
    }


@router.patch("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
):
    from app.core.auth import hash_password as hp
    new_password = body.get("password", "").strip()
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hp(new_password)
    user.plain_password  = new_password
    return {"user_id": str(user.id), "username": user.username, "message": "Password reset successfully"}


# ── Admin Ledger ──────────────────────────────────────────────────────────────

@router.get("/ledger/{user_id}/transactions")
async def get_user_ledger(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin=Depends(require_superadmin),
    page: int = 1,
    page_size: int = 20,
    status: str = None,
    date_from: str = None,
    date_to: str = None,
):
    from datetime import timedelta, datetime

    wallet_result = await db.execute(select(SubWallet).where(SubWallet.user_id == user_id))
    wallet = wallet_result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found for this user")

    query = select(Transaction).where(Transaction.wallet_id == wallet.id)
    count_query = select(func.count()).select_from(Transaction).where(Transaction.wallet_id == wallet.id)

    if status:
        query = query.where(Transaction.status == status)
        count_query = count_query.where(Transaction.status == status)

    if date_from:
        try:
            df = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.where(Transaction.created_at >= df)
            count_query = count_query.where(Transaction.created_at >= df)
        except ValueError:
            pass

    if date_to:
        try:
            dt = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
            query = query.where(Transaction.created_at < dt)
            count_query = count_query.where(Transaction.created_at < dt)
        except ValueError:
            pass

    query = query.order_by(Transaction.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    items_result = await db.execute(query)
    count_result = await db.execute(count_query)
    txns         = items_result.scalars().all()

    return {
        "total":     count_result.scalar(),
        "page":      page,
        "page_size": page_size,
        "items": [
            {
                "order_id":         t.order_id,
                "transaction_id":   t.transaction_id,
                "gateway_ref_id":   t.gateway_ref_id,
                "utr":              t.utr,
                "amount":           float(t.amount),
                "currency":         t.currency,
                "beneficiary_name": t.beneficiary_name,
                "account_number":   t.account_number,
                "ifsc":             t.ifsc,
                "bank_name":        t.bank_name,
                "status":           t.status,
                "failure_reason":   t.failure_reason,
                "created_at":       t.created_at.isoformat(),
                "updated_at":       t.updated_at.isoformat() if t.updated_at else None,
            }
            for t in txns
        ],
    }
