import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { LocaleService, SupportedLocale } from '@app/core/i18n/locale.service';
import { routes } from '../../../app.routes';
import {
  PublicInformationPageComponent,
  PublicInformationPageKind,
} from './public-information-page.component';

describe('PublicInformationPageComponent', () => {
  const createFixture = async (
    page: PublicInformationPageKind,
    initialLocale: SupportedLocale = 'vi',
  ): Promise<{ fixture: ComponentFixture<PublicInformationPageComponent>; locale: WritableSignal<SupportedLocale> }> => {
    const locale = signal<SupportedLocale>(initialLocale);

    await TestBed.configureTestingModule({
      imports: [PublicInformationPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { page } } } },
        {
          provide: LocaleService,
          useValue: {
            locale: locale.asReadonly(),
            toggle: () => locale.update(value => value === 'vi' ? 'en' : 'vi'),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PublicInformationPageComponent);
    fixture.detectChanges();
    return { fixture, locale };
  };

  afterEach(() => {
    globalThis.localStorage?.removeItem('luxestay.cookie.preferences.v1');
    TestBed.resetTestingModule();
  });

  it('registers five public deep links without auth guards', () => {
    const expected = new Map([
      ['terms', 'TERMS'],
      ['privacy', 'PRIVACY'],
      ['cookies', 'COOKIES'],
      ['contact', 'CONTACT'],
      ['support', 'SUPPORT'],
    ]);

    for (const [path, page] of expected) {
      const route = routes.find(candidate => candidate.path === '')?.children?.find(candidate => candidate.path === path);
      expect(route?.loadComponent).toBeTypeOf('function');
      expect(route?.canActivate).toBeUndefined();
      expect(route?.data?.['page']).toBe(page);
    }
  });

  it('exposes landmarks, active-page semantics, real links, and route focus', async () => {
    const { fixture } = await createFixture('PRIVACY');
    const root = fixture.nativeElement as HTMLElement;
    const heading = root.querySelector('h1') as HTMLHeadingElement;
    const navigation = root.querySelector('nav') as HTMLElement;
    const links = [...root.querySelectorAll('a')] as HTMLAnchorElement[];

    expect(root.querySelector('main#public-information-content')).not.toBeNull();
    expect(navigation.getAttribute('aria-label')).toBe('Điều hướng chính sách và hỗ trợ');
    expect(heading.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(heading);
    expect(root.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('/privacy');
    expect(links.some(link => link.getAttribute('href') === '#')).toBe(false);
    expect(links.map(link => link.getAttribute('href'))).toEqual(expect.arrayContaining([
      '/terms',
      '/privacy',
      '/cookies',
      '/contact',
      '/support',
    ]));
  });

  it('switches the page copy between Vietnamese and English', async () => {
    const { fixture, locale } = await createFixture('TERMS');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Điều khoản dịch vụ');
    locale.set('en');
    fixture.detectChanges();

    expect(locale()).toBe('en');
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Terms of service');
  });

  it('stores cookie choices and announces the result without moving focus', async () => {
    const { fixture } = await createFixture('COOKIES');
    const root = fixture.nativeElement as HTMLElement;
    const optionalCheckboxes = [...root.querySelectorAll('input:not(:disabled)')] as HTMLInputElement[];
    const saveButton = root.querySelector('.cookie-form button[type="submit"]') as HTMLButtonElement;

    optionalCheckboxes[0].click();
    saveButton.focus();
    saveButton.click();
    fixture.detectChanges();

    expect(JSON.parse(globalThis.localStorage?.getItem('luxestay.cookie.preferences.v1') ?? '{}')).toEqual({
      analytics: true,
      marketing: false,
    });
    expect(root.querySelector('.save-status')?.textContent).toContain('Đã lưu lựa chọn cookie');
    expect(document.activeElement).toBe(saveButton);
  });
});
