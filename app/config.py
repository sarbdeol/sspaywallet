from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "XPay Wallet System"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/xpay_wallet"
    SYNC_DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/xpay_wallet"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # xpaysafe
    XPAYSAFE_BASE_URL: str = "https://xpaysafe-backend.onrender.com/api/v1"
    XPAYSAFE_API_KEY: str = ""
    XPAYSAFE_API_SECRET: str = ""
    XPAYSAFE_SALT: str = ""

    # JWT
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    ALGORITHM: str = "HS256"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
