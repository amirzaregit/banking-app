from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, rate_limited
from app.db.session import get_db
from app.models import User
from app.schemas.recipients import LookupRequest, MatchItem, MatchRequest, RecipientResponse
from app.services import recipients
from app.services.errors import DomainError, NotFound
from app.services.phone import mask_name, mask_phone, normalize_phone

router = APIRouter(prefix="/recipients", tags=["recipients"])

NOT_FOUND = "Recipient not found"  # same message whether unknown OR unable to receive


@router.post(
    "/lookup",
    response_model=RecipientResponse,
    dependencies=[Depends(rate_limited("lookup", limit=20, window_seconds=60))],
)
def lookup(body: LookupRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Who would receive this payment? Returns a MASKED name so the sender can confirm."""
    if body.phone is not None:
        e164 = normalize_phone(body.phone)
        if e164 is None:
            raise DomainError("Enter a valid phone number", code="invalid_phone", status_code=422)
        found = recipients.find_by_phone(db, e164)
        via = "phone"
    else:
        found = recipients.find_by_account_number(db, body.account_number or "")
        via = "account"

    if found is None:
        raise NotFound(NOT_FOUND, code="recipient_not_found")
    owner, account = found
    return RecipientResponse(
        name=mask_name(owner.full_name),
        via=via,
        phone_masked=mask_phone(owner.phone) if via == "phone" and owner.phone else None,
        account_number=account.account_number if via == "account" else None,
        is_self=owner.id == user.id,
        account_id=account.id if owner.id == user.id else None,  # never reveal other people's account ids
        currency=account.currency,
    )


@router.post(
    "/match",
    response_model=list[MatchItem],
    dependencies=[Depends(rate_limited("match", limit=6, window_seconds=60))],
)
def match_contacts(
    body: MatchRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Which of these address-book numbers belong to customers? Nothing is stored."""
    normalized: dict[str, str] = {}  # raw number -> E.164
    for raw in body.phones:
        e164 = normalize_phone(raw)
        if e164 is not None and e164 != user.phone:  # skip junk and the caller's own number
            normalized[raw] = e164

    owners = recipients.find_many_by_phone(db, sorted(set(normalized.values())))
    return [
        MatchItem(input=raw, name=mask_name(owners[e164].full_name))
        for raw, e164 in normalized.items()
        if e164 in owners
    ]
