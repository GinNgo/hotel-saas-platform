import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { PermissionDirective } from '../../directives/permission';

export type FormMode = 'create' | 'update' | 'view';

@Component({
  selector: 'app-form-dialog',
  standalone: true,
  imports: [CommonModule, DialogModule, ButtonModule, PermissionDirective],
  templateUrl: './form-dialog.html',
  styleUrl: './form-dialog.css'
})
export class FormDialog {
  @Input() visible = false;
  @Input() mode: FormMode = 'create';
  @Input() loading = false;
  
  @Input() entityName = 'Dữ liệu';
  
  @Input() createPermission = '';
  @Input() updatePermission = '';
  
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() save = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  get headerTitle(): string {
    switch (this.mode) {
      case 'create': return `Thêm mới ${this.entityName}`;
      case 'update': return `Cập nhật ${this.entityName}`;
      case 'view': return `Chi tiết ${this.entityName}`;
      default: return this.entityName;
    }
  }

  get canSave(): boolean {
    if (this.mode === 'view') return false;
    // Permissions are typically checked by *hasPermission but we can also return true here and let template hide it
    return true;
  }

  get requiredPermission(): string {
    return this.mode === 'create' ? this.createPermission : this.updatePermission;
  }

  onHide() {
    this.visibleChange.emit(false);
    this.cancel.emit();
  }

  onSave() {
    this.save.emit();
  }
}
