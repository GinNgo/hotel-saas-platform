import { AsyncActionCoordinatorService } from './async-action-coordinator.service';
import { Observable, Subject, of } from 'rxjs';

describe('AsyncActionCoordinatorService', () => {
  let service: AsyncActionCoordinatorService;

  beforeEach(() => {
    service = new AsyncActionCoordinatorService();
  });

  it('joins duplicate subscriptions onto one in-flight request', () => {
    const source = new Subject<string>();
    const operation = vi.fn(() => source.asObservable());
    const first: string[] = [];
    const second: string[] = [];

    service.run('booking:create', operation).subscribe(value => first.push(value));
    service.run('booking:create', operation).subscribe(value => second.push(value));
    source.next('created');
    source.complete();

    expect(operation).toHaveBeenCalledOnce();
    expect(first).toEqual(['created']);
    expect(second).toEqual(['created']);
    expect(service.isBusy('booking:create')).toBe(false);
  });

  it('cancels the previous request for latest-only reads', () => {
    const first = new Subject<string>();
    const second = new Subject<string>();
    const operation = vi.fn<() => Observable<string>>()
      .mockReturnValueOnce(first.asObservable())
      .mockReturnValueOnce(second.asObservable());
    const values: string[] = [];

    service.runLatest('search:suggestions', operation).subscribe(value => values.push(value));
    service.runLatest('search:suggestions', operation).subscribe(value => values.push(value));
    first.next('stale');
    second.next('fresh');

    expect(values).toEqual(['fresh']);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry a mutation when the server did not classify it as safe', () => {
    const operation = vi.fn(() => of('created'));
    const error = { error: { code: 'INVALID_REQUEST', message: 'Fix input', retryable: false } };
    let captured: unknown;

    service.retry('booking:create', operation, error).subscribe({ error: value => captured = value });

    expect(captured).toBe(error);
    expect(operation).not.toHaveBeenCalled();
  });

  it('allows an explicitly classified safe retry', () => {
    const operation = vi.fn(() => of('replayed'));
    const error = { error: { code: 'CONCURRENT_MODIFICATION', message: 'Reload', retryable: true } };
    const values: string[] = [];

    service.retry('booking:create', operation, error).subscribe(value => values.push(value));

    expect(values).toEqual(['replayed']);
    expect(operation).toHaveBeenCalledOnce();
  });
});
