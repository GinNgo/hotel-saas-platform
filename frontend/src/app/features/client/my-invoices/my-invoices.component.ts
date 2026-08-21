import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  CustomerInvoiceSummary,
  InvoiceService,
  PropertyInvoiceDetail,
} from '../../../core/services/invoice.service';
import { PublicI18nService } from '../../../core/i18n/public-i18n.service';

type InvoiceSnapshot = Record<string, string | number | null | undefined>;

@Component({
  selector: 'app-my-invoices',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './my-invoices.component.html',
  styleUrl: './my-invoices.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyInvoicesComponent implements OnInit {
  private readonly invoiceService = inject(InvoiceService);
  readonly i18n = inject(PublicI18nService);

  readonly invoices = signal<CustomerInvoiceSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly selectedInvoice = signal<PropertyInvoiceDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');
  readonly downloadingInvoiceId = signal<string | number | null>(null);
  readonly emailingInvoiceId = signal<string | number | null>(null);
  readonly actionMessage = signal('');
  readonly actionError = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.invoiceService.getMyInvoices().subscribe({
      next: (data) => {
        this.invoices.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.i18n.text('PUBLIC.ACCOUNT.INVOICES_LOAD_ERROR'));
        this.loading.set(false);
      },
    });
  }

  viewInvoice(invoice: CustomerInvoiceSummary): void {
    this.detailLoading.set(true);
    this.detailError.set('');
    this.actionMessage.set('');
    this.actionError.set('');
    this.invoiceService.getInvoice(invoice.id).subscribe({
      next: (detail) => {
        this.selectedInvoice.set(detail);
        this.detailLoading.set(false);
      },
      error: () => {
        this.selectedInvoice.set(null);
        this.detailError.set(this.copy('Không thể tải chi tiết hóa đơn.', 'Invoice details could not be loaded.'));
        this.detailLoading.set(false);
      },
    });
  }

  closeDetail(): void {
    if (this.downloadingInvoiceId() || this.emailingInvoiceId()) return;
    this.selectedInvoice.set(null);
    this.detailError.set('');
    this.actionMessage.set('');
    this.actionError.set('');
  }

  downloadPdf(invoiceId: string | number, invoiceNumber?: string): void {
    if (this.downloadingInvoiceId()) return;
    this.downloadingInvoiceId.set(invoiceId);
    this.actionMessage.set('');
    this.actionError.set('');
    this.invoiceService.downloadPdf(invoiceId).subscribe({
      next: (response) => {
        const blob = response.body;
        if (!blob) {
          this.actionError.set(this.copy('Tệp PDF rỗng.', 'The PDF file is empty.'));
          this.downloadingInvoiceId.set(null);
          return;
        }
        const filename = this.pdfFilename(response.headers.get('Content-Disposition'), invoiceNumber);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
        this.actionMessage.set(this.copy('Đã tải hóa đơn PDF.', 'Invoice PDF downloaded.'));
        this.downloadingInvoiceId.set(null);
      },
      error: () => {
        this.actionError.set(this.copy('Không thể tải PDF. Vui lòng thử lại.', 'PDF download failed. Please retry.'));
        this.downloadingInvoiceId.set(null);
      },
    });
  }

  emailInvoice(invoiceId: string | number): void {
    if (this.emailingInvoiceId()) return;
    this.emailingInvoiceId.set(invoiceId);
    this.actionMessage.set('');
    this.actionError.set('');
    this.invoiceService.emailInvoice(invoiceId).subscribe({
      next: (result) => {
        this.actionMessage.set(
          result.sent
            ? this.copy(`Đã gửi hóa đơn đến ${result.recipient}.`, `Invoice sent to ${result.recipient}.`)
            : this.copy('Email chưa được gửi. Vui lòng thử lại.', 'Email was not sent. Please retry.'),
        );
        this.emailingInvoiceId.set(null);
      },
      error: () => {
        this.actionError.set(
          this.copy(
            'Không thể gửi email. Hệ thống chỉ gửi đến địa chỉ đã xác minh.',
            'Email failed. Invoices can only be sent to a verified address.',
          ),
        );
        this.emailingInvoiceId.set(null);
      },
    });
  }

  printInvoice(): void {
    if (!this.selectedInvoice()) return;
    window.print();
  }

  customerSnapshot(invoice: PropertyInvoiceDetail): InvoiceSnapshot {
    return this.snapshot(invoice.customerSnapshotJson);
  }

  propertySnapshot(invoice: PropertyInvoiceDetail): InvoiceSnapshot {
    return this.snapshot(invoice.propertySnapshotJson);
  }

  snapshotValue(snapshot: InvoiceSnapshot, ...keys: string[]): string {
    for (const key of keys) {
      const value = snapshot[key];
      if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
    }
    return '';
  }

  lineTypeLabel(type: string): string {
    const labels: Record<string, [string, string]> = {
      ROOM: ['Phòng', 'Room'],
      SERVICE: ['Dịch vụ', 'Service'],
      MINIBAR: ['Minibar', 'Minibar'],
      SURCHARGE: ['Phụ thu', 'Surcharge'],
      TAX: ['Thuế', 'Tax'],
      FEE: ['Phí', 'Fee'],
      DISCOUNT: ['Giảm giá', 'Discount'],
      ADJUSTMENT: ['Điều chỉnh', 'Adjustment'],
    };
    const label = labels[type];
    return label ? this.copy(label[0], label[1]) : type;
  }

  displayNumber(invoice: CustomerInvoiceSummary): string {
    return invoice.invoiceNumber || invoice.invoiceCode || `INV-${invoice.id}`;
  }

  displayDate(invoice: CustomerInvoiceSummary): string | undefined {
    return invoice.finalizedAt || invoice.issueDate;
  }

  statusLabel(status: string): string {
    const key = (
      {
        FINALIZED: 'INVOICE_PAID',
        PAID: 'INVOICE_PAID',
        PENDING: 'INVOICE_PENDING',
        CANCELLED: 'INVOICE_CANCELLED',
      } as Record<string, string>
    )[status];
    return key ? this.i18n.text(`PUBLIC.ACCOUNT.${key}`) : status;
  }

  formatVnd(value: number | string): string {
    const amount = typeof value === 'number' ? value : Number(value);
    return new Intl.NumberFormat(this.i18n.dateLocale(), {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(Number.isFinite(amount) ? amount : 0);
  }

  copy(vi: string, en: string): string {
    return this.i18n.dateLocale() === 'en-US' ? en : vi;
  }

  trackInvoice(_: number, invoice: CustomerInvoiceSummary): string | number {
    return invoice.id;
  }

  trackLine(_: number, line: { id: string | number }): string | number {
    return line.id;
  }

  private pdfFilename(contentDisposition: string | null, invoiceNumber?: string): string {
    const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const plain = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1];
    const headerName = encoded ? decodeURIComponent(encoded) : plain;
    const fallback = `${invoiceNumber || 'invoice'}.pdf`;
    return (headerName || fallback).replace(/[^A-Za-z0-9._-]/g, '_');
  }

  private snapshot(json: string | undefined): InvoiceSnapshot {
    if (!json) return {};
    try {
      const parsed: unknown = JSON.parse(json);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as InvoiceSnapshot : {};
    } catch {
      return {};
    }
  }
}
