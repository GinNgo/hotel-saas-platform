import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { isApiError } from '../../shared/financial/financial.models';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requestId(): string {
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `cx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const financialRequestInterceptor: HttpInterceptorFn = (req, next) => {
  const isApiRequest = req.url.includes('/api/');
  const isFinancialMutation = isApiRequest
    && MUTATING_METHODS.has(req.method)
    && !req.url.includes('/api/auth/');
  let outgoing = req;

  if (isApiRequest && !req.headers.has('X-Correlation-ID')) {
    outgoing = outgoing.clone({ setHeaders: { 'X-Correlation-ID': requestId() } });
  }
  if (isFinancialMutation && !req.headers.has('Idempotency-Key')) {
    outgoing = outgoing.clone({ setHeaders: { 'Idempotency-Key': requestId() } });
  }

  return next(outgoing).pipe(
    catchError((error: HttpErrorResponse) => {
      // Keep the shared backend contract intact so feature services can branch on retryable/currentState.
      if (isApiError(error.error)) return throwError(() => error);
      return throwError(() => error);
    }),
  );
};
