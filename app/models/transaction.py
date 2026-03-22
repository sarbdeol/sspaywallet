import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    Column, String, Numeric, DateTime,
    ForeignKey, Text, Integer, JSON, Index, Enum
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum
from app.database import Base


class TransactionStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    EXPIRED = "EXPIRED"
    REJECTED = "REJECTED"   # insufficient balance


class BulkJobStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    PARTIAL = "PARTIAL"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class Transaction(Base):
    """Every payout attempt by a sub-wallet user."""
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wallet_id = Column(UUID(as_uuid=True), ForeignKey("sub_wallets.id"), nullable=False)
    bulk_job_id = Column(UUID(as_uuid=True), ForeignKey("bulk_payout_jobs.id"), nullable=True)

    # Order tracking
    order_id = Column(String(100), unique=True, nullable=False, index=True)
    transaction_id = Column(String(200), nullable=True, index=True)  # from xpaysafe
    gateway_ref_id = Column(String(200), nullable=True)
    utr = Column(String(200), nullable=True)                          # bank UTR on success

    # Amounts
    amount = Column(Numeric(18, 2), nullable=False)
    currency = Column(String(10), default="INR", nullable=False)

    # Beneficiary details (stored per-transaction for audit trail)
    beneficiary_name = Column(String(255), nullable=False)
    account_number = Column(String(50), nullable=False)
    ifsc = Column(String(20), nullable=False)
    bank_name = Column(String(255), nullable=True)

    # Status
    status = Column(
        Enum(TransactionStatus),
        default=TransactionStatus.PENDING,
        nullable=False,
        index=True
    )
    failure_reason = Column(Text, nullable=True)
    raw_gateway_response = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    wallet = relationship("SubWallet", back_populates="transactions")
    bulk_job = relationship("BulkPayoutJob", back_populates="transactions")

    __table_args__ = (
        Index("ix_transactions_wallet_status", "wallet_id", "status"),
        Index("ix_transactions_created_at", "created_at"),
    )

    def __repr__(self):
        return f"<Transaction {self.order_id} {self.status} {self.amount}>"


class BulkPayoutJob(Base):
    """Tracks an Excel-based bulk payout batch."""
    __tablename__ = "bulk_payout_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wallet_id = Column(UUID(as_uuid=True), ForeignKey("sub_wallets.id"), nullable=False)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    filename = Column(String(500), nullable=True)
    total_rows = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    skipped_count = Column(Integer, default=0)   # rejected due to insufficient balance
    total_amount = Column(Numeric(18, 2), default=Decimal("0.00"))

    status = Column(
        Enum(BulkJobStatus),
        default=BulkJobStatus.QUEUED,
        nullable=False,
        index=True
    )
    celery_task_id = Column(String(200), nullable=True)
    error_log = Column(JSON, nullable=True)      # per-row errors list

    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    transactions = relationship("Transaction", back_populates="bulk_job")

    def __repr__(self):
        return f"<BulkPayoutJob {self.id} {self.status} rows={self.total_rows}>"


class FundingTransaction(Base):
    """Super admin funding a sub-wallet."""
    __tablename__ = "funding_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_wallet_id = Column(UUID(as_uuid=True), ForeignKey("super_admin_wallet.id"), nullable=False)
    sub_wallet_id = Column(UUID(as_uuid=True), ForeignKey("sub_wallets.id"), nullable=False)

    amount = Column(Numeric(18, 2), nullable=False)
    currency = Column(String(10), default="INR", nullable=False)
    note = Column(Text, nullable=True)

    admin_wallet_balance_before = Column(Numeric(18, 2), nullable=False)
    admin_wallet_balance_after = Column(Numeric(18, 2), nullable=False)
    sub_wallet_balance_before = Column(Numeric(18, 2), nullable=False)
    sub_wallet_balance_after = Column(Numeric(18, 2), nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    admin_wallet = relationship("SuperAdminWallet", back_populates="funding_transactions")
    sub_wallet = relationship("SubWallet", back_populates="funding_received")

    def __repr__(self):
        return f"<FundingTransaction {self.amount} to sub_wallet={self.sub_wallet_id}>"
