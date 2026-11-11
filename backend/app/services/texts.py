"""Texts the SERVER itself must write (the SMS), in the user's language.

Everything else is translated in the app from stable error codes and notification kinds.
"""

SUPPORTED = ("en", "ru", "fa")


def pick_language(accept_language: str | None) -> str:
    """Best supported language from an Accept-Language header ("fa-IR,fa;q=0.9,en;q=0.8"); default English."""
    if not accept_language:
        return "en"
    ranked: list[tuple[float, str]] = []
    for part in accept_language.split(","):
        tag, _, q = part.strip().partition(";q=")
        try:
            weight = float(q) if q else 1.0
        except ValueError:
            weight = 0.0
        ranked.append((weight, tag.strip().lower().split("-")[0]))
    for _, lang in sorted(ranked, key=lambda item: -item[0]):
        if lang in SUPPORTED:
            return lang
    return "en"


def otp_sms(lang: str, code: str, amount: str, recipient: str) -> str:
    # rstrip('.'): masked names end in a dot ("Bob T."), and we add exactly one sentence-ending dot.
    who = recipient.rstrip(".")
    if lang == "ru":
        return f"Код Banking Demo: {code}. Подтверждает перевод {amount} получателю {who}. Никому не сообщайте этот код."
    if lang == "fa":
        return f"کد Banking Demo: {code}. تأیید پرداخت {amount} به {who}. این کد را به هیچ‌کس ندهید."
    return f"Banking Demo code: {code}. Confirms {amount} to {who}. Never share this code."
