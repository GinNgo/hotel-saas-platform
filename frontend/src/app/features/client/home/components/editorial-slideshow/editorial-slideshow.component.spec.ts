import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { EditorialSlideshowComponent } from './editorial-slideshow.component';

describe('EditorialSlideshowComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorialSlideshowComponent],
      providers: [provideRouter([]), provideTranslateService()]
    }).compileComponents();

    TestBed.inject(TranslateService).setTranslation('vi', {
      HOME: { SLIDES: { CULTURE: {}, COAST: {}, ISLAND: {}, GO_TO: 'Slide {{number}}' } }
    });
  });

  it('supports previous, next and direct slide controls', () => {
    const fixture = TestBed.createComponent(EditorialSlideshowComponent);
    const component = fixture.componentInstance;

    component.showNext();
    expect(component.activeIndex()).toBe(1);

    component.showPrevious();
    expect(component.activeIndex()).toBe(0);

    component.showSlide(2);
    expect(component.activeIndex()).toBe(2);
  });

  it('pauses and resumes without moving focus', () => {
    const fixture = TestBed.createComponent(EditorialSlideshowComponent);
    const component = fixture.componentInstance;

    expect(component.manuallyPaused()).toBe(false);
    component.togglePause();
    expect(component.manuallyPaused()).toBe(true);
    component.togglePause();
    expect(component.manuallyPaused()).toBe(false);
  });

  it('renders an accessible fallback when an image fails', () => {
    const fixture = TestBed.createComponent(EditorialSlideshowComponent);
    fixture.detectChanges();

    fixture.componentInstance.handleImageError();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.image-fallback')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
  });
});
