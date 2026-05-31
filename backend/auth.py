import hashlib
import hmac
import os


HASH_NAME = "pbkdf2_sha256"
HASH_ITERATIONS = 260_000


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
