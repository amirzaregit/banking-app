from app.services.currencies import MINOR_DIGITS, SYMBOLS


def format_money(amount: int, currency: str = "USD") -> str:
    """Integer minor units -> "$1,234.50" / "₽1,234.50" / "IRR 1,234,500". Integer math only: no floating-point surprises."""
    sign = "-" if amount < 0 else ""
    digits = MINOR_DIGITS.get(currency, 2)
    symbol = SYMBOLS.get(currency, f"{currency} ")
    if digits == 0:
        return f"{sign}{symbol}{abs(amount):,}"
    whole, rest = divmod(abs(amount), 10**digits)
    return f"{sign}{symbol}{whole:,}.{rest:0{digits}d}"
