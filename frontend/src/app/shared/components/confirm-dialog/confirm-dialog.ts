import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, ConfirmDialogModule],
  providers: [ConfirmationService],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css'
})
export class ConfirmDialog {
  constructor(private confirmationService: ConfirmationService) {}

  confirmDelete(message: string, acceptCallback: Function) {
    this.confirmationService.confirm({
      message: message,
      header: 'Xác nhận xóa',
      icon: 'pi pi-exclamation-triangle text-danger',
      acceptLabel: 'Xóa',
      rejectLabel: 'Hủy',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      accept: () => {
        acceptCallback();
      }
    });
  }

  confirmAction(header: string, message: string, acceptCallback: Function) {
    this.confirmationService.confirm({
      message: message,
      header: header,
      icon: 'pi pi-question-circle text-primary',
      acceptLabel: 'Đồng ý',
      rejectLabel: 'Hủy',
      acceptButtonStyleClass: 'p-button-primary',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      accept: () => {
        acceptCallback();
      }
    });
  }
}
