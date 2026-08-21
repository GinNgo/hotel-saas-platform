import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize, timeout } from 'rxjs/operators';
import { ConfirmationService, MessageService, TreeNode } from 'primeng/api';
import { TreeTableModule } from 'primeng/treetable';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { environment } from '../../../../environments/environment';

interface AppFunction {
  id: string;
  code: string;
  name: string;
  moduleCode: string;
  supportedActionMask: number;
  isActive: boolean;
}

interface AppModule {
  id: string;
  code: string;
  name: string;
}

interface PageRowData {
  id: string;
  code: string;
  name: string;
  type: 'module' | 'function';
  moduleCode?: string;
  supportedActionMask?: number;
  isActive?: boolean;
}

type PageFormMode = 'add' | 'edit';

@Component({
  selector: 'app-module-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TreeTableModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    ToastModule,
    ConfirmDialogModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './module-management.html',
  styleUrl: './module-management.css'
})
export class ModuleManagementComponent implements OnInit {
  nodes: TreeNode[] = [];
  selectedNode: TreeNode | null = null;
  loading = false;

  displayDialog = false;
  dialogMode: PageFormMode = 'add';
  formData: {
    id: string | null;
    code: string;
    name: string;
    moduleCode: string;
    supportedActionMask: number;
    isActive: boolean;
  } = this.createEmptyForm();

  private http = inject(HttpClient);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private cdr = inject(ChangeDetectorRef);
  private apiUrl = environment.apiUrl;

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.loading = true;
    this.nodes = [];

    forkJoin({
      modules: this.http.get<AppModule[]>(`${this.apiUrl}/modules`),
      functions: this.http.get<AppFunction[]>(`${this.apiUrl}/functions`)
    })
      .pipe(timeout(10000), finalize(() => {
        this.loading = false;
        this.cdr.detectChanges();
      }))
      .subscribe({
        next: ({ modules, functions }) => {
          this.nodes = this.buildTreeNodes(modules, functions);
        },
        error: () => this.handleLoadError()
      });
  }

  selectNode(rowNode: TreeNode, rowData: PageRowData) {
    this.selectedNode = this.normalizeTreeNode(rowNode, rowData);
  }

  openAddFunction() {
    const moduleCode = this.getSelectedModuleCode();
    this.dialogMode = 'add';
    this.formData = {
      ...this.createEmptyForm(),
      moduleCode: moduleCode || ''
    };
    this.displayDialog = true;
  }

  editNode(rowNode: TreeNode, data: PageRowData) {
    if (data.type === 'module') return;
    this.selectedNode = this.normalizeTreeNode(rowNode, data);
    this.dialogMode = 'edit';
    this.formData = {
      id: data.id,
      code: data.code || '',
      name: data.name || '',
      moduleCode: data.moduleCode || '',
      supportedActionMask: data.supportedActionMask || 1,
      isActive: data.isActive !== false
    };
    this.displayDialog = true;
  }

  deleteNode(data: PageRowData) {
    if (data.type === 'module') return;

    this.confirmationService.confirm({
      message: `Vô hiệu hóa chức năng "${data.name}"? Các role sẽ không còn được cấp chức năng này.`,
      header: 'Xác nhận vô hiệu hóa',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.http.delete(`${this.apiUrl}/functions/${data.id}`).pipe(timeout(10000)).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã vô hiệu hóa chức năng.' });
            this.loadData();
          },
          error: () => this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: 'Không thể xóa dữ liệu này.' })
        });
      }
    });
  }

  save() {
    this.formData.code = this.formData.code.trim().toUpperCase();
    this.formData.name = this.formData.name.trim();

    if (!this.formData.code || !this.formData.name) {
      this.messageService.add({ severity: 'error', summary: 'Thiếu thông tin', detail: 'Vui lòng nhập mã và tên.' });
      return;
    }

    if (!this.formData.moduleCode.trim() || this.formData.supportedActionMask < 1 || this.formData.supportedActionMask > 127) {
      this.messageService.add({ severity: 'error', summary: 'Dữ liệu không hợp lệ', detail: 'Nhóm và action mask 1-127 là bắt buộc.' });
      return;
    }
    const payload = {
      code: this.formData.code,
      name: this.formData.name,
      moduleCode: this.formData.moduleCode.trim().toUpperCase(),
      supportedActionMask: Number(this.formData.supportedActionMask),
      isActive: this.formData.isActive
    };

    const request = this.dialogMode === 'add'
      ? this.http.post(`${this.apiUrl}/functions`, payload)
      : this.http.put(`${this.apiUrl}/functions/${this.formData.id}`, payload);

    request.pipe(timeout(10000)).subscribe({
      next: () => {
        this.displayDialog = false;
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã lưu cấu hình trang.' });
        this.loadData();
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: 'Không thể lưu cấu hình trang.' })
    });
  }

  get dialogTitle(): string {
    const action = this.dialogMode === 'add' ? 'Thêm' : 'Cập nhật';
    return `${action} chức năng phân quyền`;
  }

  private getSelectedModuleCode(): string | null {
    if (!this.selectedNode) return null;
    const data = this.selectedNode.data;
    return data.type === 'module' ? data.code : data.moduleCode;
  }

  private normalizeTreeNode(rowNode: TreeNode, rowData: PageRowData): TreeNode {
    const wrappedNode = (rowNode as TreeNode & { node?: TreeNode }).node;
    const node = wrappedNode || rowNode;
    return { ...node, data: rowData };
  }

  private createEmptyForm() {
    return {
      id: null,
      code: '',
      name: '',
      moduleCode: '',
      supportedActionMask: 1,
      isActive: true
    };
  }

  private buildTreeNodes(modules: AppModule[], functions: AppFunction[]): TreeNode[] {
    return modules
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((module) => ({
        data: { ...module, type: 'module' },
        key: `module-${module.id}`,
        expanded: true,
        children: functions
          .filter((func) => func.moduleCode === module.code)
          .sort((a, b) => a.code.localeCompare(b.code))
          .map((func) => ({
            data: { ...func, type: 'function' },
            key: `function-${func.id}`,
            leaf: true
          }))
      }));
  }

  private handleLoadError() {
    this.loading = false;
    this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: 'Không thể tải danh sách trang.' });
  }
}
