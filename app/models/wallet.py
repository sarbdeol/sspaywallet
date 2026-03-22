import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    Column, String, Numeric, Boolean, DateTime,
    ForeignKey, Text, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_superadmin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    wallet = relationship("SubWallet", back_populates="user", uselist=False)

    def __repr__(self):
        return f"<User {self.username}>"


class SuperAdminWallet(Base):
    """Single master wallet owned by super admin. Funds all sub-wallets."""
    __tablename__ = "super_admin_wallet"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    balance = Column(Numeric(18, 2), default=Decimal("0.00"), nullable=False)
    currency = Column(String(10), default="INR", nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notes = Column(Text, nullable=True)

    # Relationships
    funding_transactions = relationship("FundingTransaction", back_populates="admin_wallet")

    def __repr__(self):
        return f"<SuperAdminWallet balance={self.balance} {self.currency}>"


class SubWallet(Base):
    """One wallet per user. Funded by super admin, used for payouts."""
    __tablename__ = "sub_wallets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)
    balance = Column(Numeric(18, 2), default=Decimal("0.00"), nullable=False)
    currency = Column(String(10), default="INR", nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="wallet")
    transactions = relationship("Transaction", back_populates="wallet", order_by="Transaction.created_at.desc()")
    funding_received = relationship("FundingTransaction", back_populates="sub_wallet")

    __table_args__ = (
        Index("ix_sub_wallets_user_id", "user_id"),
    )

    def __repr__(self):
        return f"<SubWallet user_id={self.user_id} balance={self.balance}>"
