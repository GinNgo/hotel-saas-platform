import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { PopularDestinationsComponent } from './popular-destinations.component';

describe('PopularDestinationsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PopularDestinationsComponent],
      providers: [provideRouter([])]
    }).compileComponents();
  });

  it('explains an empty destination response and offers search recovery', () => {
    const fixture = TestBed.createComponent(PopularDestinationsComponent);
    fixture.componentInstance.loading = false;
    fixture.componentInstance.destinations = [];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.empty-state')?.textContent).toContain('Chưa có điểm đến nổi bật');
    expect(fixture.nativeElement.querySelector('.empty-state button')?.textContent).toContain('Xem tất cả chỗ nghỉ');
  });

  it('distinguishes a data error from a valid empty response', () => {
    const fixture = TestBed.createComponent(PopularDestinationsComponent);
    fixture.componentInstance.loading = false;
    fixture.componentInstance.error = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.error-state')?.textContent).toContain('Chưa thể tải điểm đến');
  });
});
