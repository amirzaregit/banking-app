// A stand-in for the AI assistant. Nothing here talks to a network: `BotProvider` is the seam where a real
// model would plug in later (swap `localBot` for one that calls your server) without touching the chat screen.

export type BotTopic = 'pin' | 'card' | 'limits' | 'branch' | 'rates' | 'contact' | 'fallback';

export interface BotProvider {
  /** Decide which canned answer fits the user's message. The screen translates the topic into text. */
  reply(message: string): Promise<BotTopic>;
}

// Words are matched in English, Russian and Persian. Order matters: the first topic with a hit wins.
const KEYWORDS: [BotTopic, string[]][] = [
  ['pin', ['pin', 'password', 'пин', 'пароль', 'رمز', 'پین']],
  ['card', ['card', 'freeze', 'frozen', 'карт', 'заморо', 'کارت', 'مسدود']],
  ['limits', ['limit', 'otp', 'code', 'sms', 'лимит', 'код', 'سقف', 'کد', 'پیامک']],
  ['branch', ['branch', 'office', 'address', 'map', 'отделен', 'офис', 'адрес', 'شعبه', 'شعب', 'آدرس', 'نشانی']],
  ['rates', ['rate', 'exchange', 'dollar', 'currency', 'курс', 'валют', 'доллар', 'نرخ', 'ارز', 'دلار']],
  ['contact', ['phone', 'call', 'email', 'mail', 'contact', 'телефон', 'позвон', 'почт', 'تلفن', 'تماس', 'ایمیل']],
];

export function pickTopic(message: string): BotTopic {
  const text = message.toLowerCase();
  for (const [topic, words] of KEYWORDS) {
    if (words.some((w) => text.includes(w))) return topic;
  }
  return 'fallback';
}

/** Answers from the keyword table after a short "typing" pause so the chat feels alive. */
export const localBot: BotProvider = {
  async reply(message) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return pickTopic(message);
  },
};

export const SUPPORT_PHONE = '+7 (800) 555-35-35'; // fictional
export const SUPPORT_EMAIL = 'support@demo-bank.example'; // .example is reserved: it can never be a real address
