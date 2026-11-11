"""Which currencies accounts can hold, and everything that differs between them.

Money is always an integer in the currency's MINOR unit: cents for USD, kopecks for RUB, and the rial itself for
IRR (the rial has no practical subunit). Limits below are in minor units and are roughly equivalent in value
(about $50 / $1,000 / $1,000,000), so a rule feels the same whichever currency the account holds.
"""

SUPPORTED = ("USD", "RUB", "IRR")

MINOR_DIGITS = {"USD": 2, "RUB": 2, "IRR": 0}

# Payments of at least this much need a one-time SMS code (about $50).
OTP_THRESHOLD = {"USD": 5_000, "RUB": 400_000, "IRR": 90_000_000}

# Largest single transfer (about $1,000,000).
MAX_TRANSFER = {"USD": 100_000_000, "RUB": 8_000_000_000, "IRR": 1_800_000_000_000}

# DEMO ONLY: the simulated card purchase limit (about $1,000) and one demo top-up (about $1,000).
MAX_PURCHASE = {"USD": 100_000, "RUB": 8_000_000, "IRR": 1_800_000_000}
MAX_DEMO_DEPOSIT = {"USD": 100_000, "RUB": 8_000_000, "IRR": 1_800_000_000}

SYMBOLS = {"USD": "$", "RUB": "₽", "IRR": "IRR "}


def is_supported(currency: str) -> bool:
    return currency in SUPPORTED


def system_account_number(kind: str, currency: str) -> str:
    """Numbers of the bank's own accounts: kind is RESERVE, MERCHANTS or FX."""
    return f"SYSTEM-{kind}-{currency}"
