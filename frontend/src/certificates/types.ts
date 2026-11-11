export const CERTIFICATE_TYPES = ['account_confirmation', 'balance', 'statement', 'bank_details', 'income', 'proof_of_funds', 'relationship', 'no_debt'] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

/** What each type needs from the user: an account, and/or a period. Must match the backend (`services/certificates.py`). */
export const NEEDS: Record<CertificateType, { account: boolean; period: boolean }> = {
  account_confirmation: { account: true, period: false },
  balance: { account: true, period: false },
  statement: { account: true, period: true },
  bank_details: { account: true, period: false },
  income: { account: true, period: true },
  proof_of_funds: { account: true, period: false },
  relationship: { account: false, period: false },
  no_debt: { account: false, period: false },
};

export type CertificateLang = 'en' | 'ru' | 'fa';

export type CertificateSummary = { id: string; type: CertificateType; language: CertificateLang; ref_number: string; issued_at: string; account_number: string | null };

/** The frozen facts of an issued certificate (`data` differs per type; see the backend builder). */
export type Certificate = {
  id: string;
  type: CertificateType;
  language: CertificateLang;
  ref_number: string;
  issued_at: string;
  period_from: string | null;
  period_to: string | null;
  kept: boolean; // false = not stored on the server: the customer saves the PDF on their phone
  data: CertificateData;
};

export type CertificateData = {
  issued_on: string;
  customer: { full_name: string; email: string; since: string };
  account?: { number: string; type: string; currency: string; status: string; opened_on: string; balance: number };
  bank?: { name: string; bic: string; swift: string; correspondent_account: string; inn: string };
  period?: { from: string | null; to: string | null };
  totals?: { income: number; spending: number; count: number };
  truncated?: boolean;
  lines?: { date: string; description: string | null; counterparty: string; counterparty_number: string; amount: number; balance_after: number }[];
  months?: { month: string; amount: number; count: number }[];
  total?: number;
  count?: number;
  balances?: { date: string; amount: number }[];
  lowest?: number;
  average?: number;
  accounts?: { number: string; type: string; currency: string; status: string }[];
  accounts_checked?: number;
  overdrawn?: number;
};
