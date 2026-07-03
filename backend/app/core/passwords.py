from fastapi import HTTPException

PASSWORD_PATTERN = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{};':\"\\|,.<>/?`~")


def validate_password_value(password: str) -> None:
    if not 6 <= len(password) <= 20:
        raise HTTPException(status_code=400, detail="Password must be 6 to 20 characters")
    if any(char not in PASSWORD_PATTERN for char in password):
        raise HTTPException(status_code=400, detail="Password only supports ASCII letters, numbers and common symbols")
