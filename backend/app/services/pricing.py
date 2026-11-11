"""Prices of the bank's own services (insurance today; anything else later).

A price is written once, in US cents. `price_in` turns it into the currency of the account that pays, with the SAME conversion and
the SAME rates as the currency exchange (`conversion.convert_amount`, rates from `rates.get_rates`), rounded UP: the bank never
charges a fraction too little. The result is then rounded up to a tidy amount for that currency (whole rubles, thousands of
rials), so a price looks like a price and not like a calculation."""

from decimal import ROUND_UP

from app.services import conversion

# Prices are rounded UP to a multiple of this many minor units: a cent, a whole ruble (100 kopecks), a thousand rials.
PRICE_STEP = {"USD": 1, "RUB": 100, "IRR": 1_000}


def price_in(rates: dict[str, float], usd_cents: int, currency: str) -> int:
    """`usd_cents` as an amount of `currency`'s minor units, rounded up to that currency's tidy step."""
    amount, _ = conversion.convert_amount(rates, "USD", currency, usd_cents, rounding=ROUND_UP)
    step = PRICE_STEP[currency]
    return -(-amount // step) * step
