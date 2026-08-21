import { Injectable, Signal, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { PrimeNG } from 'primeng/config';
import { firstValueFrom } from 'rxjs';

export type SupportedLocale = 'vi' | 'en';

const STORAGE_KEY = 'luxestay.locale';

const PRIME_LOCALE: Record<SupportedLocale, Record<string, string | string[] | number>> = {
  vi: {
    firstDayOfWeek: 1,
    dayNames: ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'],
    dayNamesShort: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
    dayNamesMin: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
    monthNames: ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'],
    monthNamesShort: ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'],
    today: 'Hôm nay',
    clear: 'Xóa',
    dateFormat: 'dd/mm/yy',
    weekHeader: 'Tuần'
  },
  en: {
    firstDayOfWeek: 0,
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    dayNamesMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    monthNamesShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    today: 'Today',
    clear: 'Clear',
    dateFormat: 'mm/dd/yy',
    weekHeader: 'Wk'
  }
};

@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly translate = inject(TranslateService, { optional: true });
  private readonly primeNg = inject(PrimeNG, { optional: true });
  private readonly localeSignal = signal<SupportedLocale>(this.readStoredLocale());

  readonly locale: Signal<SupportedLocale> = this.localeSignal.asReadonly();

  constructor() {
    this.applyDocumentLocale(this.localeSignal());
  }

  initialize(): Promise<void> {
    const locale = this.localeSignal();
    this.applyDocumentLocale(locale);
    if (!this.translate) return Promise.resolve();
    return firstValueFrom(this.translate.use(locale))
      .then(() => undefined)
      .catch(() => undefined);
  }

  setLocale(locale: SupportedLocale): void {
    if (locale === this.localeSignal()) return;
    this.localeSignal.set(locale);
    this.persistLocale(locale);
    this.applyLocale(locale);
  }

  toggle(): void {
    this.setLocale(this.localeSignal() === 'vi' ? 'en' : 'vi');
  }

  primeLocale(locale: SupportedLocale): Record<string, string | string[] | number> {
    return PRIME_LOCALE[locale];
  }

  private applyLocale(locale: SupportedLocale): void {
    this.applyDocumentLocale(locale);
    this.translate?.use(locale).subscribe({ error: () => undefined });
  }

  private applyDocumentLocale(locale: SupportedLocale): void {
    this.primeNg?.setTranslation(PRIME_LOCALE[locale]);
    globalThis.document?.documentElement.setAttribute('lang', locale);
  }

  private readStoredLocale(): SupportedLocale {
    try {
      return globalThis.localStorage?.getItem(STORAGE_KEY) === 'en' ? 'en' : 'vi';
    } catch {
      return 'vi';
    }
  }

  private persistLocale(locale: SupportedLocale): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, locale);
    } catch {
      // Private browsing/storage-disabled environments still keep in-memory state.
    }
  }
}
