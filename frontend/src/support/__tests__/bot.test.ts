import { en } from '@/i18n/en';
import { fa } from '@/i18n/fa';
import { ru } from '@/i18n/ru';

import { localBot, pickTopic, SUPPORT_EMAIL, SUPPORT_PHONE } from '../bot';

describe('pickTopic', () => {
  it.each([
    ['I forgot my PIN', 'pin'],
    ['Как заморозить карту?', 'card'],
    ['رمزم را فراموش کردم', 'pin'],
    ['what is the payment limit', 'limits'],
    ['where is the nearest office', 'branch'],
    ['شعبه کجاست', 'branch'],
    ['dollar exchange rate', 'rates'],
    ['какой курс доллара', 'rates'],
    ['how can I call you', 'contact'],
    ['tell me a joke', 'fallback'],
    ['', 'fallback'],
  ])('%s -> %s', (message, topic) => expect(pickTopic(message)).toBe(topic));
});

it('the local bot answers without a network', async () => {
  jest.useFakeTimers();
  const pending = localBot.reply('pin');
  jest.advanceTimersByTime(1000);
  await expect(pending).resolves.toBe('pin');
  jest.useRealTimers();
});

it('every topic has an answer in all three languages', () => {
  for (const topic of ['pin', 'card', 'limits', 'branch', 'rates', 'contact', 'fallback'] as const) {
    for (const c of [en, ru, fa]) expect(c.support.answers[topic].length).toBeGreaterThan(10);
  }
});

it('contact details are obviously fictional', () => {
  expect(SUPPORT_EMAIL.endsWith('.example')).toBe(true);
  expect(SUPPORT_PHONE).toMatch(/^\+7 \(800\) 555-/);
});

it('the quick-reply chips lead to the topic they promise, in every language', () => {
  const expected = { pin: 'pin', card: 'card', limits: 'limits', branch: 'branch' } as const;
  for (const c of [en, ru, fa]) {
    for (const [key, topic] of Object.entries(expected)) expect(pickTopic(c.support.quick[key as keyof typeof expected])).toBe(topic);
  }
});
