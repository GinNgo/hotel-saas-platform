import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withRouterConfig } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { jwtInterceptor } from './core/interceptors/jwt-interceptor';
import { authRefreshInterceptor } from './core/interceptors/auth-refresh.interceptor';
import { errorInterceptor } from './core/interceptors/error-interceptor';
import { financialRequestInterceptor } from './core/interceptors/financial-request.interceptor';
import { providePrimeNG } from 'primeng/config';
import { HotelPreset } from './core/theme';
import { MessageService, ConfirmationService } from 'primeng/api';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { routes } from './app.routes';
import { LocaleService } from './core/i18n/locale.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled',
      }),
      withRouterConfig({
        onSameUrlNavigation: 'reload',
      })
    ),
    provideHttpClient(withInterceptors([financialRequestInterceptor, jwtInterceptor, errorInterceptor, authRefreshInterceptor])),
    provideTranslateService({
      loader: provideTranslateHttpLoader({
        prefix: '/assets/i18n/',
        suffix: '.json',
        failOnError: true
      }),
      fallbackLang: 'vi',
      lang: 'vi'
    }),
    provideAppInitializer(() => inject(LocaleService).initialize()),
    provideAnimations(),
    MessageService,
    ConfirmationService,
    providePrimeNG({
        theme: {
            preset: HotelPreset,
            options: {
                darkModeSelector: '.my-app-dark'
            }
        },
        translation: {
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
        }
    })
  ]
};
