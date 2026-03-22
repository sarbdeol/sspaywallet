# XPay Wallet System

A production-ready payout wallet system built on **FastAPI + PostgreSQL + Redis + Celery**,
integrated with the **xpaysafe** payout API. Supports a super admin master wallet, per-user
sub-wallets, single payouts, and bulk Excel-based payouts.

---

## Architecture

```
Super Admin Wallet  (master balance)
        │
        │  fund_wallet (API)
        ▼
  Sub Wallet (per user)
        │
   ┌────┴────┐
   │         │
Single    Bulk Upload
Payout    (Excel/CSV)
   │         │
   └────┬────┘
        ▼
  xpaysafe Payout API
  POST /transactions/payout
        │
        ▼
  Webhook Callback  →  Update transaction + refund on failure
```

---

## Quick Start

### 1. Clone & configure

```bash
git clone <your-repo>
cd xpay-wallet-system
cp .env.example .env
# Edit .env — set XPAYSAFE_API_KEY, XPAYSAFE_API_SECRET, XPAYSAFE_SALT, SECRET_KEY
```

### 2. Run with Docker (recommended)

```bash
docker-compose up --build
```

Services started:
| Service  | URL                        |
|----------|----------------------------|
| API      | http://localhost:8000      |
| API Docs | http://localhost:8000/docs |
| Flower   | http://localhost:5555      |

### 3. Seed super admin

```bash
docker-compose exec api python seed.py
# Default: username=superadmin  password=Admin@123456
```

### 4. Run without Docker

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Start PostgreSQL and Redis locally, then:
python seed.py
uvicorn app.main:app --reload

# In a separate terminal — start Celery worker:
celery -A app.workers.payout_worker.celery_app worker --loglevel=info
```

---

## API Reference

### Auth

| Method | Endpoint           | Description              |
|--------|--------------------|--------------------------|
| POST   | /api/v1/auth/login | Login → get JWT token    |
| GET    | /api/v1/auth/me    | Get current user profile |

**Login request:**
```json
{ "username": "superadmin", "password": "Admin@123456" }
```

---

### Admin Endpoints (super admin only)

| Method | Endpoint                              | Description                        |
|--------|---------------------------------------|------------------------------------|
| GET    | /api/v1/admin/dashboard               | Overview: balances + counts        |
| GET    | /api/v1/admin/wallet                  | Get master wallet balance          |
| POST   | /api/v1/admin/wallet/topup            | Top up master wallet               |
| POST   | /api/v1/admin/users                   | Create user (auto-creates wallet)  |
| GET    | /api/v1/admin/users                   | List all users                     |
| GET    | /api/v1/admin/users/{user_id}         | Get user detail                    |
| PATCH  | /api/v1/admin/users/{user_id}/toggle-status | Enable/disable user         |
| GET    | /api/v1/admin/wallets                 | List all sub-wallets               |
| GET    | /api/v1/admin/wallets/{user_id}       | Get user's wallet                  |
| POST   | /api/v1/admin/wallets/fund            | Fund a user's wallet               |
| PATCH  | /api/v1/admin/wallets/{user_id}/toggle-status | Enable/disable wallet   |
| GET    | /api/v1/admin/funding-history         | All funding transactions           |

**Fund a user wallet:**
```json
{
  "user_id": "uuid-of-user",
  "amount": 5000.00,
  "currency": "INR",
  "note": "Monthly allocation"
}
```

---

### Payout Endpoints (authenticated users)

| Method | Endpoint                                  | Description                  |
|--------|-------------------------------------------|------------------------------|
| GET    | /api/v1/payout/wallet/balance             | My wallet balance            |
| POST   | /api/v1/payout/single                     | Submit single payout         |
| POST   | /api/v1/payout/bulk                       | Upload Excel for bulk payout |
| GET    | /api/v1/payout/bulk                       | List my bulk jobs            |
| GET    | /api/v1/payout/bulk/{job_id}              | Poll bulk job status         |
| GET    | /api/v1/payout/transactions               | My transaction history       |
| GET    | /api/v1/payout/transactions/{order_id}    | Single transaction detail    |

**Single payout request:**
```json
{
  "amount": 500.00,
  "currency": "INR",
  "beneficiary": {
    "name": "Jane Doe",
    "account_number": "1234567890",
    "ifsc": "SBIN0001234",
    "bank_name": "State Bank of India"
  }
}
```

**Bulk payout:** Upload `bulk_payout_template.xlsx` as multipart/form-data.

---

### Webhook

| Method | Endpoint                      | Description                    |
|--------|-------------------------------|--------------------------------|
| POST   | /api/v1/webhook/xpaysafe      | xpaysafe status callback       |

Configure this URL in your xpaysafe dashboard.
Signature is verified before processing. On FAILED/EXPIRED → balance is auto-refunded.

---

## Excel Template

Download `bulk_payout_template.xlsx` for the correct column format.

| Column           | Required | Description                    |
|------------------|----------|--------------------------------|
| beneficiary_name | ✓        | Account holder full name       |
| account_number   | ✓        | Bank account number            |
| ifsc             | ✓        | 11-character IFSC code         |
| bank_name        |          | Bank name (optional)           |
| amount           | ✓        | Payout amount (positive)       |
| currency         |          | Default: INR                   |

Column names are **case-insensitive** and common aliases are supported
(e.g. `Account No`, `Bene Name`, `IFSC Code`).

---

## Transaction Status Flow

```
PENDING  →  SUCCESS   (webhook: payment cleared)
PENDING  →  FAILED    (webhook: bank rejected — balance refunded)
PENDING  →  EXPIRED   (webhook: timeout — balance refunded)
         →  REJECTED  (insufficient balance — never sent to gateway)
```

---

## Environment Variables

| Variable               | Description                         |
|------------------------|-------------------------------------|
| DATABASE_URL           | Async PostgreSQL URL                |
| SYNC_DATABASE_URL      | Sync PostgreSQL URL (Alembic)       |
| REDIS_URL              | Redis connection URL                |
| SECRET_KEY             | JWT signing key                     |
| XPAYSAFE_API_KEY       | From xpaysafe dashboard             |
| XPAYSAFE_API_SECRET    | From xpaysafe dashboard             |
| XPAYSAFE_SALT          | From xpaysafe dashboard             |
| CELERY_BROKER_URL      | Redis URL for Celery broker         |
| CELERY_RESULT_BACKEND  | Redis URL for task results          |

---

## Security Notes

- All payout endpoints require JWT Bearer authentication.
- Admin endpoints require `is_superadmin=True`.
- Wallet balance deductions use PostgreSQL `SELECT FOR UPDATE` row-level locks.
- Webhook signatures are verified via HMAC-SHA256 before any processing.
- Failed/expired payouts automatically refund the user's wallet.
- Insufficient balance returns `HTTP 400` immediately — no gateway call made.
