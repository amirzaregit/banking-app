"""Paying for mobile service, internet, utilities, taxes and fines, or donating. A bill payment is an ordinary transfer from
the customer's account to the bank's per-currency "services" account, tagged with the provider that should receive it."""

import re
from dataclasses import dataclass

from app.services.errors import DomainError
from app.services.phone import normalize_phone


@dataclass(frozen=True)
class Provider:
    id: str
    category: str  # mobile | internet | utilities | government | charity
    currency: str  # the currency this provider is paid in
    reference: str  # what the customer must enter: phone_ru | phone_ir | account | none
    names: dict[str, str]  # en / ru / fa


def _p(id_: str, category: str, currency: str, reference: str, en: str, ru: str, fa: str) -> Provider:
    return Provider(id_, category, currency, reference, {"en": en, "ru": ru, "fa": fa})


PROVIDERS: tuple[Provider, ...] = (
    # Russia (rubles)
    _p("mts", "mobile", "RUB", "phone_ru", "MTS", "МТС", "ام‌تی‌اس"),
    _p("beeline", "mobile", "RUB", "phone_ru", "Beeline", "Билайн", "بیلاین"),
    _p("megafon", "mobile", "RUB", "phone_ru", "MegaFon", "МегаФон", "مگافون"),
    _p("tele2", "mobile", "RUB", "phone_ru", "Tele2", "Tele2", "تله‌دو"),
    _p("rostelecom", "internet", "RUB", "account", "Rostelecom (internet and TV)", "Ростелеком (интернет и ТВ)", "روستلکام (اینترنت و تلویزیون)"),
    _p("mosenergosbyt", "utilities", "RUB", "account", "Electricity (Mosenergosbyt)", "Электроэнергия (Мосэнергосбыт)", "برق (موس‌انرگوسبیت)"),
    _p("mosvodokanal", "utilities", "RUB", "account", "Water (Mosvodokanal)", "Вода (Мосводоканал)", "آب (موس‌ودوکانال)"),
    _p("mosgaz", "utilities", "RUB", "account", "Gas (Mosgaz)", "Газ (Мосгаз)", "گاز (موسگاز)"),
    _p("gosuslugi_fines", "government", "RUB", "account", "Traffic fines (Gosuslugi)", "Штрафы ГИБДД (Госуслуги)", "جریمه‌های رانندگی (گوسوسلوگی)"),
    _p("fns_tax", "government", "RUB", "account", "Taxes (Federal Tax Service)", "Налоги (ФНС)", "مالیات (سازمان مالیات روسیه)"),
    _p("sfr", "government", "RUB", "account", "Social Fund contributions", "Взносы в Социальный фонд", "حق بیمه صندوق اجتماعی"),
    _p("podari_zhizn", "charity", "RUB", "none", "Gift of Life foundation", "Фонд «Подари жизнь»", "بنیاد «هدیه زندگی»"),
    # Iran (rials)
    _p("irancell", "mobile", "IRR", "phone_ir", "Irancell", "Ирансел", "ایرانسل"),
    _p("mci", "mobile", "IRR", "phone_ir", "Hamrah-e Aval (MCI)", "Хамрахе Аваль (MCI)", "همراه اول"),
    _p("rightel", "mobile", "IRR", "phone_ir", "Rightel", "Райтел", "رایتل"),
    _p("tci", "internet", "IRR", "account", "Telecommunication Company of Iran", "Телекоммуникационная компания Ирана", "مخابرات ایران"),
    _p("tavanir", "utilities", "IRR", "account", "Electricity (Tavanir)", "Электроэнергия (Таванир)", "برق (توانیر)"),
    _p("abfa", "utilities", "IRR", "account", "Water (Abfa)", "Вода (Абфа)", "آب (آبفا)"),
    _p("nigc", "utilities", "IRR", "account", "Gas (NIGC)", "Газ (NIGC)", "گاز (شرکت ملی گاز)"),
    _p("police_fines", "government", "IRR", "account", "Traffic fines (Rahvar police)", "Штрафы ГИБДД (полиция Ирана)", "جریمه‌های رانندگی (راهور)"),
    _p("tax_org", "government", "IRR", "account", "Taxes (Tax Organization)", "Налоги (налоговая служба Ирана)", "مالیات (سازمان امور مالیاتی)"),
    _p("tamin", "government", "IRR", "account", "Social security (Tamin Ejtemaei)", "Социальное страхование (Тамин)", "تأمین اجتماعی"),
    _p("mahak", "charity", "IRR", "none", "Mahak charity", "Благотворительный фонд «Махак»", "مؤسسه خیریه محک"),
)
BY_ID = {p.id: p for p in PROVIDERS}
CATEGORIES = ("mobile", "internet", "utilities", "government", "charity")

_IR_MOBILE = re.compile(r"^(?:\+98|0098|0)?9\d{9}$")
_ACCOUNT = re.compile(r"^[A-Za-z0-9\-]{4,24}$")


def clean_reference(provider: Provider, reference: str | None) -> str:
    """Check the phone number / account / contract number the customer typed and return it in a clean form."""
    text = (reference or "").strip()
    bad = DomainError("Check the number you entered", code="invalid_reference", status_code=422)
    if provider.reference == "none":
        return ""
    if provider.reference == "phone_ru":
        phone = normalize_phone(text)
        if phone is None:
            raise bad
        return phone
    if provider.reference == "phone_ir":
        digits = re.sub(r"[\s\-()]", "", text)
        if not _IR_MOBILE.match(digits):
            raise bad
        return "+98" + digits[-10:]
    if not _ACCOUNT.match(text):
        raise bad
    return text
