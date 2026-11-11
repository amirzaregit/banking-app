# Architecture

How the system fits together, and why. For the reasoning behind individual choices see [DECISIONS.md](DECISIONS.md); for the
endpoints see [API.md](API.md).

- [Overview](#overview)
- [Backend structure](#backend-structure)
- [Data model](#data-model)
- [The ledger](#the-ledger)
- [Multi-currency and exchange](#multi-currency-and-exchange)
- [A payment, step by step](#a-payment-step-by-step)
- [Step-up authentication](#step-up-authentication)
- [Other money flows](#other-money-flows)
- [Frontend structure](#frontend-structure)
- [Internationalisation and right-to-left](#internationalisation-and-right-to-left)
- [Design system](#design-system)
- [Testing strategy](#testing-strategy)
- [Deployment](#deployment)

## Overview

```
 ┌──────────────────────────┐        ┌─────────────────────────────────────────────┐
 │  Phone / browser         │        │  Server                                     │
 │  Expo · React Native · TS│ HTTPS  │  ┌───────────┐   ┌───────────────────────┐  │
 │                          ├───────▶│  │  Caddy    ├──▶│  FastAPI              │  │
 │  - screens (Expo Router) │ Bearer │  │  (TLS)    │   │   routes  → HTTP only │  │
 │  - i18n en / ru / fa     │ token  │  └───────────┘   │   services → rules    │  │
 │  - PDFs, QR, map drawn   │◀───────┤                  │   models  → tables    │  │
 │    on the device         │  JSON  │                  └──────────┬────────────┘  │
 └──────────────────────────┘        │                             │               │
                                     │                  ┌──────────▼────────────┐  │
   Free rate APIs (server side) ─────┼─────────────────▶│  PostgreSQL           │  │
   Map tiles (device)                │                  │  append-only ledger   │  │
                                     │                  └───────────────────────┘  │
                                     └─────────────────────────────────────────────┘
```

The server is the only place that decides anything about money. The app proposes ("pay this person this much"), shows the server's
answer in the customer's language, and never trusts its own arithmetic for balances, limits or rates.

## Backend structure

Three layers, each allowed to know only the one below it:

| Layer | Folder | Responsibility |
|---|---|---|
| Routes | `app/api/routes` | Parse the request, call services, turn the result into a response, and **commit once**. The intended rule is that business rules live in services. Exception: the payment sequence (replay check, PIN, code, posting) is still written out in the transfer, bill, insurance and exchange routes, and `auth.py` contains queries; both are listed in the README roadmap. |
| Services | `app/services` | Every rule: ledger, conversion, limits, step-up, certificates, bills. They **never commit**, so the caller owns the transaction. |
| Models | `app/models` | SQLAlchemy 2 tables and constraints. |

Two conventions carry a lot of weight:

- **Services never commit.** A payment's two ledger rows, its idempotency record, its notification and (for a payment request) the
  request's "paid" status are written in one transaction and saved by the route's single `commit()`. Either all of it happens or none.
- **Domain errors carry a stable code and parameters** (`app/services/errors.py`). A route raises `PinInvalid(left=4)`; a global handler
  renders `{"code": "pin_invalid", "params": {"left": 4}, "detail": "<English fallback>"}`. Clients translate from the code.

Other shared pieces: `app/api/deps.py` (current user, language from `Accept-Language`, rate limiting), `app/services/ratelimit.py`
(sliding window, in memory), `app/core/config.py` (settings from environment variables, plus the production safety checks).

## Data model

```
users ──< refresh_tokens          one row per signed-in device (the "session"), rotating tokens
  │
  ├──< accounts ──< cards         accounts hold ONE currency; no balance column
  │       │
  │       └──< ledger_entries >── transfers      two entries per transfer, summing to zero
  │
  ├──< notifications              kind + params; the app writes the sentence
  ├──< otp_challenges             one-time codes, bound to one payment
  ├──< payment_requests           "please pay me": token, amount?, status, expiry
  └──< certificates               optional kept copies of issued certificates

sms_messages                      the simulated phone inbox (demo)
```

| Table | Notes |
|---|---|
| `accounts` | `type` is `checking`, `savings` or `system`. System accounts have no owner (a check constraint ties `type = 'system'` to `user_id IS NULL`) and exist **per currency**: `RESERVE` (pays out demo money), `MERCHANTS` (card purchases settle there), `FX` (the other side of every conversion), `SERVICES` (bill payments). A partial unique index allows only one *default receiving account* per user. |
| `transfers` | One money movement as the customer sees it. Unique `(initiated_by, idempotency_key)`. Optional links: `card_id`, `request_id` (the payment request it settled), `conversion_id` + `fx_rate` (both legs of an exchange), `gift_design`, `service_provider`. |
| `ledger_entries` | The truth. Signed `amount` (negative = money out) and the running `balance_after`. A trigger forbids `UPDATE` and `DELETE`. |
| `otp_challenges` | Stores only a keyed hash of the code, the payment it is bound to, an expiry and an attempt counter. |
| `payment_requests` | 16-character random token, optional fixed amount, status `open`/`paid`/`cancelled` (expiry is derived), 7-day lifetime. |
| `certificates` | A frozen JSON snapshot plus a reference number, stored **only if the customer asks** to keep a copy. |

Migrations are in `backend/alembic/versions` and are the only way the schema changes. The test suite builds its database by running
them, so triggers, partial indexes and check constraints are exercised too.

## The ledger

A balance is not a number someone edits. It is the sum of the lines in a book that is never erased.

```
 id │ account      │ amount │ balance_after │ transfer
────┼──────────────┼────────┼───────────────┼──────────────────
  1 │ Bank reserve │ -10000 │        -10000 │ demo deposit
  2 │ Alice        │ +10000 │         10000 │ demo deposit
  3 │ Alice        │  -2000 │          8000 │ Alice → Bob
  4 │ Bob          │  +2000 │          2000 │ Alice → Bob
```

Invariants, all enforced or audited:

1. **Every transfer is exactly two entries that cancel** (checked by `verify_ledger()`).
2. **Each currency sums to zero on its own**, and every entry sits on an account of its transfer's currency.
3. **Entries are immutable.** The database trigger rejects changes, so even a bug in the application cannot rewrite history. A mistake
   is corrected by appending a reversing entry.
4. **`balance_after` equals the running sum** (audited), so the current balance is just the newest row for the account.
5. **Customers can never go below zero**; system accounts can (the reserve is negative by exactly the money it has issued).

**Integer minor units.** All amounts are integers in the currency's smallest unit: cents for USD, kopecks for RUB, and the rial itself
for IRR, which has no practical subunit (`app/services/currencies.py` and `frontend/src/lib/money.ts` hold the same table). There is
no float in the database, the API, the CSV export or the amount keypad's parser.

**Concurrency.** `post_transfer` locks both accounts with `SELECT ... FOR UPDATE` **ordered by account id**, so two payments that
touch the same accounts in opposite directions can never wait on each other in a circle. The balance check happens after the lock,
so two simultaneous payments cannot both spend the same money.

**Idempotency.** A repeated request with the same `Idempotency-Key` returns the original transfer without moving money; the same key
with a *different* body is a conflict. The check runs after the account locks, so two identical requests that arrive together also
resolve to one payment. The unique constraint is the final backstop.

## Multi-currency and exchange

Money of different currencies is never mixed inside a ledger row. An exchange between two of a customer's own accounts is **two
ordinary transfers joined by the bank's FX pool accounts**:

```
 USD ledger:   your USD account ──── 30.00 ────▶ FX pool (USD)
 RUB ledger:   FX pool (RUB)    ──── 2,400.00 ──▶ your RUB account        (rate 80.00)
```

- Each leg is a normal two-row transfer in one currency, so every invariant above still holds, and `verify_ledger()` checks each
  currency on its own.
- Both legs are written in one transaction with a shared `conversion_id` and the `fx_rate` used. All four accounts are locked together in
  a fixed order before anything is written, so simultaneous exchanges cannot deadlock (tested).
- **The customer is never converted at a number they did not see.** The quote endpoint returns the amount they will receive; the
  confirmation sends that amount back (`expected_to_amount`); if today's rate no longer produces it, the server answers `409 rate_changed`
  with the new amount and the app asks again.
- **Rounding is always down** to the smallest unit of the target currency, with `Decimal` arithmetic: the bank never pays a fraction too much.
- A retry of a finished conversion returns the original result (it finds the second leg from the first), and a conversion that is too
  small to produce one minor unit is refused.
- Paying *another person* in a different currency is refused (`currency_mismatch`) before the PIN is even requested; exchange is for
  your own accounts.
- Limits scale to a common value (about $50 for a one-time code, $1,000,000 for the largest transfer) in each currency, defined next
  to the currency table.

Rates come from two free APIs called **server-side**, cached for an hour behind a lock (one request refreshes while the others wait),
with the last known rates served, marked stale, if both providers fail. The server never exposes the providers to the phone.

## A payment, step by step

`POST /transfers` (`app/api/routes/transfers.py`). The order matters: cheap and informative checks come first, secrets last.

1. **Resolve the source** account (404 for anyone else's) and **the recipient**. The *server* decides which account receives money sent
   to a phone number (the owner's default receiving account); the client only says who.
2. **Replay check.** If this idempotency key already completed with the same body, return that result: no PIN, no code, no money moved.
3. **Currency and size checks**, before asking for any secret: same currency, under the cap.
4. **Payment request** (if the payment settles one): lock the request row, require it open, not expired, not the payer's own, paying
   the right account and, for a fixed request, the exact amount.
5. **PIN.** Verified against the argon2 hash; failures are counted in the database and lock the PIN after five tries.
6. **Funds and one-time code.** Enough money? Then, for about $50 and up, a code bound to this exact payment: the first call texts it and
   answers `428 otp_required`; the second call (with the code) verifies and consumes it.
7. **Post the transfer** (locks, balance check, two ledger rows) and, if a request was settled, mark it paid and notify the requester.
8. **Commit once.** The money, the single-use code's deletion, the request status and the notification become permanent together.

Every failure is an error code with parameters; none leaks whether a recipient exists beyond what the masked-name lookup already shows.

## Step-up authentication

| Mechanism | Detail |
|---|---|
| Sign-in | Email + password (argon2). Throttled per email+IP, per email and per IP. Returns a short-lived access token and a rotating refresh token tied to a device session. |
| Refresh rotation | Using a refresh token invalidates it and issues a new one. Presenting an *old* one again is treated as theft and ends the whole session. |
| Payment PIN | 6 digits, argon2-hashed, weak PINs (`123456`, repeats) refused, five wrong tries lock it for 15 minutes. The counter lives in the database, so restarting the server cannot reset it. |
| One-time code | 6 digits, HMAC-hashed with a server key, bound to the payment hash (account pair, amount, currency), 5-minute expiry, five tries, deleted with the payment. Texted through the simulated SMS inbox in `Accept-Language`. |
| Wrong secret = 403 | The app treats a 401 as "access token expired, refresh silently". A wrong PIN must not trigger that, so it is a 403. |
| Fingerprint | Optionally replaces typing the PIN: the PIN sits in the phone's secure store behind the sensor. It also locks the app after 30 seconds in the background. |

## Other money flows

- **Top-up and demo deposit** (`demo_mode` only): the bank's reserve pays the customer, in the account's own currency, with a per-currency cap.
- **Payment requests.** The requester picks an account and optionally an amount; the response has a link and a token. The payer opens or
  scans it (the app extracts the token from a link or a QR code), looks it up (masked requester name, amount, status) and pays through
  the normal payment flow with `request_token`. The request is not a separate payment path: it is a *condition on a normal transfer*.
- **Bills.** A catalogue of providers (id, category, currency, what reference to ask for). Paying is a transfer to the per-currency
  `SERVICES` account tagged with the provider, with the same PIN and code rules (`services/stepup.py` holds the shared step).
  References are validated per kind (Russian phone, Iranian mobile, account number).
- **Gifts.** A normal transfer with a `gift_design`; the message is the description. The recipient's notification carries the design so
  the app can show the card.
- **Certificates.** `services/certificates.py` collects facts from the ledger into a snapshot (eight types), numbers it, and returns it.
  The **PDF is built on the phone** from the snapshot: a pure function (`frontend/src/certificates/document.ts`) turns it into HTML in the
  document's own language and direction, and `expo-print` makes the PDF. Nothing is stored on the server unless the customer ticks
  "keep a copy". Issuing is limited to one certificate per customer every five seconds.
- **Insurance.** Four products (travel, medical, car, home) priced from one table in US cents (`services/insurance.py`) and turned into the paying
  account's currency by `services/pricing.py`, which calls the SAME `conversion.convert_amount` and the SAME cached rates as the currency exchange (rounded up to a tidy amount, never in the customer's favour by accident). `POST /insurance/quote` prices and validates without storing anything; `POST /insurance/policies`
  (with `expected_premium`: if the rate moved, `409 price_changed`, nothing charged) pays through the same PIN / one-time-code / idempotency path as a bill (a transfer to the per-currency `SERVICES` account, tagged
  `insurance_<product>`) and writes an `insurance_policies` row in the same transaction. `transfer_id` is unique, so one payment can buy only one
  policy, even if the request is retried. The row freezes the holder's name, dates, cover and details, so the certificate never changes after
  purchase; the status (upcoming, active, expired) is computed from the dates, never stored. The PDF is built on the phone from the same page
  as the bank's other certificates (`renderPage` in `certificates/document.ts`).
- **Transaction details and receipts.** `GET /transactions/{entry_id}` (`services/transactions.py`) reads one line with the history query the statement
  already uses and the exchange's own lookup of the other leg of a conversion, and names its kind (deposit, top-up, transfer, gift, card payment,
  bill, insurance, exchange) from how it was made. Both sides of one payment share a receipt number derived from the transfer id. The receipt PDF is
  built on the phone from that response.
- **Plastic cards.** `card_orders` rows (design, branch, how to notify); a partial unique index allows one `pending` order per account, so a
  second tap, or a second device, gets `409 card_order_pending` and the app shows the order's status instead.
- **Blocking.** `block_requests` records the reason. Ready-made reasons apply at once: an account becomes `frozen` (the ledger already refuses
  transfers on a non-active account) and a card becomes `blocked`, which unlike `frozen` is final. The free-text reason `other` is stored as
  `pending_review` and changes nothing until a specialist approves it (in the demo, buttons play the specialist). Unblocking an account asks for the PIN.
- **Statements** are exported as CSV with formula-injection defence (cells that start with `= + - @` are quoted), a UTF-8 BOM so Excel
  reads Cyrillic and Persian, and per-currency decimals.

## Frontend structure

Shared building blocks worth knowing before reading a screen: `usePdfDocument` + `<PdfCard>` (every document as a file), `usePagedList` +
`<PagedFooter>` (every list that pages), `<Loading>` (the only spinner for "not loaded yet"), `KeyboardScrollView` (never covered by the keyboard),
`PinEntry` (PIN and SMS code), and the standard `Heading`, `Detail`, `OptionRow`, `ResultHeader`, `Notice` in `components/ui.tsx`.

Expo SDK 58, Expo Router (file-based routes), React Native 0.88, TypeScript strict.

```
src/app/            routes. (tabs) = Home · History · Payments · News · Settings; the rest are stack screens; sign-in / sign-up sit outside the signed-in group
src/components/     the design system (Text, Button, Card, Glass, PatternBackground, AmountText, Select, DateField, GiftCard, ConfirmPayment ...)
src/<feature>/      accounts, branches, cards, certificates, history, news, payments, rates, security, send, support ...
src/lib/            pure functions: money, calendar, Jalali, fit-text, uuid ...
src/i18n/           catalogs, fonts, digits, direction, error translation
src/api/            the API client (auto token refresh) and response types
```

Patterns worth knowing:

- **Data loading:** `useFocusData(fetcher)` loads on focus, supports pull-to-refresh, and returns errors already translated.
- **Errors:** `useErrors()` turns an `ApiError` (code + params) into a sentence in the current language.
- **Payments:** `DraftProvider` holds the payment being built across the send screens; `ConfirmPayment` is the single component that
  handles PIN, fingerprint and one-time-code steps (and keeps one idempotency key per exact payment) for bills and others.
- **Pure logic is separated from components** so it can be tested without rendering: period presets, calendars, map projection,
  certificate HTML, request-link parsing, directions URLs, amount fitting.
- **Navigation theme:** React Navigation paints `colors.background` under every screen, and a screen's own style cannot undo it. The
  signed-in group therefore runs with a *transparent* navigation theme over one shared background, with fade transitions.

## Internationalisation and right-to-left

- English is the source of truth (`i18n/en.ts`). `ru.ts` and `fa.ts` are **typed against it**: a missing key is a compile error.
  A test also checks that every `{{placeholder}}` is identical in all three and that nothing is an untranslated copy.
- The **server never writes user-facing sentences**, except the SMS (which follows `Accept-Language`). Errors and notifications travel as
  code/kind + parameters.
- **Direction is applied by the app itself** (a `direction` style at the root plus Expo Router's `LocaleProvider` and a custom header),
  so switching language is instant: no reload, no restart. The phone's native RTL flag is deliberately not used because it only changes
  after the process restarts.
- **Never force `textAlign: 'right'` on Persian text.** On Android React Native maps `right` to "opposite of the text's own direction",
  which puts right-to-left text on the left. Leave alignment natural. A test pins this.
- Numbers, account numbers, money and names are wrapped in **bidi isolates** so they cannot scramble inside a right-to-left sentence;
  numeric inputs show Persian digits but keep plain ASCII in state, with an invisible left-to-right mark for correct ordering.
- Persian uses the **Jalali calendar** (`lib/jalali.ts`, checked against known Nowruz dates and round-tripped over twelve years) in every
  date display and in the date picker, while dates travel to the server as ISO strings.
- Fonts: Manrope for English and Russian, Vazirmatn for Persian, picked per language and weight; Persian gets a roomier line height
  and no letter-spacing (spacing breaks joined letters).

## Design system

- **Palette:** teal `#00A5AC`, gold `#DEAD61`, paper `#F7F7F7` (never pure white). A contrast study found teal text on paper is only 2.8:1 and
  gold text 1.9:1, so each colour has a **role**: teal is a *fill* with dark ink, a deeper teal is used for text and links, gold is for
  chips and accents. `constants/__tests__/theme.test.ts` fails the build if any text/background pairing in light or dark drops below readable contrast.
- **Backdrop and glass:** one `PatternBackground` sits behind the whole signed-in app: a faint repeating pattern (hand-measured from a
  reference image) with two soft colour glows. The "blur" is *drawn*, not filtered: each line is several overlapping strokes from wide
  and faint to thin and strong, which looks identical on every phone and in the browser and costs nothing to render. Cards, rows and
  the footer menu are `Glass`: a translucent fill with a bright top edge (the browser adds `backdrop-filter`).
- **Amounts always fit:** `AmountText` shrinks the font by measuring the available width, so a rial balance with twelve digits stays on one line.
- **Vector art** (gift cards, card artwork, the map's schematic fallback) is drawn with `react-native-svg`, so it stays sharp at any size.
- **The map** is built from plain views: OpenStreetMap-style tile maths, drag and zoom, markers, and a hand-drawn river and ring roads
  underneath, so it is never empty even if the tile server is unreachable.

## Testing strategy

| Concern | How it is tested |
|---|---|
| Ledger correctness | Service-level tests on real Postgres: balances, rollback on failure, invariants after every scenario (`verify_ledger`), the append-only trigger |
| Concurrency | Threaded tests: double-spend races, opposite-direction deadlocks, identical simultaneous requests, simultaneous wrong PIN guesses, simultaneous exchanges |
| Safeguards | "Break it on purpose": each key guard (the rate-changed check, currency mismatch, request amount match, totals excluding exchange legs, the rounding direction) was disabled once to prove a test fails without it |
| API contract | Tests assert stable error **codes and params**; `test_i18n_contract.py` pins what the app relies on |
| Schema | The database is built from the real migrations, so triggers, partial indexes and constraints are real |
| Frontend logic | Jest over pure functions (money, calendars, Jalali round trips, map maths, certificate HTML including HTML escaping, catalog parity, contrast) |
| Not covered | Native-only behaviour (camera, share sheet, file picker, fingerprint, fonts on a device) cannot run in a browser or in Jest and was verified only as far as the documented APIs allow |

## Deployment

`docker-compose.yml` is the development stack (API with auto-reload, Postgres). `docker-compose.prod.yml` puts **Caddy** in front
(automatic Let's Encrypt certificates; only Caddy publishes ports) with the API and Postgres on an internal network. In production the
server refuses to start with the default secret key or database password, and `DEMO_MODE=false` removes the fake-money endpoints
(`deposit`, `topup`, the SMS inbox, the card simulator). The mobile app is built with EAS using `EXPO_PUBLIC_API_URL`.
