import { TestBed } from '@angular/core/testing';
import { LocaleService } from './locale.service';

describe('LocaleService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [LocaleService] });
  });

  it('defaults to Vietnamese and persists a selected locale', () => {
    const service = TestBed.inject(LocaleService);
    expect(service.locale()).toBe('vi');

    service.setLocale('en');

    expect(service.locale()).toBe('en');
    expect(localStorage.getItem('luxestay.locale')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(service.primeLocale('en')['today']).toBe('Today');
  });

  it('restores English from storage', () => {
    localStorage.setItem('luxestay.locale', 'en');

    const service = TestBed.inject(LocaleService);

    expect(service.locale()).toBe('en');
  });

  it('falls back to Vietnamese for unsupported storage values', () => {
    localStorage.setItem('luxestay.locale', 'fr');

    const service = TestBed.inject(LocaleService);

    expect(service.locale()).toBe('vi');
  });
});
