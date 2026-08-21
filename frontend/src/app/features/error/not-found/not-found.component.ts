import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="not-found-container">
      <div class="content text-center">
        <div class="error-code">404</div>
        <h1 class="error-title">Không tìm thấy trang</h1>
        <p class="error-message">Xin lỗi, trang bạn đang tìm kiếm không tồn tại hoặc đã bị xóa.</p>
        <p class="error-message">Tính năng này có thể đang được phát triển.</p>
        <a routerLink="/admin/dashboard" class="btn btn-primary mt-4 px-4 py-2" style="background-color: #f59e0b; border-color: #f59e0b; font-weight: 500;">
          <i class="pi pi-home me-2"></i> Trở về Bảng điều khiển
        </a>
      </div>
    </div>
  `,
  styles: [`
    .not-found-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      min-height: 70vh;
      width: 100%;
      background-color: #f8fafc;
      border-radius: 0.5rem;
    }
    .content {
      padding: 2rem;
    }
    .error-code {
      font-size: 8rem;
      font-weight: 800;
      color: #94a3b8;
      line-height: 1;
      margin-bottom: 1rem;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
    }
    .error-title {
      font-size: 2rem;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 1rem;
    }
    .error-message {
      color: #64748b;
      font-size: 1.1rem;
      margin-bottom: 0.5rem;
    }
  `]
})
export class NotFoundComponent { }
