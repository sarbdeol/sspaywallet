from decimal import Decimal
from uuid import UUID
from datetime import datetime
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.wallet import User, SuperAdminWallet, SubWallet
from app.models.transaction import FundingTransaction


async def get_or_create_super_admin_wallet(db: AsyncSession) -> SuperAdminWallet:
    """Super admin has exactly ONE wallet. Create if not exists."""
    result = await db.execute(select(SuperAdminWallet).limit(1))
    wallet = result.scalar_one_or_none()
    if not wallet:
        wallet = SuperAdminWallet(balance=Decimal("0.00"), currency="INR")
        db.add(wallet)
        await db.flush()
    return wallet


async def get_sub_wallet_by_user(db: AsyncSession, user_id: UUID) -> SubWallet:
    result = await db.execute(
        select(SubWallet)
        .where(SubWallet.user_id == user_id)
        .options(selectinload(SubWallet.user))
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found for this user")
    return wallet


async def get_sub_wallet_locked(db: AsyncSession, wallet_id: UUID) -> SubWallet:
    """Select with FOR UPDATE lock — prevents double-spend race conditions."""
    result = await db.execute(
        select(SubWallet)
        .where(SubWallet.id == wallet_id)
        .with_for_update()
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    if not wallet.is_active:
        raise HTTPException(status_code=403, detail="Wallet is disabled")
    return wallet


async def topup_admin_wallet(
    db: AsyncSession,
    amount: Decimal,
    note: str = None,
) -> SuperAdminWallet:
    """Credit the master wallet (manual top-up by super admin)."""
    result = await db.execute(
        select(SuperAdminWallet).with_for_update().limit(1)
    )
    wallet = result.scalar_one_or_none()
    if not wallet:
        wallet = SuperAdminWallet(balance=Decimal("0.00"), currency="INR")
        db.add(wallet)

    wallet.balance += amount
    if note:
        wallet.notes = note
    wallet.updated_at = datetime.utcnow()
    await db.flush()
    return wallet


async def fund_sub_wallet(
    db: AsyncSession,
    user_id: UUID,
    amount: Decimal,
    currency: str = "INR",
    note: str = None,
) -> FundingTransaction:
    """
    Transfer from super admin wallet → sub wallet.
    Both rows locked to prevent race conditions.
    """
    # Lock admin wallet
    admin_result = await db.execute(
        select(SuperAdminWallet).with_for_update().limit(1)
    )
    admin_wallet = admin_result.scalar_one_or_none()
    if not admin_wallet:
        raise HTTPException(status_code=500, detail="Admin wallet not initialised")

    if admin_wallet.balance < amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient admin balance. Available: {admin_wallet.balance} {admin_wallet.currency}",
        )

    # Lock sub wallet
    sub_result = await db.execute(
        select(SubWallet).where(SubWallet.user_id == user_id).with_for_update()
    )
    sub_wallet = sub_result.scalar_one_or_none()
    if not sub_wallet:
        raise HTTPException(status_code=404, detail="Sub wallet not found for this user")
    if not sub_wallet.is_active:
        raise HTTPException(status_code=403, detail="Sub wallet is disabled")

    # Record balances before
    admin_before = admin_wallet.balance
    sub_before = sub_wallet.balance

    # Transfer
    admin_wallet.balance -= amount
    sub_wallet.balance += amount
    admin_wallet.updated_at = datetime.utcnow()
    sub_wallet.updated_at = datetime.utcnow()

    # Audit record
    funding_tx = FundingTransaction(
        admin_wallet_id=admin_wallet.id,
        sub_wallet_id=sub_wallet.id,
        amount=amount,
        currency=currency,
        note=note,
        admin_wallet_balance_before=admin_before,
        admin_wallet_balance_after=admin_wallet.balance,
        sub_wallet_balance_before=sub_before,
        sub_wallet_balance_after=sub_wallet.balance,
    )
    db.add(funding_tx)
    await db.flush()
    return funding_tx


async def deduct_balance(
    db: AsyncSession,
    wallet_id: UUID,
    amount: Decimal,
) -> SubWallet:
    """
    Deduct payout amount from sub-wallet with lock.
    Raises 400 if insufficient balance.
    """
    wallet = await get_sub_wallet_locked(db, wallet_id)

    if wallet.balance < amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient wallet balance. Available: {wallet.balance}, Requested: {amount}",
        )

    wallet.balance -= amount
    wallet.updated_at = datetime.utcnow()
    await db.flush()
    return wallet


async def refund_balance(
    db: AsyncSession,
    wallet_id: UUID,
    amount: Decimal,
) -> SubWallet:
    """Refund amount back to wallet on payout failure."""
    result = await db.execute(
        select(SubWallet).where(SubWallet.id == wallet_id).with_for_update()
    )
    wallet = result.scalar_one_or_none()
    if wallet:
        wallet.balance += amount
        wallet.updated_at = datetime.utcnow()
        await db.flush()
    return wallet
