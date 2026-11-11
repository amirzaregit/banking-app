import { ApiError } from '@/api/client';

import { describeError } from '../errors';

describe('describeError', () => {
  it('names the phone in the code-sent sentence when the server sends one', () => {
    const e = new ApiError(428, 'x', 'otp_required', { phone: '+7 912 ••• •• 89' });
    expect(describeError('en', e)).toBe('We sent a 6-digit code to +7 912 ••• •• 89. Enter it to confirm this payment.');
  });

  it('never shows a raw {{phone}} when there is no phone number to name', () => {
    for (const lang of ['en', 'ru', 'fa'] as const) {
      for (const params of [undefined, { phone: null }]) {
        const text = describeError(lang, new ApiError(428, 'x', 'otp_required', params));
        expect(text).not.toContain('{{');
        expect(text.length).toBeGreaterThan(5);
      }
    }
  });

  it('falls back to the generic sentence for an unknown code', () => {
    expect(describeError('en', new ApiError(400, 'x', 'no_such_code'))).toBe('Something went wrong. Please try again.');
  });
});
