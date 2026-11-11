from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, rate_limited
from app.models import User
from app.schemas.rates import RatesResponse
from app.services import rates as rates_service

router = APIRouter(prefix="/rates", tags=["rates"])


@router.get("", response_model=RatesResponse, dependencies=[Depends(rate_limited("rates", limit=30, window_seconds=60))])
def get_rates(user: User = Depends(get_current_user)):
    """Exchange rates for RUB, USD, IRR, AED, EUR, CNY and JPY (cached for an hour)."""
    snapshot, stale = rates_service.get_rates()
    return RatesResponse(base=snapshot.base, rates=snapshot.rates, updated_at=snapshot.updated_at, source=snapshot.source, stale=stale)
