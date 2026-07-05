import hashlib
import hmac
import base64
import json
import os
import time

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import AppRole, AppUser


HASH_NAME = "pbkdf2_sha256"
HASH_ITERATIONS = 260_000
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14
TOKEN_SECRET = os.getenv("RED_PACKET_TOKEN_SECRET", "red-packet-local-dev-secret")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, HASH_ITERATIONS)
    return f"{HASH_NAME}${HASH_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        name, iterations, salt_hex, digest_hex = password_hash.split("$", 3)
        if name != HASH_NAME:
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations))
    except (ValueError, TypeError):
        return False

    return hmac.compare_digest(digest.hex(), digest_hex)


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def create_access_token(user: AppUser) -> str:
    payload = {
        "sub": user.id,
        "role": user.role,
        "exp": int(time.time()) + TOKEN_TTL_SECONDS,
    }
    body = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(TOKEN_SECRET.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{_b64encode(signature)}"


def decode_access_token(token: str) -> dict:
    try:
        body, signature = token.split(".", 1)
        expected = hmac.new(TOKEN_SECRET.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64decode(signature), expected):
            raise ValueError("bad signature")

        payload = json.loads(_b64decode(body))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("expired")
        return payload
    except (ValueError, TypeError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="Invalid or expired token") from None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> AppUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing token")

    payload = decode_access_token(credentials.credentials)
    user = db.scalar(select(AppUser).where(AppUser.id == payload.get("sub")))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User is not active")
    return user


def require_admin(current_user: AppUser = Depends(get_current_user)) -> AppUser:
    if current_user.role not in {AppRole.admin.value, AppRole.super_admin.value}:
        raise HTTPException(status_code=403, detail="Admin permission required")
    return current_user


def require_super_admin(current_user: AppUser = Depends(get_current_user)) -> AppUser:
    if current_user.role != AppRole.super_admin.value:
        raise HTTPException(status_code=403, detail="Super admin permission required")
    return current_user
