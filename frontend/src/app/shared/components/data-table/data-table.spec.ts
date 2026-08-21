import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { DataTable } from './data-table';

describe('DataTable', () => {
  let component: DataTable;
  let fixture: ComponentFixture<DataTable>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataTable],
    }).compileComponents();

    fixture = TestBed.createComponent(DataTable);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('downloads UTF-8 CSV with configured columns and formula protection', async () => {
    component.exportFileName = 'Báo cáo vận hành';
    component.columns = [{ field: 'room', header: 'Phòng' }, { field: 'note', header: 'Ghi chú' }];
    component.data = [{ room: '101', note: '=HYPERLINK("bad")' }];
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    component.exportExcel();

    expect(createUrl).toHaveBeenCalledOnce();
    const blob = createUrl.mock.calls[0][0] as Blob;
    expect(await blob.text()).toContain("'=HYPERLINK");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledWith('blob:csv');
  });

  it('generates a real PDF download from the current rows', async () => {
    component.exportFileName = 'Work orders';
    component.columns = [{ field: 'room', header: 'Phòng' }];
    component.data = [{ room: '101' }];
    const pdf = {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      setFontSize: vi.fn(), text: vi.fn(), splitTextToSize: vi.fn((value: string) => [value]),
      setFont: vi.fn(), addPage: vi.fn(), save: vi.fn(),
    };
    vi.spyOn(component as any, 'createPdf').mockResolvedValue(pdf);

    await component.exportPdf();

    expect(pdf.text).toHaveBeenCalledWith('101', expect.any(Number), expect.any(Number));
    expect(pdf.save).toHaveBeenCalledWith('Work-orders.pdf');
  });
});
