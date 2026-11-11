import { ARTICLES, CATEGORIES } from '../articles';

describe('newsletter content', () => {
  it('has unique ids and every category is used', () => {
    expect(new Set(ARTICLES.map((a) => a.id)).size).toBe(ARTICLES.length);
    for (const c of CATEGORIES) expect(ARTICLES.some((a) => a.category === c)).toBe(true);
  });
  it.each(ARTICLES.map((a) => [a.id, a] as const))('%s is complete in en, ru and fa', (_id, a) => {
    for (const lang of ['en', 'ru', 'fa'] as const) {
      expect(a.title[lang].length).toBeGreaterThan(5);
      expect(a.summary[lang].length).toBeGreaterThan(15);
      expect(a.body[lang].length).toBeGreaterThanOrEqual(3);
      for (const paragraph of a.body[lang]) expect(paragraph.length).toBeGreaterThan(40);
    }
    expect(a.minutes).toBeGreaterThan(0);
  });
  it('the Russian and Persian texts are really translated, not copies of English', () => {
    for (const a of ARTICLES) for (const lang of ['ru', 'fa'] as const) expect(a.title[lang]).not.toBe(a.title.en);
  });
  it('Persian articles contain Persian letters and Russian ones Cyrillic', () => {
    for (const a of ARTICLES) {
      expect(a.body.fa.join(' ')).toMatch(/[؀-ۿ]/);
      expect(a.body.ru.join(' ')).toMatch(/[а-яА-Я]/);
    }
  });
});
