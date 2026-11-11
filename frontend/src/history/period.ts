// Period filters for the History tab. The server treats `from`/`to` as inclusive UTC days (YYYY-MM-DD),
// so presets are computed in UTC too: what you see matches what the server filters.

export type PeriodKey = 'today' | 'days7' | 'days30' | 'days90' | 'thisYear' | 'all' | 'custom';
export type DateRange = { from?: string; to?: string };

const DAY_MS = 86_400_000;

const toIsoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** The range a preset stands for ("7 days" = today and the 6 days before it). `custom` is entered by hand. */
export function presetRange(key: Exclude<PeriodKey, 'custom'>, now: Date = new Date()): DateRange {
  const today = toIsoDay(now);
  const back = (days: number) => toIsoDay(new Date(now.getTime() - (days - 1) * DAY_MS));
  switch (key) {
    case 'today':
      return { from: today, to: today };
    case 'days7':
      return { from: back(7), to: today };
    case 'days30':
      return { from: back(30), to: today };
    case 'days90':
      return { from: back(90), to: today };
    case 'thisYear':
      return { from: `${now.getUTCFullYear()}-01-01`, to: today };
    case 'all':
      return {};
  }
}

export type HistoryFilter = {
  accountId?: string;
  cardId?: string;
  range: DateRange;
  flow?: 'in' | 'out';
  before?: number;
  limit?: number;
};

/** Build the query string for GET /history. Only set filters are sent; a card filter wins over an account filter. */
export function historyQuery(filter: HistoryFilter): string {
  const params: [string, string][] = [['limit', String(filter.limit ?? 30)]];
  if (filter.cardId) params.push(['card_id', filter.cardId]);
  else if (filter.accountId) params.push(['account_id', filter.accountId]);
  if (filter.range.from) params.push(['from', filter.range.from]);
  if (filter.range.to) params.push(['to', filter.range.to]);
  if (filter.flow) params.push(['flow', filter.flow]);
  if (filter.before !== undefined) params.push(['before', String(filter.before)]);
  return params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
