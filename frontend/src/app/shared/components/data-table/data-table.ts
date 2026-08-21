import { Component, Input, Output, EventEmitter, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { TooltipModule } from 'primeng/tooltip';
import { PageRequest, SortRequest, FilterRequest } from '../../models/pagination.model';
import { PermissionDirective } from '../../directives/permission';

export interface ColumnDefinition {
  field: string;
  header: string;
  type?: 'text' | 'number' | 'date' | 'currency' | 'boolean' | 'badge';
  sortable?: boolean;
  filterable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  format?: string;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [
    CommonModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    TooltipModule,
    PermissionDirective
  ],
  templateUrl: './data-table.html',
  styleUrl: './data-table.css'
})
export class DataTable implements OnInit {
  @Input() columns: ColumnDefinition[] = [];
  @Input() data: any[] = [];
  @Input() totalRecords: number = 0;
  @Input() pageSize: number = 20;
  @Input() loading: boolean = false;
  @Input() exportFileName = 'du-lieu';
  @Input() permissions = {
    view: '',
    edit: '',
    delete: ''
  };

  @Output() pageChange = new EventEmitter<PageRequest>();
  @Output() sortChange = new EventEmitter<SortRequest>();
  @Output() filterChange = new EventEmitter<FilterRequest>();
  @Output() rowClick = new EventEmitter<any>();
  @Output() edit = new EventEmitter<any>();
  @Output() delete = new EventEmitter<any>();
  @Output() view = new EventEmitter<any>();

  globalFilter = signal<string>('');

  ngOnInit(): void {}

  onLazyLoad(event: TableLazyLoadEvent) {
    const pageRequest: PageRequest = {
      pageNumber: event.first ? Math.floor(event.first / (event.rows || this.pageSize)) + 1 : 1,
      pageSize: event.rows || this.pageSize,
      keyword: this.globalFilter()
    };

    if (event.sortField) {
      pageRequest.sortField = event.sortField as string;
      pageRequest.sortDirection = event.sortOrder === 1 ? 'asc' : 'desc';
    }

    this.pageChange.emit(pageRequest);
  }

  onGlobalSearch(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.globalFilter.set(value);
    
    // We emit filter change and it will typically trigger a reload from page 1
    this.filterChange.emit({ keyword: value });
  }

  exportExcel(): void {
    const rows = [
      this.columns.map(column => column.header),
      ...this.data.map(row => this.columns.map(column => this.exportValue(row, column))),
    ];
    const csv = rows.map(row => row.map(value => this.csvCell(value)).join(',')).join('\r\n');
    this.download(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `${this.safeFileName()}.csv`);
  }

  async exportPdf(): Promise<void> {
    const pdf = await this.createPdf();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const lineHeight = 6;
    const columnWidth = (pageWidth - margin * 2) / Math.max(1, this.columns.length);
    let y = 16;

    pdf.setFontSize(13);
    pdf.text(this.pdfText(this.exportFileName), margin, y);
    y += 10;
    pdf.setFontSize(8);

    const drawRow = (values: unknown[], header = false) => {
      if (y + lineHeight > pageHeight - margin) { pdf.addPage(); y = margin; }
      if (header) pdf.setFont('helvetica', 'bold');
      values.forEach((value, index) => {
        const text = pdf.splitTextToSize(this.pdfText(value), Math.max(8, columnWidth - 2))[0] || '';
        pdf.text(text, margin + index * columnWidth, y);
      });
      if (header) pdf.setFont('helvetica', 'normal');
      y += lineHeight;
    };

    drawRow(this.columns.map(column => column.header), true);
    this.data.forEach(row => drawRow(this.columns.map(column => this.exportValue(row, column))));
    pdf.save(`${this.safeFileName()}.pdf`);
  }

  protected async createPdf(): Promise<any> {
    const { jsPDF } = await import('jspdf');
    return new jsPDF({ orientation: this.columns.length > 5 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  }

  private exportValue(row: any, column: ColumnDefinition): string | number {
    const value = column.field.split('.').reduce((current, key) => current?.[key], row);
    if (value == null) return '';
    if (column.type === 'boolean') return value ? 'Có' : 'Không';
    if (column.type === 'currency') return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value));
    if (column.type === 'date') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
    }
    return typeof value === 'number' ? value : String(value);
  }

  private csvCell(value: string | number): string {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  private pdfText(value: unknown): string {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }

  private safeFileName(): string {
    return (this.exportFileName || 'du-lieu').trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'du-lieu';
  }

  private download(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
