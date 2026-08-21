import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export type FeedbackState = 'loading' | 'empty' | 'error' | 'success' | 'confirmation';

const DEFAULT_CONTENT: Record<FeedbackState, { title: string; message: string; icon: string }> = {
  loading: {
    title: 'Đang tải dữ liệu',
    message: 'Vui lòng chờ trong giây lát.',
    icon: 'pi pi-spin pi-spinner',
  },
  empty: {
    title: 'Chưa có dữ liệu',
    message: 'Không có nội dung phù hợp để hiển thị.',
    icon: 'pi pi-inbox',
  },
  error: {
    title: 'Không thể tải dữ liệu',
    message: 'Đã xảy ra lỗi. Vui lòng thử lại.',
    icon: 'pi pi-exclamation-circle',
  },
  success: {
    title: 'Hoàn tất',
    message: 'Thao tác đã được xử lý thành công.',
    icon: 'pi pi-check-circle',
  },
  confirmation: {
    title: 'Cần xác nhận',
    message: 'Vui lòng kiểm tra thông tin trước khi tiếp tục.',
    icon: 'pi pi-question-circle',
  },
};

@Component({
  selector: 'app-feedback-state',
  standalone: true,
  templateUrl: './feedback-state.component.html',
  styleUrl: './feedback-state.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackStateComponent {
  @Input() state: FeedbackState = 'empty';
  @Input() title = '';
  @Input() message = '';
  @Input() actionLabel = '';

  @Output() readonly actionTriggered = new EventEmitter<void>();

  get resolvedTitle(): string {
    return this.title || DEFAULT_CONTENT[this.state].title;
  }

  get resolvedMessage(): string {
    return this.message || DEFAULT_CONTENT[this.state].message;
  }

  get icon(): string {
    return DEFAULT_CONTENT[this.state].icon;
  }

  get role(): 'alert' | 'status' {
    return this.state === 'error' ? 'alert' : 'status';
  }

  get ariaLive(): 'assertive' | 'polite' {
    return this.state === 'error' ? 'assertive' : 'polite';
  }
}