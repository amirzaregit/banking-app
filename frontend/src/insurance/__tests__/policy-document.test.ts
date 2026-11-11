import type { InsurancePolicy } from '@/api/types';

import { buildPolicyHtml, policyFileName } from '../policy-document';

const policy: InsurancePolicy = {
  id: 'p1',
  policy_number: 'INS-TRV-2026-K7Q2M9XA',
  product: 'travel',
  plan: 'standard',
  holder_name: 'Alice <b>Smith</b>',
  premium: 6500,
  coverage: 5_000_000,
  currency: 'USD',
  start_date: '2026-11-10',
  end_date: '2026-11-19',
  status: 'upcoming',
  details: { region: 'europe', travelers: 2, days: 10 },
  account_number: '40817810000000001234',
  created_at: '2026-11-08T10:00:00Z',
  new_balance: null,
};

describe('buildPolicyHtml', () => {
  it('prints the holder, number, period, cover and premium', () => {
    const html = buildPolicyHtml(policy, 'en');
    expect(html).toContain('Insurance Policy');
    expect(html).toContain('INS-TRV-2026-K7Q2M9XA');
    expect(html).toContain('10 Nov 2026');
    expect(html).toContain('$50,000.00');
    expect(html).toContain('$65.00');
    expect(html).toContain('Europe');
    expect(html).toContain('••1234');
    expect(html).toContain('not a real insurance contract');
  });

  it('escapes the holder name instead of injecting markup', () => {
    const html = buildPolicyHtml(policy, 'en');
    expect(html).toContain('Alice &lt;b&gt;Smith&lt;/b&gt;');
    expect(html).not.toContain('Alice <b>Smith</b>');
  });

  it('escapes a hostile address', () => {
    const html = buildPolicyHtml({ ...policy, product: 'home', plan: 'basic', details: { address: '<script>alert(1)</script>' } }, 'en');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('is right-to-left with Persian digits in Persian', () => {
    const html = buildPolicyHtml(policy, 'fa');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('بیمه‌نامه');
    expect(html).toContain('۱۴۰۵'); // the Jalali year of 2026-11-10
  });

  it('writes the Russian certificate in Russian', () => {
    expect(buildPolicyHtml(policy, 'ru')).toContain('Страховой полис');
  });

  it('names the file after the policy number', () => {
    expect(policyFileName(policy)).toBe('insurance-INS-TRV-2026-K7Q2M9XA.pdf');
  });
});
