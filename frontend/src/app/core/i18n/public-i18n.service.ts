import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

import viMessages from '../../../assets/i18n/vi.json';
import { LocaleService } from './locale.service';

type MessageParams = Record<string, string | number | boolean | null | undefined>;

@Injectable({ providedIn: 'root' })
export class PublicI18nService {
  private readonly translate = inject(TranslateService, { optional: true });
  private readonly localeService = inject(LocaleService);

  text(key: string, params?: MessageParams): string {
    this.localeService.locale();

    const translated = this.translate?.instant(key, params);
    const fallback = this.lookup(viMessages, key) ?? key;
    return this.interpolate(translated && translated !== key ? translated : fallback, params);
  }

  count(key: string, count: number, params?: MessageParams): string {
    const selectedKey = count === 1 ? `${key}_ONE` : key;
    const translated = this.text(selectedKey, { ...params, count });
    return translated === selectedKey
      ? this.text(key, { ...params, count })
      : translated;
  }

  dateLocale(): string {
    return this.localeService.locale() === 'en' ? 'en-US' : 'vi-VN';
  }

  private lookup(source: unknown, key: string): string | null {
    const value = key.split('.').reduce<unknown>((current, part) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[part];
    }, source);
    return typeof value === 'string' ? value : null;
  }

  private interpolate(value: string, params?: MessageParams): string {
    if (!params) return value;
    return value.replace(/{{\s*([^\s}]+)\s*}}/g, (_match, name: string) => String(params[name] ?? ''));
  }
}
