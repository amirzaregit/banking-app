import { tokenFromText } from '../request-link';

describe('tokenFromText', () => {
  const token = 'Ab3_dEf-9XyZ12Qw';
  it('accepts the bare token, a full link, and a link with trailing junk', () => {
    expect(tokenFromText(token)).toBe(token);
    expect(tokenFromText(`  https://demo-bank.example/pay/${token}  `)).toBe(token);
    expect(tokenFromText(`https://demo-bank.example/pay/${token}/`)).toBe(token);
    expect(tokenFromText(`https://demo-bank.example/pay/${token}?utm=1#x`)).toBe(token);
  });
  it('rejects things that cannot be a token', () => {
    for (const bad of ['', 'abc', 'hello world', 'https://example.com/', 'a/b c']) expect(tokenFromText(bad)).toBeNull();
  });
});
