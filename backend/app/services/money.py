from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


def amount_to_cents(value: str | int | float | Decimal) -> int:
    try:
        amount = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError) as exc:
        raise ValueError("Invalid amount") from exc

    if amount < 0:
        raise ValueError("Amount cannot be negative")

    cents = (amount * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(cents)


def cents_to_amount(cents: int) -> str:
    amount = Decimal(cents) / Decimal("100")
    text = f"{amount:.2f}"
    return text.rstrip("0").rstrip(".") if "." in text else text
