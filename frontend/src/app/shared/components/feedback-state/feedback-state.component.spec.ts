import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  FeedbackState,
  FeedbackStateComponent,
} from './feedback-state.component';

describe('FeedbackStateComponent', () => {
  let component: FeedbackStateComponent;
  let fixture: ComponentFixture<FeedbackStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeedbackStateComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FeedbackStateComponent);
    component = fixture.componentInstance;
  });

  it('renders defaults for every supported state', () => {
    const states: FeedbackState[] = ['loading', 'empty', 'error', 'success', 'confirmation'];

    for (const state of states) {
      fixture.componentRef.setInput('state', state);
      fixture.componentRef.setInput('title', '');
      fixture.componentRef.setInput('message', '');
      fixture.detectChanges();

      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('.feedback-state__title')?.textContent?.trim()).toBeTruthy();
      expect(element.querySelector('.feedback-state__message')?.textContent?.trim()).toBeTruthy();
      expect(element.querySelector('.feedback-state__icon')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('uses assertive alert semantics only for errors', () => {
    fixture.componentRef.setInput('state', 'error');
    fixture.detectChanges();

    const section: HTMLElement = fixture.nativeElement.querySelector('section');
    expect(section.getAttribute('role')).toBe('alert');
    expect(section.getAttribute('aria-live')).toBe('assertive');
    expect(section.getAttribute('aria-busy')).toBe('false');

    fixture.componentRef.setInput('state', 'loading');
    fixture.detectChanges();

    expect(section.getAttribute('role')).toBe('status');
    expect(section.getAttribute('aria-live')).toBe('polite');
    expect(section.getAttribute('aria-busy')).toBe('true');
  });

  it('renders caller content and emits one event per action click', () => {
    component.title = 'Không tìm thấy đặt phòng';
    component.message = 'Kiểm tra lại mã đặt phòng.';
    component.actionLabel = 'Thử lại';
    let emissions = 0;
    component.actionTriggered.subscribe(() => emissions++);
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    const button = element.querySelector('button') as HTMLButtonElement;
    button.click();

    expect(element.querySelector('.feedback-state__title')?.textContent).toContain(
      'Không tìm thấy đặt phòng',
    );
    expect(element.querySelector('.feedback-state__message')?.textContent).toContain(
      'Kiểm tra lại mã đặt phòng.',
    );
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Thử lại');
    expect(emissions).toBe(1);
  });

  it('does not render an unnamed action', () => {
    component.actionLabel = '';
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});