"""
Seed script — run once to create the super admin account + master wallet.

Usage:
    python seed.py

Or with custom credentials:
    ADMIN_USERNAME=admin ADMIN_PASSWORD=secret123 python seed.py
"""
import asyncio
import os
from decimal import Decimal
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

# Load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:password@localhost:5432/xpay_wallet",
)

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "superadmin")
ADMIN_EMAIL    = os.getenv("ADMIN_EMAIL", "admin@xpay.local")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@123456")
ADMIN_NAME     = os.getenv("ADMIN_NAME", "Super Admin")


async def seed():
    from app.database import Base
    from app.models.wallet import User, SuperAdminWallet
    from app.models import wallet as _w, transaction as _t  # noqa: ensure tables registered
    from app.core.auth import hash_password

    engine = create_async_engine(DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✓ Tables created / verified")

    async with SessionLocal() as db:
        # Check if super admin exists
        result = await db.execute(
            select(User).where(User.username == ADMIN_USERNAME)
        )
        existing = result.scalar_one_or_none()

        if existing:
            print(f"✓ Super admin '{ADMIN_USERNAME}' already exists — skipping user creation")
        else:
            admin = User(
                username=ADMIN_USERNAME,
                email=ADMIN_EMAIL,
                full_name=ADMIN_NAME,
                hashed_password=hash_password(ADMIN_PASSWORD),
                is_superadmin=True,
                is_active=True,
            )
            db.add(admin)
            await db.flush()
            print(f"✓ Super admin created  →  username: {ADMIN_USERNAME}")
            print(f"                          password: {ADMIN_PASSWORD}")
            print(f"  ⚠  Change this password immediately after first login!")

        # Check if master wallet exists
        wallet_result = await db.execute(select(SuperAdminWallet).limit(1))
        wallet = wallet_result.scalar_one_or_none()

        if wallet:
            print(f"✓ Super admin wallet exists — balance: {wallet.balance} {wallet.currency}")
        else:
            wallet = SuperAdminWallet(
                balance=Decimal("0.00"),
                currency="INR",
                notes="Master wallet — initialised by seed script",
            )
            db.add(wallet)
            print("✓ Super admin wallet created — balance: 0.00 INR")

        await db.commit()

    await engine.dispose()
    print("\n✓ Seed complete. Run the API with:")
    print("  uvicorn app.main:app --reload")
    print("\nAPI docs:")
    print("  http://localhost:8000/docs")


if __name__ == "__main__":
    asyncio.run(seed())
