import { Injectable } from '@angular/core';
import { BehaviorSubject, defer, Observable, Subject, throwError } from 'rxjs';
import { finalize, map, shareReplay, takeUntil } from 'rxjs/operators';
import { isApiError } from '../../shared/financial/financial.models';

export type AsyncActionPolicy = 'join' | 'replace';

interface ActiveAction {
  token: symbol;
  cancel$: Subject<void>;
  result$: Observable<unknown>;
}

/** Coordinates cancellable reads and duplicate-safe mutations by a stable UI key. */
@Injectable({ providedIn: 'root' })
export class AsyncActionCoordinatorService {
  private readonly active = new Map<string, ActiveAction>();
  private readonly busySubject = new BehaviorSubject<ReadonlySet<string>>(new Set());

  readonly busyKeys$ = this.busySubject.asObservable();

  run<T>(key: string, operation: () => Observable<T>, policy: AsyncActionPolicy = 'join'): Observable<T> {
    const normalizedKey = this.normalizeKey(key);
    const existing = this.active.get(normalizedKey);
    if (existing && policy === 'join') return existing.result$ as Observable<T>;
    if (existing) this.cancel(normalizedKey);

    const token = Symbol(normalizedKey);
    const cancel$ = new Subject<void>();
    const result$ = defer(operation).pipe(
      takeUntil(cancel$),
      finalize(() => {
        if (this.active.get(normalizedKey)?.token === token) {
          this.active.delete(normalizedKey);
          this.publishBusyKeys();
        }
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.active.set(normalizedKey, { token, cancel$, result$ });
    this.publishBusyKeys();
    return result$;
  }

  runLatest<T>(key: string, operation: () => Observable<T>): Observable<T> {
    return this.run(key, operation, 'replace');
  }

  cancel(key: string): void {
    const normalizedKey = this.normalizeKey(key);
    const current = this.active.get(normalizedKey);
    if (!current) return;
    current.cancel$.next();
    current.cancel$.complete();
  }

  isBusy(key: string): boolean {
    return this.active.has(this.normalizeKey(key));
  }

  isSafeToRetry(error: unknown): boolean {
    const payload = isApiError(error)
      ? error
      : (error as { error?: unknown } | null)?.error;
    return isApiError(payload) && payload.retryable === true;
  }

  retry<T>(key: string, operation: () => Observable<T>, error: unknown): Observable<T> {
    return this.isSafeToRetry(error)
      ? this.run(key, operation, 'replace')
      : throwError(() => error);
  }

  busy$(key: string): Observable<boolean> {
    const normalizedKey = this.normalizeKey(key);
    return this.busyKeys$.pipe(map(keys => keys.has(normalizedKey)));
  }

  private normalizeKey(key: string): string {
    const normalized = key.trim().replace(/[^A-Za-z0-9._:-]+/g, '-').slice(0, 120);
    if (!normalized) throw new Error('Async action key is required.');
    return normalized;
  }

  private publishBusyKeys(): void {
    this.busySubject.next(new Set(this.active.keys()));
  }
}
