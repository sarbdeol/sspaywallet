import io
from decimal import Decimal, InvalidOperation
from typing import List, Tuple
import pandas as pd
from fastapi import HTTPException


REQUIRED_FIELDS = ["beneficiary_name", "account_number", "ifsc", "amount"]
OPTIONAL_FIELDS = ["bank_name", "currency"]
ALL_FIELDS = REQUIRED_FIELDS + OPTIONAL_FIELDS


def get_excel_headers(file_bytes: bytes, filename: str) -> List[str]:
    """Read only the headers from uploaded file — for column mapping UI."""
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes), nrows=0)
        else:
            df = pd.read_excel(io.BytesIO(file_bytes), nrows=0)
        return [str(c).strip() for c in df.columns.tolist()]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot read file headers: {exc}")


def parse_bulk_excel_with_mapping(
    file_bytes: bytes,
    filename: str,
    mapping: dict,  # e.g. {"A Column": "beneficiary_name", "B Column": "amount", ...}
) -> List[dict]:
    """
    Parse Excel using user-provided column mapping.
    mapping = { excel_column_name: our_field_name }
    """
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes))
        else:
            df = pd.read_excel(io.BytesIO(file_bytes))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Cannot read file: {exc}")

    if df.empty:
        raise HTTPException(status_code=400, detail="File is empty")

    # Validate mapping covers all required fields
    mapped_fields = set(mapping.values())
    missing = set(REQUIRED_FIELDS) - mapped_fields
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Mapping missing required fields: {', '.join(sorted(missing))}"
        )

    # Reverse mapping: our_field → excel_column
    reverse = {v: k for k, v in mapping.items()}

    rows = []
    for idx, row in df.iterrows():
        r = {
            "row": int(idx) + 2,
            "beneficiary_name": str(row.get(reverse.get("beneficiary_name", ""), "")).strip(),
            "account_number":   str(row.get(reverse.get("account_number",   ""), "")).strip(),
            "ifsc":             str(row.get(reverse.get("ifsc",             ""), "")).strip().upper(),
            "bank_name":        str(row.get(reverse.get("bank_name",        ""), "")).strip() if "bank_name"  in reverse else "",
            "currency":         str(row.get(reverse.get("currency",         ""), "INR")).strip().upper() if "currency" in reverse else "INR",
        }

        # Validate amount
        raw_amount = row.get(reverse.get("amount", ""), None)
        try:
            r["amount"] = Decimal(str(raw_amount)).quantize(Decimal("0.01"))
            if r["amount"] <= 0:
                raise ValueError("must be positive")
        except (InvalidOperation, ValueError, TypeError):
            r["amount"] = None
            r["error"] = f"Invalid amount: '{raw_amount}'"

        # Field validation
        if "error" not in r:
            if not r["beneficiary_name"] or r["beneficiary_name"] == "nan":
                r["error"] = "beneficiary_name is empty"
            elif not r["account_number"] or r["account_number"] == "nan":
                r["error"] = "account_number is empty"
            elif not r["ifsc"] or r["ifsc"] == "NAN" or len(r["ifsc"]) < 6:
                r["error"] = "ifsc is invalid"

        rows.append(r)

    return rows


def split_valid_invalid(rows: List[dict]) -> Tuple[List[dict], List[dict]]:
    valid   = [r for r in rows if "error" not in r and r.get("amount")]
    invalid = [r for r in rows if "error" in r or not r.get("amount")]
    return valid, invalid