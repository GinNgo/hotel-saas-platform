import {
  canSafelyRetryApiError,
  financialStateLabel,
  formatVnd,
  isApiError,
  isFinancialError,
  parseVndAmount,
} from './financial.models';

describe('financial models', () => {
  it('accepts only scale-zero non-negative VND values', () => {
    expect(parseVndAmount('125000')).toBe(125000);
    expect(() => parseVndAmount('125000.5')).toThrow();
    expect(() => parseVndAmount('-1')).toThrow();
  });

  it('formats VND using the caller locale without decimal fractions', () => {
    expect(formatVnd(125000, 'vi-VN')).toContain('125.000');
    expect(formatVnd(125000, 'en-US')).toContain('125,000');
  });

  it('presents state labels and validates the stable error shape', () => {
    expect(financialStateLabel('PAID', 'vi')).toBe('Đã thanh toán');
    expect(financialStateLabel('PAID', 'en')).toBe('Paid');
    expect(isFinancialError({ code: 'INVALID_AMOUNT', message: 'Invalid', retryable: false })).toBe(true);
    expect(isFinancialError({ code: 'INVALID_AMOUNT' })).toBe(false);
    expect(isApiError({ code: 'CONFLICT', message: 'Reload', retryable: true, currentState: 'PENDING' })).toBe(true);
    expect(canSafelyRetryApiError({ code: 'CONFLICT', message: 'Reload', retryable: true })).toBe(true);
    expect(canSafelyRetryApiError({ code: 'INVALID_REQUEST', message: 'Fix input', retryable: false })).toBe(false);
  });
});
