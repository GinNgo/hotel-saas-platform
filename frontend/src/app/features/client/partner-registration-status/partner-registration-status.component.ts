import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-partner-registration-status', standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <main class="status-page">
      <section class="status-panel">
        <div class="status-icon" [class.approved]="status === 'APPROVED'"><i class="pi" [ngClass]="status === 'APPROVED' ? 'pi-check' : 'pi-clock'"></i></div>
        <ng-container *ngIf="loading"><h1>Đang kiểm tra hồ sơ</h1><p>Vui lòng chờ trong giây lát.</p></ng-container>
        <ng-container *ngIf="!loading && !error && status === 'PENDING'"><h1>Hồ sơ đang được xét duyệt</h1><p>Thông tin cơ sở của bạn đã được ghi nhận. Dữ liệu đã nhập sẽ được giữ nguyên trong thời gian chờ duyệt.</p></ng-container>
        <ng-container *ngIf="!loading && !error && status === 'APPROVED'"><h1>Hồ sơ đã được duyệt</h1><p>Bạn có thể tiếp tục cấu hình cơ sở, loại phòng và danh sách phòng cụ thể.</p><a routerLink="/management/dashboard">Đi đến trang quản lý</a></ng-container>
        <ng-container *ngIf="!loading && !error && status === 'REJECTED'"><h1>Hồ sơ chưa được chấp thuận</h1><p>Bạn có thể cập nhật thông tin và gửi lại một hồ sơ đăng ký mới.</p><a routerLink="/partner/register">Đăng ký lại</a></ng-container>
        <ng-container *ngIf="!loading && !error && status === 'NONE'"><h1>Chưa có hồ sơ đối tác</h1><p>Hãy gửi thông tin cơ sở để bắt đầu quy trình xét duyệt.</p><a routerLink="/partner/register">Đăng chỗ nghỉ</a></ng-container>
        <ng-container *ngIf="error"><h1>Không thể tải trạng thái</h1><p>{{ error }}</p><button type="button" (click)="load()">Thử lại</button></ng-container>
      </section>
    </main>`,
  styles: [`
    .status-page{min-height:calc(100vh - 72px);display:grid;place-items:center;padding:32px 16px;background:#f8fafc}.status-panel{width:min(620px,100%);background:#fff;border:1px solid #e2e8f0;padding:42px;text-align:center;box-shadow:0 12px 36px rgba(15,23,42,.08)}.status-icon{width:64px;height:64px;margin:0 auto 18px;display:grid;place-items:center;border-radius:50%;background:#fff7ed;color:#c2410c;font-size:25px}.status-icon.approved{background:#ecfdf5;color:#047857}h1{font-size:26px;margin:0 0 10px;color:#0f172a}p{color:#64748b;line-height:1.7;margin:0 auto 24px;max-width:500px}a,button{display:inline-flex;min-height:44px;align-items:center;padding:0 18px;background:#1d4ed8;color:#fff;border:0;text-decoration:none;font-weight:700;cursor:pointer}@media(max-width:600px){.status-panel{padding:30px 20px}}
  `]
})
export class PartnerRegistrationStatusComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly changeDetector = inject(ChangeDetectorRef);
  loading = true;
  status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' = 'NONE';
  error = '';
  ngOnInit(): void { this.load(); }
  load(): void {
    this.loading = true; this.error = '';
    this.http.get<{ status: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED' }>(`${environment.apiUrl}/partner/registration-status`).subscribe({
      next: response => { this.status = response.status; this.loading = false; this.changeDetector.detectChanges(); },
      error: () => { this.error = 'Vui lòng đăng nhập lại hoặc thử lại sau.'; this.loading = false; this.changeDetector.detectChanges(); }
    });
  }
}
