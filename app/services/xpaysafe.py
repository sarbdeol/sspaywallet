import hashlib
import hmac as hmac_lib
import base64
import json
import time
import uuid
from typing import Any, Dict
import httpx
from app.config import settings


def _deep_sort(obj: Any) -> Any:
    """Recursively sort dict keys alphabetically — required by xpaysafe."""
    if isinstance(obj, dict):
        return {k: _deep_sort(v) for k, v in sorted(obj.items())}
    if isinstance(obj, list):
        return [_deep_sort(item) for item in obj]
    return obj


def _build_signature(payload: dict) -> str:
    """Generate HMAC-SHA256 base64 signature over recursively sorted payload."""
    sorted_payload = _deep_sort(payload)
    payload_str = json.dumps(sorted_payload, separators=(",", ":"))
    key = (settings.XPAYSAFE_API_SECRET + settings.XPAYSAFE_SALT).encode("utf-8")
    sig = hmac_lib.new(key, payload_str.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(sig).decode("utf-8")


class XpaySafeClient:
    def __init__(self):
        self.base_url = settings.XPAYSAFE_BASE_URL
        self.timeout = httpx.Timeout(30.0)

    def _get_headers_and_sign(self, payload: dict) -> tuple[dict, dict]:
        """
        Add timestamp to payload, then sign the complete payload.
        Returns (headers, signed_payload).
        IMPORTANT: timestamp must be IN the payload before signing.
        """
        ts = int(time.time())

        # Add timestamp INTO payload before signing
        signed_payload = {**payload, "timestamp": ts}

        signature = _build_signature(signed_payload)

        headers = {
            "Content-Type": "application/json",
            "X-API-Key":    settings.XPAYSAFE_API_KEY,
            "X-Signature":  signature,
            "X-Timestamp":  str(ts),
        }
        return headers, signed_payload

    async def initiate_payout(
        self,
        amount: float,
        currency: str,
        beneficiary_name: str,
        account_number: str,
        ifsc: str,
        bank_name: str,
        order_id: str = None,
    ) -> Dict[str, Any]:
        """POST /transactions/payout"""
        order_id = order_id or f"PAYOUT-{uuid.uuid4().hex[:12].upper()}"

        # Build payload WITHOUT timestamp first
        payload = {
            "orderId": order_id,
            "amount": round(float(amount), 2),
            "currency": currency,
            "beneficiary_details": {
                "account_number": account_number,
                "bank_name": bank_name or "",
                "ifsc": ifsc,
                "name": beneficiary_name,
            },
        }

        # _get_headers_and_sign adds timestamp and signs
        headers, signed_payload = self._get_headers_and_sign(payload)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/transactions/payout",
                content=json.dumps(_deep_sort(signed_payload), separators=(",", ":")),
                headers=headers,
            )

            if resp.status_code == 401:
                raise Exception(
                    f"401 Unauthorized — check XPAYSAFE_API_KEY, XPAYSAFE_API_SECRET, XPAYSAFE_SALT in your .env"
                )

            resp.raise_for_status()
            return {"order_id": order_id, "response": resp.json()}

    async def check_status(self, transaction_id: str) -> Dict[str, Any]:
        """POST /transactions/status"""
        payload = {"transactionId": transaction_id}
        headers, signed_payload = self._get_headers_and_sign(payload)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                f"{self.base_url}/transactions/status",
                content=json.dumps(_deep_sort(signed_payload), separators=(",", ":")),
                headers=headers,
            )
            resp.raise_for_status()
            return resp.json()

    def verify_webhook_signature(self, payload: dict, received_signature: str) -> bool:
        """Verify incoming webhook from xpaysafe."""
        expected = _build_signature(payload)
        return hmac_lib.compare_digest(expected, received_signature)


xpaysafe_client = XpaySafeClient()