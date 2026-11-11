# API reference

_Banking Demo API 0.2.0. Generated from the running application's OpenAPI schema by `backend/scripts/generate_api_docs.py`: do not edit by hand. Interactive docs are served at `/docs` while the API runs._

**Conventions**

- **Auth:** every endpoint except the ones marked *public* needs `Authorization: Bearer <access token>`.
- **Money** is always an integer in the currency's minor unit (cents, kopecks; rials have no subunit).
- **Idempotency:** endpoints that move money take an `Idempotency-Key` header (8-64 characters). Repeating a request with the same key returns the original result and moves no money.
- **Errors** are `{ "detail": "English text", "code": "stable_code", "params": {...} }`. Clients translate from `code` + `params`, never from the text.
- **Language:** the `Accept-Language` header (`en`, `ru`, `fa`) picks the language of texts the server itself writes (the SMS).

## accounts

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `GET` | `/accounts` | The customer's accounts with their balances (balances are derived from the ledger). |  | list of AccountResponse |
| `POST` | `/accounts` | Open another account in USD, RUB or IRR (up to eight accounts per customer). | OpenAccountRequest | AccountResponse |
| `GET` | `/accounts/{account_id}` | One account and its balance. Other people's accounts answer 404, so their existence is not revealed. |  | AccountResponse |
| `PUT` | `/accounts/{account_id}/default` | Choose which account receives payments sent to your phone number. |  | AccountResponse |
| `POST` | `/accounts/{account_id}/deposit` | DEMO ONLY: add fake money. A real bank would have no such endpoint. | DepositRequest | AccountResponse |
| `GET` | `/accounts/{account_id}/statement.csv` | The account's statement as a CSV file (opens in Excel, Numbers, Google Sheets). |  |  |
| `POST` | `/accounts/{account_id}/topup` | DEMO ONLY: top up an account as if the money came from a card, a bank transfer or cash. (In real life the money arrives from outside, and this endpoint would not exist.) | TopUpRequest | AccountResponse |
| `GET` | `/accounts/{account_id}/transactions` | An account's ledger lines, newest first, with cursor pagination. |  | TransactionPage |

## auth

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `POST` | `/auth/login` *(public)* | Sign in with email and password. Returns an access token and a rotating refresh token, tied to this device's session. | LoginRequest | TokenResponse |
| `POST` | `/auth/logout` | End this device's session. | RefreshRequest |  |
| `POST` | `/auth/logout-all` | Sign out every device, including this one. |  |  |
| `POST` | `/auth/refresh` *(public)* | Swap a refresh token for a new pair. Using an old refresh token again ends that whole session (theft detection). | RefreshRequest | TokenResponse |
| `POST` | `/auth/register` *(public)* | Create a customer, with a first checking account, and a phone number that others can pay. | RegisterRequest | UserResponse |
| `GET` | `/auth/sessions` | Devices currently logged in. One active token exists per login. |  | list of SessionResponse |
| `DELETE` | `/auth/sessions/{session_id}` | Sign one of your other devices out. |  |  |

## bills

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `POST` | `/bills/pay` | Pay a mobile, internet, utility, tax or charity provider. Same step-up as a transfer: PIN, plus an SMS code for larger amounts. | BillRequest | BillResponse |
| `GET` | `/bills/providers` | Everything a customer can pay: mobile operators, internet, utilities, taxes and fines, charities. |  | list of ProviderResponse |

## card services

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `POST` | `/accounts/{account_id}/block` | Block an account. A ready-made `reason` blocks at once; `other` (with `details`) waits for a specialist (`pending_review`). | BlockCreate | BlockRequestResponse |
| `GET` | `/accounts/{account_id}/block-requests` | Block requests for this account and its cards, newest first (so the app can show one waiting for a specialist). |  | list of BlockRequestResponse |
| `GET` | `/accounts/{account_id}/card-orders` | Plastic-card orders for this account, newest first. A `pending` one means a card is being made. |  | list of CardOrderResponse |
| `POST` | `/accounts/{account_id}/card-orders` | Order a plastic card: a design (light or dark), a branch to collect it from, and how to be told when it is ready. Only one order per account can be in production at a time (409 `card_order_pending`). | CardOrderCreate | CardOrderResponse |
| `POST` | `/accounts/{account_id}/unblock` | Unblock an account you blocked. Needs the payment PIN. | UnblockRequest |  |
| `POST` | `/block-requests/{request_id}/demo-review` | DEMO ONLY: play the specialist: approve (the account/card gets blocked) or reject the request. | ReviewRequest | BlockRequestResponse |
| `POST` | `/card-orders/{order_id}/demo-ready` | DEMO ONLY: pretend the branch finished the card. |  | CardOrderResponse |
| `POST` | `/cards/{card_id}/block` | Block a card for good (lost, stolen, damaged ...). Unlike freezing this cannot be undone: order a new card. `other` (with `details`) waits for a specialist. | BlockCreate | BlockRequestResponse |

## cards

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `GET` | `/accounts/{account_id}/cards` | The account's virtual cards. |  | list of CardResponse |
| `POST` | `/accounts/{account_id}/cards` | Issue a virtual card (at most three per account). Only the last four digits are stored. |  | CardResponse |
| `GET` | `/cards` | Every card on every account of the user. |  | list of CardListItem |
| `POST` | `/cards/{card_id}/freeze` | Freeze a card: purchases are declined until it is unfrozen. |  | CardResponse |
| `POST` | `/cards/{card_id}/purchase` | DEMO ONLY: pretend a shop charged this card. In real life the card NETWORK calls the bank, never the customer's own phone. | app__schemas__cards__PurchaseRequest | PurchaseResponse |
| `POST` | `/cards/{card_id}/unfreeze` | Unfreeze a card. |  | CardResponse |

## certificates

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `GET` | `/certificates` | Certificates the customer chose to keep a copy of (by default none is stored). |  | list of CertificateSummary |
| `POST` | `/certificates` | Issue a certificate: the facts are collected from the ledger and numbered. Nothing is stored unless `keep` is set; the app turns the facts into a PDF that the customer saves on their phone. | CertificateRequest | CertificateResponse |
| `GET` | `/certificates/{certificate_id}` | One kept certificate, exactly as issued. Other people's certificates answer 404. |  | CertificateResponse |

## conversions

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `POST` | `/conversions` | Convert money between two of the customer's own accounts in different currencies, at the rate they were shown. PIN, plus an SMS code for larger amounts. | ConversionRequest | ConversionResponse |
| `GET` | `/conversions/quote` | What would this conversion give me right now? Moves nothing. |  | app__schemas__conversion__QuoteResponse |

## demo

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `GET` | `/sms/inbox` | DEMO ONLY: the texts this fake platform 'sent' you. A real bank has no such endpoint: the code goes to your phone's SMS app, never back through the banking API. |  | list of SmsResponse |

## history

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `GET` | `/history` | Every transaction on all of the user's accounts (newest first), with filters and totals. |  | HistoryPage |

## insurance

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `GET` | `/insurance/policies` | Your policies, newest first. |  | list of PolicyResponse |
| `POST` | `/insurance/policies` | Buy a policy and pay for it from one of your accounts, in that account's currency. The certificate is issued in the account holder's name. Same step-up as a transfer: PIN, plus an SMS code for larger amounts. A retried request returns the same policy and charges nothing. Send `expected_premium` (the price you showed): if the exchange rate has moved so the price differs, nothing is charged and the answer is 409 `price_changed` with the new price. | app__schemas__insurance__PurchaseRequest | PolicyResponse |
| `GET` | `/insurance/policies/{policy_id}` | One policy with everything printed on its certificate. |  | PolicyResponse |
| `POST` | `/insurance/quote` | The price and the cover limit for the chosen details, in the chosen currency. Nothing is bought or stored. | QuoteRequest | app__schemas__insurance__QuoteResponse |

## meta

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `GET` | `/health` *(public)* | Liveness check used by Docker and the load balancer. |  |  |

## notifications

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `GET` | `/notifications` | Newest first, plus how many are unread (use limit=1 to just fetch the badge number). |  | NotificationList |
| `POST` | `/notifications/read-all` | Mark every notification as read. |  |  |

## payment requests

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `GET` | `/requests` | The customer's payment requests, newest first (open, paid, cancelled or expired). |  | list of PaymentRequestResponse |
| `POST` | `/requests` | Ask to be paid: returns a link (and its token, for a QR code) that anyone with the app can open. | PaymentRequestCreate | PaymentRequestResponse |
| `GET` | `/requests/lookup/{token}` | Someone opened a payment link or scanned a code: what are they being asked to pay, and to whom (masked)? |  | PaymentRequestLookup |
| `POST` | `/requests/{request_id}/cancel` | Cancel an open payment request so it can no longer be paid. |  | PaymentRequestResponse |

## rates

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `GET` | `/rates` | Exchange rates for RUB, USD, IRR, AED, EUR, CNY and JPY (cached for an hour). |  | RatesResponse |

## recipients

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `POST` | `/recipients/lookup` | Who would receive this payment? Returns a MASKED name so the sender can confirm. | LookupRequest | RecipientResponse |
| `POST` | `/recipients/match` | Which of these address-book numbers belong to customers? Nothing is stored. | MatchRequest | list of MatchItem |

## transactions

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `GET` | `/transactions/{entry_id}` | One line of your statement in full: what it was, the other side, the accounts, and everything a receipt prints. `entry_id` is the `id` of a history line. Someone else's line is a 404. |  | TransactionDetail |

## transfers

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `POST` | `/transfers` | Send money to a phone number or account number. Needs an Idempotency-Key and the payment PIN; larger amounts also need an SMS code. | TransferRequest | TransferResponse |

## users

| Method | Path | What it does | Request | Response |
|---|---|---|---|---|
| `GET` | `/users/me` | The signed-in customer's profile. |  | UserResponse |
| `PUT` | `/users/me/pin` | Set or change the payment PIN. Needs the account password, so a stolen session can't. | SetPinRequest |  |
| `POST` | `/users/me/pin/verify` | Check a PIN without moving money (e.g. before enabling fingerprint payments). Wrong guesses count toward the same lockout as payments. | VerifyPinRequest |  |
