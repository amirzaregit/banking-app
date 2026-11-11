# Design decisions

Short records of the choices that shaped the project: what was decided, why, and what it costs. Newest thinking, not a changelog.
Background on how the parts fit is in [ARCHITECTURE.md](ARCHITECTURE.md).

| # | Decision | One-line reason |
|---|---|---|
| 1 | Balance = sum of an append-only ledger | History cannot be rewritten; totals can be audited |
| 2 | Integer minor units, never floats | Exact arithmetic |
| 3 | Idempotency key on every payment | Retries on a bad network never double-pay |
| 4 | Lock accounts in a fixed order | No deadlocks, no double-spend |
| 5 | Wrong PIN / code is 403, not 401 | 401 means "refresh the token" to the client |
| 6 | Rules in a database trigger as well as code | The last line of defence is not the application |
| 7 | Errors are codes + params; the app writes sentences | One backend, three languages |
| 8 | Exchange is two transfers through FX pool accounts | Each currency's ledger still balances alone |
| 9 | Quote, confirm with the expected amount, 409 if it moved | Never convert at a number the customer did not see |
| 10 | App-driven right-to-left | Language switch is instant, no restart |
| 11 | Certificates: snapshot on server, PDF on the phone, stored only on request | Privacy, no PDF toolchain on the server |
| 12 | Background "blur" is drawn strokes, not filters | Identical and cheap on every device |
| 13 | Map: real tiles over a schematic fallback | Never an empty screen |
| 14 | Demo-only endpoints behind `DEMO_MODE` | Fake money cannot exist in production |
| 15 | Payment requests are a condition on a normal transfer | One audited path for all money |
| 16 | Expo Router + Expo Go | Fast iteration on a real phone, no native build |
| 17 | Services never commit | The route owns one atomic transaction |
| 18 | Instant block for ready-made reasons, review for free text | Speed when money is at risk, a human for anything unusual |
| 19 | Insurance = a bill-style payment + a frozen policy row | Reuses the audited payment path; the certificate cannot drift |

---

### 1. The balance is the sum of an append-only ledger
**Decision.** `accounts` has no balance column. Every movement is two `ledger_entries` (one negative, one positive) in one `transfer`,
and a database trigger rejects updates and deletes. The current balance is the latest `balance_after`.
**Why.** A stored balance can silently drift from the history that produced it. With a ledger, "does the bank add up?" is a query
(`verify_ledger()`), and a mistake is corrected by a visible reversing entry.
**Cost.** Reads of a balance need the latest row (indexed), and corrections are more work than `UPDATE`. That is the point.

### 2. Integer minor units
**Decision.** Amounts are integers of the smallest unit (cents, kopecks, rials). One table maps currency to digits on both server and app.
**Why.** `0.1 + 0.2 != 0.3`. Money code that never sees a float cannot have rounding drift. IRR has zero minor digits, so an amount is
just the rial.
**Cost.** Everything that displays or parses needs the currency's digit count; this is centralised and tested.

### 3. Idempotency keys
**Decision.** The app generates one UUID per *exact* payment and sends it as `Idempotency-Key`. The server stores it with the transfer;
repeats return the first result, the same key with a different body is a conflict.
**Why.** Mobile networks drop responses, not just requests. The customer taps again; money must move once.
**Cost.** One extra column and unique constraint. The check runs after the account locks so simultaneous duplicates also collapse.

### 4. Lock order
**Decision.** `SELECT ... FOR UPDATE` on every account involved, **ordered by id**, before checking balances or writing.
**Why.** Without ordering, A→B and B→A running together each hold one lock and wait for the other. Without locking, two payments can
both see enough money. Tests run both races on threads.

### 5. 403 for a wrong PIN or code
**Decision.** Wrong PIN / wrong one-time code answer `403`; `401` is reserved for an invalid or expired access token.
**Why.** The client silently refreshes the token on `401` and retries. A wrong PIN must show an error, not trigger refresh loops or
sign the user out.

### 6. Constraints in the database, not only the code
**Decision.** Append-only trigger on the ledger, check constraint tying system accounts to "no owner", partial unique index for one default
receiving account, unique `(initiated_by, idempotency_key)`.
**Why.** Application code has bugs and future maintainers. These rules must hold even then. The tests build the schema from the real
migrations so the constraints are exercised.

### 7. Stable error codes; the client translates
**Decision.** Server errors are `{code, params, detail}`. The English `detail` is a fallback for logs and tools; the app maps `code` +
`params` to a sentence in the user's language. Notifications work the same way (kind + params).
**Why.** The server does not need to know three languages (or a fourth later), and the wording can change without an API change.
**Cost.** Every new error needs a catalog entry in three languages; a test fails if one is missing.

### 8. Exchange as two transfers through FX pool accounts
**Decision.** Converting 30 USD to RUB is a USD transfer into `SYSTEM-FX-USD` and a RUB transfer out of `SYSTEM-FX-RUB`, linked by
`conversion_id` and `fx_rate`.
**Why.** A ledger row has one currency. This keeps every row single-currency, every transfer balanced, and each currency's totals
provably zero, while still modelling that the bank holds both sides of the trade.
**Alternative rejected.** One row with two amounts would have broken the "each transfer sums to zero" invariant.

### 9. Quote, confirm, and refuse stale quotes
**Decision.** The customer sees "you get X". Confirming sends `expected_to_amount: X`; if the rate has since changed the result, the
server returns `409 rate_changed` with the new amount and nothing moves. Rounding is always down.
**Why.** The fair behaviour of a real exchange: the customer agrees to a number, not to "whatever the rate is when you arrive".

### 10. App-driven right-to-left
**Decision.** The app sets `direction` at the root and swaps it when the language changes; the OS-level RTL flag is not used.
**Why.** The OS flag only applies after a restart. Persian users switching language should see the layout flip immediately.
**Cost.** Some library components assume the native flag, so the navigation header is custom; `textAlign: 'right'` is forbidden (it
means the wrong side for Persian on Android). Covered by tests and a note in ARCHITECTURE.

### 11. Certificates
**Decision.** The server produces a *snapshot* (facts from the ledger + a reference number). The **phone** turns it into HTML and a PDF
in the document's own language. The snapshot is stored only if the customer ticks "keep a copy". One per user per five seconds.
**Why.** Fonts, right-to-left shaping and Jalali dates are already solved in the app; duplicating them in a server-side PDF library is
extra weight. Not keeping copies by default is the privacy-friendly choice, and the reference number still lets a copy be verified.
**Cost.** PDF output depends on the phone's print service; the app copies the file to a named cache file so sharing works, and offers a
fallback print dialog.

### 12. Drawn softness instead of blur filters
**Decision.** The background pattern is SVG strokes layered from wide/faint to thin/strong. Cards are translucent with a bright edge. No
per-card `BlurView`.
**Why.** Real blur filters are expensive on mid-range Android, behave differently per platform, and a blur view on every card
stutters scrolling. The layered stroke looks the same everywhere and costs one SVG.

### 13. Map tiles with a schematic fallback
**Decision.** Branch map = tile maths in plain views, with a hand-drawn river and ring roads underneath.
**Why.** Embedding a map SDK needs native modules (not in Expo Go) and keys; some networks block the tile server. The fallback means the
screen still shows where branches are.

### 14. `DEMO_MODE`
**Decision.** Deposit, top-up, the SMS inbox and card simulator exist only when `DEMO_MODE` is on, and are absent (404) otherwise.
**Why.** This is a project with fake money; those endpoints are how fake money enters. A production deploy must not have them.

### 15. Payment requests are conditions, not a second payment path
**Decision.** A request is a row with a capability token. Paying it is an ordinary `POST /transfers` that includes `request_token`; the
server checks the request is open, not expired, not the payer's own, and the amount matches.
**Why.** All money still flows through the one function that is locked, idempotent, PIN-checked and audited. Two paths would be two
places for bugs.

### 16. Expo Router and Expo Go
**Decision.** File-based routing, TypeScript, only modules that ship in Expo Go.
**Why.** Test on a real phone by scanning a QR code, no native toolchain. A side effect worth knowing: a module missing from Expo Go
crashes only the screen that imports it, which is why the project avoids extra native packages (it dropped `expo-crypto` and
`expo-blur` for pure-JS/SVG replacements).

### 17. Services never commit
**Decision.** Services add to the session and flush; only the route calls `commit()`.
**Why.** A payment touches ledger, idempotency, request status, notifications and OTP deletion. One commit at the end makes them
atomic without nested-transaction bookkeeping, and services are easy to test (roll back after each test).

### 18. Two speeds of blocking
**Decision.** A ready-made reason (lost, stolen, suspected fraud ...) blocks immediately. A free-text reason is saved as `pending_review`
and blocks nothing until a specialist approves. A blocked card is final; a blocked account can be unblocked with the PIN.
**Why.** If a card is stolen, minutes matter, so nothing should wait for a person. A free-text request can mean anything, so a person reads it.
Making unblock the guarded direction means a thief with a stolen phone cannot simply undo a block.
**Cost.** More states to test (applied, pending, approved, rejected). The "specialist" is simulated by demo buttons.

### 19. Insurance reuses the payment path
**Decision.** Buying a policy is a transfer to the bank's `SERVICES` account (PIN, one-time code, idempotency key, row locks, all as for bills)
and, in the same transaction, a policy row with a unique `transfer_id`. Prices live in one table in US cents; the customer pays in the currency
of the account they choose, converted by the exchange's own code (`conversion.convert_amount`) at the same cached rates and rounded up. The
server quotes and validates; the app only shows the form; the app sends the price it showed and gets `409 price_changed` if the rate moved.
**Why.** Money moves in exactly one audited way. The unique `transfer_id` means a retried or doubled request cannot produce two policies, and
copying the holder's name and dates into the row means a later profile change cannot alter an issued certificate.
**Cost.** A price can change between quote and payment when the hourly rate refresh lands, so the customer may have to confirm twice. Claims,
renewals and cancellation are out of scope.
