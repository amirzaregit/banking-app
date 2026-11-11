import { historyQuery, presetRange } from '../period';

const NOW = new Date('2026-10-30T15:00:00Z');

describe('presetRange', () => {
  it('today is a single day', () => expect(presetRange('today', NOW)).toEqual({ from: '2026-10-30', to: '2026-10-30' }));
  it('7 days includes today plus the 6 before it', () => expect(presetRange('days7', NOW)).toEqual({ from: '2026-10-24', to: '2026-10-30' }));
  it('30 days crosses a month boundary', () => expect(presetRange('days30', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-30' }));
  it('90 days', () => expect(presetRange('days90', NOW)).toEqual({ from: '2026-08-02', to: '2026-10-30' }));
  it('this year starts on January 1st', () => expect(presetRange('thisYear', NOW)).toEqual({ from: '2026-01-01', to: '2026-10-30' }));
  it('all time has no bounds', () => expect(presetRange('all', NOW)).toEqual({}));
});

describe('historyQuery', () => {
  it('sends only the filters that are set', () => {
    expect(historyQuery({ range: {} })).toBe('limit=30');
    expect(historyQuery({ range: { from: '2026-10-01', to: '2026-10-30' }, flow: 'out', before: 12, limit: 20 })).toBe('limit=20&from=2026-10-01&to=2026-10-30&flow=out&before=12');
  });
  it('a card filter wins over an account filter', () => {
    expect(historyQuery({ range: {}, accountId: 'A', cardId: 'C' })).toBe('limit=30&card_id=C');
    expect(historyQuery({ range: {}, accountId: 'A' })).toBe('limit=30&account_id=A');
  });
});
