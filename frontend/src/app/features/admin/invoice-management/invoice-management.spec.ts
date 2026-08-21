import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { PublicI18nService } from '../../../core/i18n/public-i18n.service';
import { InvoiceService, PropertyInvoiceDetail } from '../../../core/services/invoice.service';
import { InvoiceManagement } from './invoice-management';

describe('InvoiceManagement canonical finalized flow', () => {
  let fixture: ComponentFixture<InvoiceManagement>;
  let component: InvoiceManagement;
  let invoiceService: {
    getFinalizedInvoices: ReturnType<typeof vi.fn>;
    getInvoice: ReturnType<typeof vi.fn>;
    downloadPdf: ReturnType<typeof vi.fn>;
    emailInvoice: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    invoiceService = {
      getFinalizedInvoices: vi.fn(() => of([summary()])),
      getInvoice: vi.fn(() => of(detail())),
      downloadPdf: vi.fn(),
      emailInvoice: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [InvoiceManagement],
      providers: [
        provideNoopAnimations(),
        { provide: InvoiceService, useValue: invoiceService },
        {
          provide: PublicI18nService,
          useValue: { dateLocale: () => 'vi-VN', text: (key: string) => key },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceManagement);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the canonical finalized list instead of reservations or legacy invoices', () => {
    expect(invoiceService.getFinalizedInvoices).toHaveBeenCalledOnce();
    expect(component.invoices()).toEqual([summary()]);
    expect(fixture.nativeElement.textContent).toContain('INV-3-42');
    expect(fixture.nativeElement.textContent).toContain('Nguyen Van A');
  });

  it('opens immutable room, service and minibar lines from the canonical detail API', () => {
    component.showInvoice(summary());
    fixture.detectChanges();

    expect(invoiceService.getInvoice).toHaveBeenCalledWith(88);
    expect(component.currentInvoice()?.lines.map(line => line.lineType)).toEqual([
      'ROOM',
      'SERVICE',
      'MINIBAR',
    ]);
    expect(component.displayInvoiceDialog).toBe(true);
  });

  it('prints only after the canonical detail has been loaded', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    component.printInvoice();
    expect(print).not.toHaveBeenCalled();

    component.showInvoice(summary());
    component.printInvoice();
    expect(print).toHaveBeenCalledOnce();
  });
});

function summary() {
  return {
    id: 88,
    reservationId: 42,
    invoiceNumber: 'INV-3-42',
    status: 'FINALIZED',
    currency: 'VND' as const,
    finalizedAt: '2026-08-01T10:30:00',
    totalAmount: 1_160_000,
    customerSnapshotJson: '{"fullName":"Nguyen Van A"}',
    propertySnapshotJson: '{"nameVi":"Luxe Beach Hotel"}',
  };
}

function detail(): PropertyInvoiceDetail {
  return {
    ...summary(),
    status: 'FINALIZED',
    currency: 'VND',
    subtotal: 1_160_000,
    taxAmount: 0,
    feeAmount: 0,
    discountAmount: 0,
    paidAmount: 1_160_000,
    refundedAmount: 0,
    balanceAmount: 0,
    customerSnapshotJson: '{"fullName":"Nguyen Van A","email":"customer@example.test"}',
    propertySnapshotJson: '{"nameVi":"Luxe Beach Hotel","address":"1 Beach Road"}',
    lines: [
      line(1, 'ROOM', 'Deluxe room', 1_000_000),
      line(2, 'SERVICE', 'Breakfast buffet', 100_000),
      line(3, 'MINIBAR', 'Mineral water', 60_000),
    ],
    allocations: [{
      id: 10,
      transactionId: 20,
      transactionPublicId: 'txn-20',
      allocatedAmount: 1_160_000,
      method: 'MANUAL_TRANSFER',
      provider: 'SIMULATOR',
      occurredAt: '2026-08-01T10:00:00',
    }],
    creditNotes: [],
  };
}

function line(id: number, lineType: string, name: string, totalAmount: number) {
  return {
    id,
    lineType,
    code: lineType,
    name,
    description: null,
    quantity: 1,
    unitPrice: totalAmount,
    taxAmount: 0,
    discountAmount: 0,
    totalAmount,
    usageStartedAt: null,
    usageEndedAt: null,
  };
}
