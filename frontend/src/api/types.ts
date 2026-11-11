// Mirrors the backend's response schemas. All money amounts are integer cents.

export type User = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  has_pin: boolean;
  created_at: string;
};

export type Account = {
  id: string;
  type: 'checking' | 'savings';
  account_number: string;
  currency: 'USD' | 'RUB' | 'IRR';
  status: 'active' | 'frozen' | 'closed';
  is_default: boolean; // receives payments sent to the owner's phone number
  balance: number;
  created_at: string;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type Transaction = {
  id: number; // ledger entry id, also the pagination cursor
  transfer_id: string;
  amount: number; // signed cents: negative = money out
  balance_after: number;
  description: string | null;
  counterparty_name: string;
  counterparty_account_number: string;
  created_at: string;
};

export type TransactionPage = { items: Transaction[]; next_cursor: number | null };

export type RecipientLookup = {
  name: string; // masked, e.g. "Ivan P."
  via: 'phone' | 'account';
  phone_masked: string | null;
  account_number: string | null;
  is_self: boolean; // the recipient is YOU
  account_id: string | null; // the destination account, ONLY when it is your own
  currency: string; // the currency the recipient's account holds
};

export type ContactMatch = { input: string; name: string };

export type TransferResult = {
  id: string;
  from_account_id: string;
  recipient_name: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  created_at: string;
  gift_design: string | null;
  new_balance: number;
};

export type DeviceSession = {
  id: string;
  device_name: string | null;
  ip_address: string | null;
  created_at: string;
  last_used_at: string;
  is_current: boolean;
};

export type Card = {
  id: string;
  account_id: string;
  last4: string;
  expiry: string; // "MM/YY"
  status: 'active' | 'frozen' | 'blocked'; // blocked is final
  created_at: string;
};

export type CardOrder = {
  id: string;
  account_id: string;
  theme: 'light' | 'dark';
  branch_id: string;
  notify_by: 'app' | 'phone';
  status: 'pending' | 'ready';
  created_at: string;
};

/** A request to block an account or a card. `pending_review` = waiting for a specialist; nothing is blocked yet. */
export type BlockRequest = {
  id: string;
  account_id: string;
  card_id: string | null;
  target: 'account' | 'card';
  reason: string;
  details: string | null;
  status: 'applied' | 'pending_review' | 'approved' | 'rejected';
  created_at: string;
};

export type PurchaseResult = { approved: boolean; transfer_id: string; new_balance: number };

export type SmsMessage = { id: string; body: string; created_at: string };

export type AppNotification = {
  id: string;
  kind: string; // payment_received, new_sign_in, pin_changed, pin_locked, card_frozen, ...
  title: string;
  body: string; // English fallback; the app writes the sentence itself from kind + params
  params: Record<string, unknown> | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationList = { items: AppNotification[]; unread_count: number };

// ---- history, cards list, rates -------------------------------------------------------

export type HistoryItem = Transaction & {
  account_id: string;
  account_type: 'checking' | 'savings';
  account_number: string;
  currency: string; // the currency of THIS line (the account's currency)
  card_id: string | null; // set when a card made this payment
};

export type CurrencyTotals = { currency: string; income: number; spending: number };
// One entry per currency: amounts of different currencies are never added together.
export type HistoryTotals = { by_currency: CurrencyTotals[]; count: number };

export type HistoryPage = { items: HistoryItem[]; next_cursor: number | null; totals: HistoryTotals };

export type CardListItem = Card & { account_type: 'checking' | 'savings'; account_number: string };

export type RatesResponse = {
  base: 'USD';
  rates: Record<string, number>; // units of each currency per 1 USD
  updated_at: string;
  source: string;
  stale: boolean; // both providers failed: these are the last known rates
};

export type ConversionQuote = {
  from_currency: string;
  to_currency: string;
  amount: number;
  to_amount: number;
  rate: number; // 1 unit of from_currency = rate units of to_currency
  rates_updated_at: string;
  stale: boolean;
};

export type ConversionResult = {
  id: string;
  from_account_id: string;
  to_account_id: string;
  from_currency: string;
  to_currency: string;
  amount: number;
  to_amount: number;
  rate: number;
  created_at: string;
  from_balance: number;
  to_balance: number;
};

// ---- payment requests, bills, gifts ---------------------------------------------------------

export type PaymentRequest = {
  id: string;
  token: string;
  link: string;
  amount: number | null; // null = the payer chooses
  currency: string;
  note: string | null;
  status: 'open' | 'paid' | 'cancelled' | 'expired';
  created_at: string;
  expires_at: string;
  account_number: string;
};

export type RequestLookup = {
  token: string;
  requester_name: string; // masked, "Ivan P."
  amount: number | null;
  currency: string;
  note: string | null;
  status: 'open' | 'paid' | 'cancelled' | 'expired';
  expires_at: string;
  account_number: string;
  is_mine: boolean;
};

export type BillProvider = {
  id: string;
  category: 'mobile' | 'internet' | 'utilities' | 'government' | 'charity';
  currency: 'RUB' | 'IRR';
  reference: 'phone_ru' | 'phone_ir' | 'account' | 'none';
  names: { en: string; ru: string; fa: string };
};

export type BillResult = { id: string; provider_id: string; provider_name: string; reference: string; amount: number; currency: string; created_at: string; new_balance: number };

// ---- insurance --------------------------------------------------------------------------------------------

export type InsuranceProduct = 'travel' | 'medical' | 'car' | 'home';

/** What to insure; which fields matter depends on the product (see `insurance/products.ts`). */
export type InsuranceDetails = {
  product: InsuranceProduct;
  plan: string;
  start_date: string;
  end_date?: string;
  region?: string;
  travelers?: number;
  months?: number;
  plate?: string;
  address?: string;
};

export type InsuranceQuote = { premium: number; coverage: number; currency: string; start_date: string; end_date: string };

/** A bought policy: every field on the certificate, frozen at purchase (in the account holder's name). */
export type InsurancePolicy = {
  id: string;
  policy_number: string;
  product: InsuranceProduct;
  plan: string;
  holder_name: string;
  premium: number;
  coverage: number;
  currency: string;
  start_date: string;
  end_date: string;
  status: 'upcoming' | 'active' | 'expired';
  details: { region?: string; travelers?: number; days?: number; months?: number; plate?: string; address?: string };
  account_number: string;
  created_at: string;
  new_balance: number | null;
};

// ---- one transaction in full ------------------------------------------------------------------------------

export type TransactionKind = 'deposit' | 'top_up' | 'transfer' | 'gift' | 'card_payment' | 'bill' | 'insurance' | 'exchange';

/** One line of the statement with everything a receipt prints (GET /transactions/{id}). */
export type TransactionDetail = {
  id: number; // the ledger entry id: the same `id` the lists use
  transfer_id: string;
  receipt_number: string; // both sides of one payment share it
  kind: TransactionKind;
  amount: number; // signed minor units of `currency`: negative = money out
  currency: string;
  balance_after: number;
  created_at: string;
  status: string;
  description: string | null;
  counterparty_name: string;
  counterparty_account_number: string;
  account_id: string;
  account_type: string;
  account_number: string;
  card_last4: string | null;
  provider_id: string | null;
  gift_design: string | null;
  exchange: { rate: number; other_amount: number; other_currency: string } | null;
};
