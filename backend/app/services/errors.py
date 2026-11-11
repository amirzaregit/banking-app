class DomainError(Exception):
    """A business-rule failure. main.py turns these into HTTP responses.

    `code` is a stable machine-readable name ("pin_locked") so the mobile app can react
    without parsing human text.
    """

    status_code = 400
    code: str | None = None

    def __init__(
        self,
        detail: str,
        headers: dict[str, str] | None = None,
        code: str | None = None,
        params: dict | None = None,
        status_code: int | None = None,
    ):
        super().__init__(detail)
        self.detail = detail  # English text: a fallback and what the tests/API docs show
        self.headers = headers
        self.params = params  # values the app needs to build ITS translated sentence, e.g. {"left": 4}
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code


class NotFound(DomainError):
    status_code = 404


class InsufficientFunds(DomainError):
    status_code = 422
    code = "insufficient_funds"


class InvalidTransfer(DomainError):
    status_code = 422


class AccountNotActive(DomainError):
    status_code = 422


class IdempotencyConflict(DomainError):
    status_code = 422
    code = "idempotency_conflict"


class TooManyRequests(DomainError):
    status_code = 429
    code = "rate_limited"


# ---- step-up authentication (PIN and one-time codes) ------------------------------------
# Note: wrong PIN/OTP use 403, NOT 401. The mobile app treats 401 as "access token expired"
# and silently refreshes it, which would be wrong here.


class PinNotSet(DomainError):
    status_code = 403
    code = "pin_not_set"


class PinInvalid(DomainError):
    status_code = 403
    code = "pin_invalid"


class PinLocked(DomainError):
    status_code = 429
    code = "pin_locked"


class WeakPin(DomainError):
    status_code = 422
    code = "weak_pin"


class OtpRequired(DomainError):
    status_code = 428  # Precondition Required: "do this first, then repeat the request"
    code = "otp_required"


class OtpInvalid(DomainError):
    status_code = 403
    code = "otp_invalid"


class CardDeclined(DomainError):
    status_code = 422
    code = "card_declined"
