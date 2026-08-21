import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NEVER, of, Subject, throwError } from 'rxjs';

import { AiService } from '../../core/services/ai';
import { AiAssistant } from './ai-assistant';

describe('AiAssistant', () => {
  let component: AiAssistant;
  let fixture: ComponentFixture<AiAssistant>;
  let chat: ReturnType<typeof vi.fn>;

  afterEach(() => vi.useRealTimers());

  beforeEach(async () => {
    chat = vi.fn(() => of({ reply: 'Phản hồi thử nghiệm' }));

    await TestBed.configureTestingModule({
      imports: [AiAssistant],
      providers: [{ provide: AiService, useValue: { chat } }],
    }).compileComponents();

    fixture = TestBed.createComponent(AiAssistant);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not fail when the chat body is not mounted', () => {
    expect(() => component.scrollToBottom()).not.toThrow();
  });

  it('exposes accessible names for the dialog controls', async () => {
    const floatingButton = fixture.nativeElement.querySelector('.ai-fab') as HTMLButtonElement;
    floatingButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('.ai-chat-window') as HTMLElement;
    const closeButton = fixture.nativeElement.querySelector('.ai-header button') as HTMLButtonElement;
    const sendButton = fixture.nativeElement.querySelector('.ai-footer button') as HTMLButtonElement;

    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(closeButton.getAttribute('aria-label')).toBe('Đóng trợ lý AI');
    expect(sendButton.getAttribute('aria-label')).toBe('Gửi tin nhắn');
    expect(floatingButton.getAttribute('aria-label')).toBe('Đóng trợ lý AI');
  });

  it('closes the dialog when Escape is pressed', async () => {
    const floatingButton = fixture.nativeElement.querySelector('.ai-fab') as HTMLButtonElement;
    floatingButton.click();
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isOpen).toBe(false);
    expect(fixture.nativeElement.querySelector('.ai-chat-window')).toBeNull();
  });

  it('shows a retry action when sending fails', () => {
    chat.mockReturnValueOnce(throwError(() => new Error('offline')));
    component.newMessage = 'Kiểm tra kết nối';

    component.sendMessage();

    expect(component.isTyping).toBe(false);
    expect(component.messages.at(-1)?.retryText).toBe('Kiểm tra kết nối');
  });

  it('retries without duplicating the user message', () => {
    chat
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of({ reply: 'Đã kết nối lại' }));
    component.newMessage = 'Kiểm tra kết nối';

    component.sendMessage();
    component.retryMessage('Kiểm tra kết nối');

    expect(component.messages.filter((message) => message.sender === 'user')).toHaveLength(1);
    expect(component.messages.at(-1)?.text).toBe('Đã kết nối lại');
  });

  it('renders an asynchronous reply after the HTTP observable completes', async () => {
    const response$ = new Subject<{ reply: string }>();
    chat.mockReturnValueOnce(response$);
    const floatingButton = fixture.nativeElement.querySelector('.ai-fab') as HTMLButtonElement;
    floatingButton.click();
    await fixture.whenStable();
    component.newMessage = 'async response';
    fixture.detectChanges();

    component.sendMessage();
    response$.next({ reply: 'async reply rendered' });
    response$.complete();
    await fixture.whenStable();

    const chatBody = fixture.nativeElement.querySelector('.ai-body') as HTMLElement;
    expect(chatBody.textContent).toContain('async reply rendered');
    expect(chatBody.querySelector('[role="status"]')).toBeNull();
  });

  it('recovers from a request that never completes', async () => {
    vi.useFakeTimers();
    chat.mockReturnValueOnce(NEVER);
    component.newMessage = 'Kiểm tra timeout';

    component.sendMessage();
    vi.advanceTimersByTime(30_000);
    await Promise.resolve();

    expect(component.isTyping).toBe(false);
    expect(component.messages.at(-1)?.retryText).toBe('Kiểm tra timeout');
  });
});
