import { convert, decimalsFor, formatNumber, pairRate, parseAmountInput } from '../convert';

const RATES = { USD: 1, RUB: 80, IRR: 1_000_000, AED: 3.6725, EUR: 0.9, CNY: 7.2, JPY: 150 };

describe('conversion goes through USD', () => {
  it('USD to RUB', () => expect(convert(10, RATES, 'USD', 'RUB')).toBe(800));
  it('RUB to USD', () => expect(convert(800, RATES, 'RUB', 'USD')).toBe(10));
  it('cross pair', () => expect(pairRate(RATES, 'EUR', 'RUB')).toBeCloseTo(80 / 0.9, 10));
  it('same currency is 1', () => expect(pairRate(RATES, 'AED', 'AED')).toBe(1));
  it('missing or zero rate gives null instead of Infinity', () => {
    expect(pairRate(RATES, 'USD', 'XXX')).toBeNull();
    expect(pairRate({ ...RATES, RUB: 0 }, 'RUB', 'USD')).toBeNull();
  });
});

describe('formatNumber', () => {
  it('groups thousands', () => expect(formatNumber(1234567.891, 0)).toBe('1,234,568'));
  it('chooses digits by size', () => {
    expect(decimalsFor(1_000_000)).toBe(0);
    expect(decimalsFor(3.6725)).toBe(2);
    expect(decimalsFor(0.0125)).toBe(4);
    expect(decimalsFor(0.0000123)).toBe(6);
    expect(formatNumber(0.0125)).toBe('0.0125');
    expect(formatNumber(1_000_000)).toBe('1,000,000');
  });
  it('negative and non-finite', () => {
    expect(formatNumber(-1234.5, 1)).toBe('-1,234.5');
    expect(formatNumber(-0.001, 2)).toBe('0.00'); // no "-0.00"
    expect(formatNumber(Infinity)).toBe('');
  });
});

describe('parseAmountInput', () => {
  it('accepts comma or dot decimals and spaces', () => {
    expect(parseAmountInput('1 234,5')).toBe(1234.5);
    expect(parseAmountInput('10.25')).toBe(10.25);
    expect(parseAmountInput('0')).toBe(0);
  });
  it('rejects junk and empties', () => {
    for (const bad of ['', '.', 'abc', '1.2.3', '-5', '1e3']) expect(parseAmountInput(bad)).toBeNull();
  });
});

describe('round trips', () => {
  it('converting there and back returns the starting amount', () => {
    const a = convert(5000, RATES, 'RUB', 'IRR')!;
    expect(convert(a, RATES, 'IRR', 'RUB')).toBeCloseTo(5000, 6);
  });
});
