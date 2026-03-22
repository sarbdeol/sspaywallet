from decimal import Decimal
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, field_validator
from app.models.transaction import TransactionStatus, BulkJobStatus


# ── Beneficiary ───────────────────────────────────────────────────────────────

class BeneficiaryDetails(BaseModel):
    name: str
    account_number: str
    ifsc: str
    bank_name: Optional[str] = None


# ── Single payout ─────────────────────────────────────────────────────────────

class SinglePayoutRequest(BaseModel):
    amount: Decimal
    currency: str = "INR"
    beneficiary: BeneficiaryDetails

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        # Force 2 decimal places — xpaysafe requires float not int
        return Decimal(str(float(v)))

class PayoutOut(BaseModel):
    id: UUID
    order_id: str
    transaction_id: Optional[str]
    amount: Decimal
    currency: str
    status: TransactionStatus
    beneficiary_name: str
    account_number: str
    ifsc: str
    bank_name: Optional[str]
    utr: Optional[str]
    failure_reason: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Bulk payout ───────────────────────────────────────────────────────────────

class BulkPayoutRowResult(BaseModel):
    row: int
    order_id: Optional[str]
    beneficiary_name: str
    account_number: str
    amount: Decimal
    status: str
    reason: Optional[str] = None


class BulkPayoutJobOut(BaseModel):
    id: UUID
    filename: Optional[str]
    total_rows: int
    success_count: int
    failed_count: int
    skipped_count: int
    total_amount: Decimal
    status: BulkJobStatus
    celery_task_id: Optional[str]
    error_log: Optional[List[dict]]
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ── Transaction list ──────────────────────────────────────────────────────────

class TransactionListOut(BaseModel):
    items: List[PayoutOut]
    total: int
    page: int
    page_size: int


# ── Webhook payload ───────────────────────────────────────────────────────────

class WebhookPayload(BaseModel):
    orderId: str
    transactionId: str
    status: str
    amount: Decimal
    currency: str
    type: str
    utr: Optional[str] = None
    timestamp: int
