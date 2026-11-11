import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { TransferResult } from '@/api/types';

/** Who is being paid. `value` is what we send back to the server (phone or account number). */
export type Recipient = {
  via: 'phone' | 'account';
  value: string;
  name: string; // the masked name the bank returned, e.g. "Bob T."
  hint: string; // what the user recognises: contact name, masked phone, or account number
  accountId?: string | null; // set ONLY when the destination is one of your own accounts
  currency?: string; // the currency the recipient's account holds, when known (a phone-book match does not know it)
};

type Draft = {
  recipient: Recipient | null;
  fromAccountId: string | null;
  amountCents: number | null;
  note: string;
  result: TransferResult | null;
  usedPin: string | null; // the PIN of a payment that just succeeded: lets us offer fingerprint payments
  gift: { design: string; message: string } | null; // a greeting card that goes with the money
  requestToken: string | null; // the payment request (link / QR) this payment settles
  fixedAmount: number | null; // when the request asks for an exact amount (minor units)
};

const EMPTY: Draft = { recipient: null, fromAccountId: null, amountCents: null, note: '', result: null, usedPin: null, gift: null, requestToken: null, fixedAmount: null };

type DraftValue = {
  draft: Draft;
  /** Bumps every time a payment flow ends. Use it as a React `key` to clear stale forms. */
  generation: number;
  /** Picking a recipient starts a fresh payment; `extra` carries a gift card or a payment request along with it. */
  startPayment: (recipient: Recipient, extra?: Partial<Pick<Draft, 'gift' | 'requestToken' | 'fixedAmount' | 'note'>>) => void;
  update: (patch: Partial<Draft>) => void;
  reset: () => void;
};

const DraftContext = createContext<DraftValue | null>(null);

export function useDraft(): DraftValue {
  const value = useContext(DraftContext);
  if (!value) throw new Error('useDraft must be used inside <DraftProvider>');
  return value;
}

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [generation, setGeneration] = useState(0);
  const startPayment = useCallback((recipient: Recipient, extra?: Partial<Draft>) => setDraft({ ...EMPTY, recipient, ...extra }), []);
  const update = useCallback((patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch })), []);
  const reset = useCallback(() => {
    setDraft(EMPTY);
    setGeneration((g) => g + 1);
  }, []);
  const value = useMemo(
    () => ({ draft, generation, startPayment, update, reset }),
    [draft, generation, startPayment, update, reset],
  );
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}
