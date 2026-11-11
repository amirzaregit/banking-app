"""Phone numbers and names: normalizing and masking. Pure functions, no database."""

import phonenumbers

from app.core.config import settings


def normalize_phone(raw: str) -> str | None:
    """Any human format -> E.164 ("+79123456789"), or None if it isn't a real number.

    "8 (912) 345-67-89", "912 345 67 89" and "+7 912 345-67-89" all give the same result.
    Numbers without a country code are read as settings.default_phone_region.
    """
    try:
        parsed = phonenumbers.parse(raw, settings.default_phone_region)
    except phonenumbers.NumberParseException:
        return None
    if not phonenumbers.is_valid_number(parsed):
        return None
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def mask_phone(e164: str) -> str:
    """"+79123456789" -> "+7••••••6789": enough to recognise, not enough to copy."""
    return e164[:2] + "•" * (len(e164) - 6) + e164[-4:]


def mask_name(full_name: str) -> str:
    """"Ivan Ivanovich Petrov" -> "Ivan Ivanovich P." (the style FPS uses).

    Everything but the last word is shown; the last word is cut to an initial.
    """
    words = full_name.split()
    if len(words) <= 1:
        return full_name.strip()
    return " ".join(words[:-1]) + f" {words[-1][0].upper()}."
