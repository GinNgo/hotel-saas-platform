import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { TableModule } from 'primeng/table';
import {
  CustomerInvoiceSummary,
  InvoiceService,
  PropertyInvoiceDetail,
} from '../../../core/services/invoice.service';
import { PublicI18nService } from '../../../core/i18n/public-i18n.service';

type InvoiceSnapshot = Record<string, string | number | null | undefined>;

@Component({
  selector: 'app-invoice-management',
  standalone: true,
  imports: [CommonModule, TableModule, ButtonModule, DialogModule, CardModule],
  templateUrl: './invoice-management.html',
  styleUrl: './invoice-management.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceManagement implements OnInit {
  private readonly invoiceService = inject(InvoiceService);
  readonly i18n = inject(PublicI18nService);

  readonly invoices = signal<CustomerInvoiceSummary[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly currentInvoice = signal<PropertyInvoiceDetail | null>(null);
  readonly detailLoadingId = signal<string | number | null>(null);
  readonly detailError = signal('');
  readonly downloadingInvoiceId = signal<string | number | null>(null);
  readonly emailingInvoiceId = signal<string | number | null>(null);
  readonly actionMessage = signal('');
  readonly actionError = signal('');

  displayInvoiceDialog = false;
  private invoiceDialogTrigger: HTMLElement | null = null;

  ngOnInit(): void {
    this.loadInvoices();
  }

  loadInvoices(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.invoiceService.getFinalizedInvoices().subscribe({
      next: (invoices) => {
        this.invoices.set(invoices);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(this.copy('Không thể tải danh sách hóa đơn.', 'Finalized invoices could not be loaded.'));
        this.loading.set(false);
      },
    });
  }

  showInvoice(invoice: CustomerInvoiceSummary, event?: MouseEvent): void {
    if (this.detailLoadingId()) return;
    this.invoiceDialogTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.detailLoadingId.set(invoice.id);
    this.detailError.set('');
    this.actionMessage.set('');
    this.actionError.set('');
    this.invoiceService.getInvoice(invoice.id).subscribe({
      next: (detail) => {
        this.currentInvoice.set(detail);
        this.displayInvoiceDialog = true;
        this.detailLoadingId.set(null);
      },
      error: () => {
        this.detailError.set(this.copy('Không thể tải chi tiết hóa đơn.', 'Invoice details could not be loaded.'));
        this.detailLoadingId.set(null);
      },
    });
  }

  closeInvoice(): void {
    if (this.downloadingInvoiceId() || this.emailingInvoiceId()) return;
    this.displayInvoiceDialog = false;
  }

  printInvoice(): void {
    if (!this.currentInvoice()) return;
    window.print();
  }

  downloadPdf(invoice: PropertyInvoiceDetail): void {
    if (this.downloadingInvoiceId()) return;
    this.downloadingInvoiceId.set(invoice.id);
    this.clearActionFeedback();
    this.invoiceService.downloadPdf(invoice.id).subscribe({
      next: (response) => {
        const blob = response.body;
        if (!blob) {
          this.actionError.set(this.copy('Tệp PDF rỗng.', 'The PDF file is empty.'));
          this.downloadingInvoiceId.set(null);
          return;
        }
        const filename = this.pdfFilename(response.headers.get('Content-Disposition'), invoice.invoiceNumber);
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

  emailInvoice(invoice: PropertyInvoiceDetail): void {
    if (this.emailingInvoiceId()) return;
    this.emailingInvoiceId.set(invoice.id);
    this.clearActionFeedback();
    this.invoiceService.emailInvoice(invoice.id).subscribe({
      next: (result) => {
        this.actionMessage.set(
          result.sent
            ? this.copy(`Đã gửi hóa đơn đến ${result.recipient}.`, `Invoice sent to ${result.recipient}.`)
            : this.copy('Email chưa được gửi. Vui lòng thử lại.', 'Email was not sent. Please retry.'),
        );
        this.emailingInvoiceId.set(null);
      },
      error: () => {
        this.actionError.set(this.copy('Không thể gửi email hóa đơn.', 'Invoice email failed.'));
        this.emailingInvoiceId.set(null);
      },
    });
  }

  restoreInvoiceDialogFocus(): void {
    const trigger = this.invoiceDialogTrigger;
    this.invoiceDialogTrigger = null;
    this.currentInvoice.set(null);
    this.clearActionFeedback();
    queueMicrotask(() => {
      if (trigger?.isConnected) trigger.focus();
    });
  }

  customerName(invoice: CustomerInvoiceSummary | PropertyInvoiceDetail): string {
    const snapshot = this.snapshot(invoice.customerSnapshotJson);
    return this.snapshotValue(snapshot, 'fullName', 'username') || '-';
  }

  propertyName(invoice: CustomerInvoiceSummary | PropertyInvoiceDetail): string {
    const snapshot = this.snapshot(invoice.propertySnapshotJson);
    return this.snapshotValue(snapshot, 'nameVi', 'nameEn', 'name') || '-';
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

  formatVnd(value: number | string): string {
    const amount = typeof value === 'number' ? value : Number(value);
    return new Intl.NumberFormat(this.i18n.dateLocale(), {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(Number.isFinite(amount) ? amount : 0);
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

  copy(vi: string, en: string): string {
    return this.i18n.dateLocale() === 'en-US' ? en : vi;
  }

  trackInvoice(_: number, invoice: CustomerInvoiceSummary): string | number {
    return invoice.id;
  }

  trackLine(_: number, line: { id: string | number }): string | number {
    return line.id;
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

  private clearActionFeedback(): void {
    this.actionMessage.set('');
    this.actionError.set('');
  }

  private pdfFilename(contentDisposition: string | null, invoiceNumber: string): string {
    const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const plain = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1];
    const headerName = encoded ? decodeURIComponent(encoded) : plain;
    return (headerName || `${invoiceNumber}.pdf`).replace(/[^A-Za-z0-9._-]/g, '_');
  }
}
