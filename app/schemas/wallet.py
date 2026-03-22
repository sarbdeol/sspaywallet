from decimal import Decimal
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, field_validator


# ── User schemas ────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    password: str
    is_superadmin: bool = False


class UserOut(BaseModel):
    id: UUID
    username: str
    email: str
    full_name: Optional[str]
    is_active: bool
    is_superadmin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Auth schemas ─────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Wallet schemas ────────────────────────────────────────────────────────────

class WalletOut(BaseModel):
    id: UUID
    balance: Decimal
    currency: str
    is_active: bool
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


class SubWalletOut(WalletOut):
    user_id: UUID
    user: Optional[UserOut] = None


class SuperAdminWalletOut(WalletOut):
    notes: Optional[str]


# ── Admin: fund a sub-wallet ──────────────────────────────────────────────────

class FundWalletRequest(BaseModel):
    user_id: UUID
    amount: Decimal
    currency: str = "INR"
    note: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def amount_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Amount must be greater than zero")
        return v


class FundWalletOut(BaseModel):
    funding_id: UUID
    admin_wallet_balance: Decimal
    sub_wallet_balance: Decimal
    amount_funded: Decimal
    currency: str
    funded_at: datetime

    model_config = {"from_attributes": True}


# ── Admin: top-up master wallet ───────────────────────────────────────────────

class TopUpAdminWallet(BaseModel):
    amount: Decimal
    currency: str = "INR"
    note: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def amount_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Amount must be greater than zero")
        return v
