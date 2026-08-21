export const ACCOUNT_DISABLED_CODE = 'ACCOUNT_DISABLED';
export const ACCOUNT_DISABLED_MESSAGE =
  'Tài khoản đã bị tạm ngưng hoặc vô hiệu hóa. Vui lòng liên hệ bộ phận hỗ trợ. / This account is suspended or disabled.';

export function isAccountDisabledError(error: unknown): boolean {
  const candidate = error as { error?: { code?: string } } | null;
  return candidate?.error?.code === ACCOUNT_DISABLED_CODE;
}

export function authenticationErrorMessage(error: unknown, fallback: string): string {
  return isAccountDisabledError(error) ? ACCOUNT_DISABLED_MESSAGE : fallback;
}
