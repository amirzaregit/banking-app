import { formatMoney, groupDigits, MAX_AMOUNT_CENTS, parseAmount, sanitizeAmountInput, ungroupInput } from '../money';

describe('formatMoney', () => {
  it.each([
    [0, '$0.00'],
    [5, '$0.05'],
    [2050, '$20.50'],
    [100000, '$1,000.00'],
    [123456789, '$1,234,567.89'],
    [-2000, '-$20.00'],
    [-5, '-$0.05'],
  ])('%d cents -> %s', (cents, expected) => {
    expect(formatMoney(cents)).toBe(expected);
  });

  it('labels non-USD currencies', () => {
    expect(formatMoney(1000, 'EUR')).toBe('EUR 10.00');
  });
});


describe('parseAmount', () => {
  it.each([
    ['20', 2000],
    ['20.5', 2050],
    ['20.50', 2050],
    ['20,50', 2050], // comma decimal keyboards
    ['0.01', 1],
    ['0.1', 10],
    ['  7 ', 700],
    ['007', 700],
    ['1000000', MAX_AMOUNT_CENTS],
    ['0.29', 29], // 0.29 * 100 is 28.999... in floating point; we must get exactly 29
    ['19.99', 1999],
  ])('%j -> %d cents', (text, cents) => {
    expect(parseAmount(text)).toBe(cents);
  });

  it.each(['', ' ', '0', '0.00', 'abc', '20.555', '1,000.50', '-5', '+5', '.5', '5.', '1e3', '1000000.01', '99999999999999999999'])(
    'rejects %j',
    (text) => {
      expect(parseAmount(text)).toBeNull();
    },
  );
});

describe('sanitizeAmountInput', () => {
  it.each([
    ['12', '12'],
    ['12.3456', '12.34'],
    ['12,5', '12.5'],
    ['1.2.3', '1.23'],
    ['abc1x2', '12'],
    ['-5', '5'],
    ['.', '.'],
    ['', ''],
  ])('%j -> %j', (input, output) => {
    expect(sanitizeAmountInput(input)).toBe(output);
  });
});

describe('other currencies', () => {
  it('formats each currency with its own symbol and decimals', () => {
    expect(formatMoney(123_456, 'USD')).toBe('$1,234.56');
    expect(formatMoney(123_456, 'RUB')).toBe('₽1,234.56');
    expect(formatMoney(1_234_567, 'IRR')).toBe('IRR 1,234,567');
    expect(formatMoney(-5, 'RUB')).toBe('-₽0.05');
    expect(formatMoney(0, 'IRR')).toBe('IRR 0');
  });
  it('rials have no decimals, rubles have two', () => {
    expect(parseAmount('50000', 'IRR')).toBe(50_000);
    expect(parseAmount('50000.5', 'IRR')).toBeNull();
    expect(parseAmount('12.5', 'RUB')).toBe(1_250);
    expect(parseAmount('12.555', 'RUB')).toBeNull();
  });
  it('each currency has its own cap', () => {
    expect(parseAmount('1000000', 'USD')).toBe(100_000_000);
    expect(parseAmount('1000001', 'USD')).toBeNull();
    expect(parseAmount('1800000000000', 'IRR')).toBe(1_800_000_000_000);
    expect(parseAmount('1800000000001', 'IRR')).toBeNull();
  });
  it('typing a decimal point is not allowed for rials', () => {
    expect(sanitizeAmountInput('12.50', 'IRR')).toBe('12');
    expect(sanitizeAmountInput('12.567', 'RUB')).toBe('12.56');
  });
});

describe('groupDigits / ungroupInput (thousands commas while typing an amount)', () => {
  it('groups by three, keeping the decimals and a trailing dot', () => {
    expect(groupDigits('')).toBe('');
    expect(groupDigits('999')).toBe('999');
    expect(groupDigits('1000')).toBe('1,000');
    expect(groupDigits('1234567.5')).toBe('1,234,567.5');
    expect(groupDigits('1234.')).toBe('1,234.');
    expect(groupDigits('200000000')).toBe('200,000,000'); // 20 million toman, in rials
  });
  it('takes the commas out again, so the stored text stays plain', () => {
    expect(ungroupInput('1,234,567.5')).toBe('1234567.5');
    expect(ungroupInput('1,2345')).toBe('12345');
  });
  it('reads a comma typed last as the decimal point (comma keyboards)', () => {
    expect(ungroupInput('20,')).toBe('20.');
    expect(ungroupInput('1,234,')).toBe('1234.');
    expect(ungroupInput('20.5,')).toBe('20.5'); // there is already a decimal point
  });
  it('round-trips through sanitizeAmountInput for each currency', () => {
    for (const [currency, typed] of [['USD', '1,234.567'], ['RUB', '10,000'], ['IRR', '200,000,000.5']] as const) {
      const stored = sanitizeAmountInput(ungroupInput(typed), currency);
      expect(stored.includes(',')).toBe(false);
      expect(groupDigits(stored).replace(/,/g, '')).toBe(stored);
    }
  });
});
