export type FinancialContext = 'PROPERTY_COMMERCE' | 'PLATFORM_BILLING';
export type FinancialCurrency = 'VND';
export type FinancialAmount = number | string;

export interface FinancialMoney {
  amount: FinancialAmount;
  currency: FinancialCurrency;
}

export interface ApiError {
  status?: number;
  code: string;
  message: string;
  correlationId?: string;
  fieldErrors?: Record<string, string>;
  retryable: boolean;
  currentState?: string;
  path?: string;
}

export type FinancialError = ApiError;

export type FinancialState =
  | 'CREATED'
  | 'PENDING'
  | 'PENDING_VERIFICATION'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'DEPOSIT_PAID'
  | 'PAID'
  | 'OVERPAID';

export function parseVndAmount(value: FinancialAmount): number {
  const text = typeof value === 'string' ? value.trim() : String(value);
  if (!/^\d+$/.test(text)) {
    throw new Error('VND amount must be a non-negative integer');
  }
  const amount = Number(text);
  if (!Number.isSafeInteger(amount)) {
    throw new Error('VND amount is outside the supported safe range');
  }
  return amount;
}

export function formatVnd(value: FinancialAmount, locale = 'vi-VN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(parseVndAmount(value));
}

export function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ApiError>;
  return typeof candidate.code === 'string'
    && typeof candidate.message === 'string'
    && typeof candidate.retryable === 'boolean';
}

export function isFinancialError(value: unknown): value is FinancialError {
  return isApiError(value);
}

export function canSafelyRetryApiError(value: unknown): boolean {
  return isApiError(value) && value.retryable;
}

const STATE_LABELS: Record<string, { vi: string; en: string }> = {
  CREATED: { vi: 'Mới tạo', en: 'Created' },
  PENDING: { vi: 'Đang chờ', en: 'Pending' },
  PENDING_VERIFICATION: { vi: 'Chờ xác minh', en: 'Pending verification' },
  PROCESSING: { vi: 'Đang xử lý', en: 'Processing' },
  SUCCESS: { vi: 'Thành công', en: 'Successful' },
  FAILED: { vi: 'Thất bại', en: 'Failed' },
  CANCELLED: { vi: 'Đã hủy', en: 'Cancelled' },
  EXPIRED: { vi: 'Hết hạn', en: 'Expired' },
  PARTIALLY_REFUNDED: { vi: 'Hoàn một phần', en: 'Partially refunded' },
  REFUNDED: { vi: 'Đã hoàn tiền', en: 'Refunded' },
  UNPAID: { vi: 'Chưa thanh toán', en: 'Unpaid' },
  PARTIALLY_PAID: { vi: 'Đã thanh toán một phần', en: 'Partially paid' },
  DEPOSIT_PAID: { vi: 'Đã đặt cọc', en: 'Deposit paid' },
  PAID: { vi: 'Đã thanh toán', en: 'Paid' },
  OVERPAID: { vi: 'Thanh toán dư', en: 'Overpaid' },
};

export function financialStateLabel(state: string, locale: 'vi' | 'en' = 'vi'): string {
  return STATE_LABELS[state]?.[locale] ?? state;
}
