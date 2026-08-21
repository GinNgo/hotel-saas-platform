import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { RefundService } from '@app/core/services/refund.service';
import { RefundHistoryComponent } from './refund-history.component';

describe('RefundHistoryComponent', () => {
  let fixture: ComponentFixture<RefundHistoryComponent>;
  let component: RefundHistoryComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RefundHistoryComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: { get: () => null },
            },
          },
        },
        {
          provide: RefundService,
          useValue: {
            requestPropertyRefund: vi.fn(),
            getPropertyRefund: vi.fn(() => of()),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RefundHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('exposes busy state and mobile-friendly refund controls', () => {
    component.loading = true;
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('.refund-form') as HTMLElement;
    const amount = fixture.nativeElement.querySelector('input[name="amount"]') as HTMLInputElement;
    const submit = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;

    expect(form.getAttribute('aria-busy')).toBe('true');
    expect(amount.inputMode).toBe('numeric');
    expect(getComputedStyle(submit).minHeight).toBe('44px');
  });
});
