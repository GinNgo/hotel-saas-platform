import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NEVER, of, throwError } from 'rxjs';
import { LocaleService } from '../../../core/i18n/locale.service';
import {
  PropertyPaymentAttempt,
  PropertyPaymentService,
} from '../../../core/services/property-payment.service';
import { PropertyPaymentPanelComponent } from './property-payment-panel.component';

describe('PropertyPaymentPanelComponent', () => {
  let fixture: ComponentFixture<PropertyPaymentPanelComponent>;
  let component: PropertyPaymentPanelComponent;
  let localeService: LocaleService;
  let paymentApi: {
    getAttempt: ReturnType<typeof vi.fn>;
    createAttempt: ReturnType<typeof vi.fn>;
    cancelAttempt: ReturnType<typeof vi.fn>;
    confirmManual: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    localStorage.clear();
    paymentApi = {
      getAttempt: vi.fn(() => NEVER),
      createAttempt: vi.fn(),
      cancelAttempt: vi.fn(),
      confirmManual: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PropertyPaymentPanelComponent],
      providers: [
        LocaleService,
        { provide: PropertyPaymentService, useValue: paymentApi },
      ],
    }).compileComponents();

    localeService = TestBed.inject(LocaleService);
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('renders pending manual instructions from the server-owned attempt', async () => {
    createComponent(paymentAttempt());
    startComponent();

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.payment-panel')?.getAttribute('aria-busy')).toBe('true');

    await vi.waitFor(() => expect(paymentApi.getAttempt).toHaveBeenCalledWith('attempt-1'));

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Thanh toán bảo mật');
    expect(text).toContain('300.000');
    expect(text).toContain('Ngân hàng Demo');
    expect(text).toContain('**** 6789');
    expect(text).toContain('LS91-DEPOSIT');
    expect(text).toContain('Mô phỏng - không dùng tiền thật');
  });

  it('updates to success from read-only polling and stops polling', async () => {
    const updated = paymentAttempt({ status: 'SUCCESS' });
    const emitted = vi.fn();
    paymentApi.getAttempt.mockReturnValue(of(updated));
    createComponent(paymentAttempt());
    component.attemptChange.subscribe(emitted);

    startComponent();
    await vi.waitFor(() => expect(component.attempt.status).toBe('SUCCESS'));
    fixture.detectChanges();

    expect(component.polling).toBe(false);
    expect(emitted).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Thành công');
    expectNoFinancialMutation();
  });

  it.each([
    ['FAILED', 'Thất bại'],
    ['EXPIRED', 'Hết hạn'],
  ] as const)('renders the %s terminal state with a safe payment retry', (status, label) => {
    createComponent(paymentAttempt({
      status,
      expiresAt: '2026-08-10T11:55:00Z',
    }));
    startComponent();

    expect(fixture.nativeElement.textContent).toContain(label);
    expect(fixture.nativeElement.querySelector('.retry-payment')).not.toBeNull();
    expect(paymentApi.getAttempt).not.toHaveBeenCalled();
  });

  it('recovers from a polling error through a status-only retry', async () => {
    paymentApi.getAttempt
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of(paymentAttempt({ status: 'SUCCESS' })));
    createComponent(paymentAttempt());
    startComponent();

    await vi.waitFor(() => expect(component.pollError).toBe(true));
    fixture.detectChanges();
    const retryStatus = fixture.nativeElement.querySelector('.poll-error button') as HTMLButtonElement;
    retryStatus.click();
    await vi.waitFor(() => expect(component.attempt.status).toBe('SUCCESS'));
    fixture.detectChanges();

    expect(paymentApi.getAttempt).toHaveBeenCalledTimes(2);
    expect(component.attempt.status).toBe('SUCCESS');
    expect(component.pollError).toBe(false);
    expectNoFinancialMutation();
  });

  it('emits a terminal retry request without performing a financial mutation', () => {
    const retryRequested = vi.fn();
    createComponent(paymentAttempt({ status: 'FAILED' }));
    component.retryRequested.subscribe(retryRequested);
    startComponent();

    const retryPayment = fixture.nativeElement.querySelector('.retry-payment') as HTMLButtonElement;
    retryPayment.click();

    expect(retryRequested).toHaveBeenCalledOnce();
    expectNoFinancialMutation();
  });

  it('switches the payment instructions between Vietnamese and English', () => {
    createComponent(paymentAttempt({ status: 'FAILED' }));
    startComponent();
    expect(fixture.nativeElement.textContent).toContain('Thanh toán bảo mật');

    localeService.setLocale('en');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Secure payment');
    expect(text).toContain('Required transfer content');
    expect(text).toContain('Simulator - no real money');
  });

  it('does not offer simulator confirmation for non-confirmable active states', () => {
    createComponent(paymentAttempt({ status: 'CREATED' }));
    expect(component.canConfirmSimulator).toBe(false);

    component.attempt = paymentAttempt({ status: 'CANCELLED' });
    expect(component.canConfirmSimulator).toBe(false);
  });

  function createComponent(attempt: PropertyPaymentAttempt): void {
    fixture = TestBed.createComponent(PropertyPaymentPanelComponent);
    component = fixture.componentInstance;
    component.attempt = attempt;
  }

  function startComponent(): void {
    fixture.detectChanges();
  }

  function expectNoFinancialMutation(): void {
    expect(paymentApi.createAttempt).not.toHaveBeenCalled();
    expect(paymentApi.cancelAttempt).not.toHaveBeenCalled();
    expect(paymentApi.confirmManual).not.toHaveBeenCalled();
  }

  function paymentAttempt(overrides: Partial<PropertyPaymentAttempt> = {}): PropertyPaymentAttempt {
    return {
      attemptId: 'attempt-1',
      reservationId: 91,
      purpose: 'DEPOSIT',
      status: 'PENDING',
      environment: 'SIMULATOR',
      expectedAmount: 300000,
      currency: 'VND',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      method: 'QR_TRANSFER',
      provider: 'SIMULATOR',
      receiver: {
        bankName: 'Ngân hàng Demo',
        bankCode: 'DEMO',
        accountName: 'Khách sạn Demo',
        accountNumberMasked: '**** 6789',
        qrProvider: 'VIETQR',
        merchantReferenceMasked: 'DEMO-***',
        instructionsVi: 'Chuyển khoản theo nội dung bắt buộc.',
        instructionsEn: 'Use the required transfer content.',
      },
      uniqueTransferContent: 'LS91-DEPOSIT',
      qrData: '000201010212',
      redirectUrl: null,
      replayed: false,
      ...overrides,
    };
  }
});
