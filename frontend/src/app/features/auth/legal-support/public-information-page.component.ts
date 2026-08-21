import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthLegalCopyService } from './auth-legal-copy.service';

export type PublicInformationPageKind = 'TERMS' | 'PRIVACY' | 'COOKIES' | 'CONTACT' | 'SUPPORT';

interface PublicInformationNavigationItem {
  kind: PublicInformationPageKind;
  route: string;
}

const PAGE_KINDS = new Set<PublicInformationPageKind>([
  'TERMS',
  'PRIVACY',
  'COOKIES',
  'CONTACT',
  'SUPPORT',
]);

const COOKIE_PREFERENCES_KEY = 'luxestay.cookie.preferences.v1';

@Component({
  selector: 'app-public-information-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './public-information-page.component.html',
  styleUrl: './public-information-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicInformationPageComponent implements AfterViewInit {
  @ViewChild('pageHeading') private pageHeading?: ElementRef<HTMLHeadingElement>;

  readonly i18n = inject(AuthLegalCopyService);
  readonly navigationItems: readonly PublicInformationNavigationItem[] = [
    { kind: 'TERMS', route: '/terms' },
    { kind: 'PRIVACY', route: '/privacy' },
    { kind: 'COOKIES', route: '/cookies' },
    { kind: 'CONTACT', route: '/contact' },
    { kind: 'SUPPORT', route: '/support' },
  ];
  readonly sectionNumbers = [1, 2, 3] as const;
  readonly pageKind = this.resolvePageKind(inject(ActivatedRoute).snapshot.data['page']);

  analyticsCookies = false;
  marketingCookies = false;
  cookieSaveState: 'idle' | 'saved' | 'error' = 'idle';

  constructor() {
    this.loadCookiePreferences();
  }

  ngAfterViewInit(): void {
    this.pageHeading?.nativeElement.focus();
  }

  pageText(field: string): string {
    return this.i18n.text(`AUTH_LEGAL.PAGES.${this.pageKind}.${field}`);
  }

  navigationText(kind: PublicInformationPageKind): string {
    return this.i18n.text(`AUTH_LEGAL.NAV.${kind}`);
  }

  saveCookiePreferences(): void {
    try {
      globalThis.localStorage?.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify({
        analytics: this.analyticsCookies,
        marketing: this.marketingCookies,
      }));
      this.cookieSaveState = 'saved';
    } catch {
      this.cookieSaveState = 'error';
    }
  }

  private resolvePageKind(value: unknown): PublicInformationPageKind {
    return typeof value === 'string' && PAGE_KINDS.has(value as PublicInformationPageKind)
      ? value as PublicInformationPageKind
      : 'SUPPORT';
  }

  private loadCookiePreferences(): void {
    try {
      const stored = globalThis.localStorage?.getItem(COOKIE_PREFERENCES_KEY);
      if (!stored) return;
      const preferences = JSON.parse(stored) as { analytics?: unknown; marketing?: unknown };
      this.analyticsCookies = preferences.analytics === true;
      this.marketingCookies = preferences.marketing === true;
    } catch {
      this.analyticsCookies = false;
      this.marketingCookies = false;
    }
  }
}
