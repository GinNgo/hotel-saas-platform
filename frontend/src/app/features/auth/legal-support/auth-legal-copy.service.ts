import { Injectable, inject } from '@angular/core';

import { LocaleService, SupportedLocale } from '@app/core/i18n/locale.service';

type MessageTree = { readonly [key: string]: string | MessageTree };

const MESSAGES: Record<SupportedLocale, MessageTree> = {
  vi: {
    AUTH_LEGAL: {
      NAV: {
        TERMS: '\u0110i\u1ec1u kho\u1ea3n d\u1ecbch v\u1ee5',
        PRIVACY: 'Ch\u00ednh s\u00e1ch b\u1ea3o m\u1eadt',
        COOKIES: 'C\u00e0i \u0111\u1eb7t cookie',
        CONTACT: 'Li\u00ean h\u1ec7',
        SUPPORT: 'H\u1ed7 tr\u1ee3',
      },
      A11Y: {
        SKIP_TO_CONTENT: 'Chuy\u1ec3n \u0111\u1ebfn n\u1ed9i dung ch\u00ednh',
        HOME: 'V\u1ec1 trang ch\u1ee7 LuxeStay',
        SWITCH_TO_ENGLISH: 'Chuy\u1ec3n sang ti\u1ebfng Anh',
        SWITCH_TO_VIETNAMESE: 'Chuy\u1ec3n sang ti\u1ebfng Vi\u1ec7t',
        INFORMATION_NAVIGATION: '\u0110i\u1ec1u h\u01b0\u1edbng ch\u00ednh s\u00e1ch v\u00e0 h\u1ed7 tr\u1ee3',
        CONTACT_ACTIONS: 'C\u00e1c k\u00eanh li\u00ean h\u1ec7 LuxeStay',
      },
      COMMON: {
        EYEBROW: 'Trung t\u00e2m th\u00f4ng tin LuxeStay',
        LAST_UPDATED: 'C\u1eadp nh\u1eadt l\u1ea7n cu\u1ed1i:',
        LAST_UPDATED_VALUE: '04/08/2026',
        BACK_TO_LOGIN: 'Quay l\u1ea1i \u0111\u0103ng nh\u1eadp',
      },
      CONSENT: {
        PREFIX: 'T\u00f4i \u0111\u1ed3ng \u00fd v\u1edbi ',
        AND: ' v\u00e0 ',
      },
      PAGES: {
        TERMS: {
          TITLE: '\u0110i\u1ec1u kho\u1ea3n d\u1ecbch v\u1ee5',
          INTRO: 'C\u00e1c \u0111i\u1ec1u kho\u1ea3n n\u00e0y quy \u0111\u1ecbnh c\u00e1ch b\u1ea1n s\u1eed d\u1ee5ng t\u00e0i kho\u1ea3n, t\u00ecm ki\u1ebfm v\u00e0 \u0111\u1eb7t d\u1ecbch v\u1ee5 tr\u00ean LuxeStay.',
          SECTION_1_TITLE: 'T\u00e0i kho\u1ea3n v\u00e0 th\u00f4ng tin ch\u00ednh x\u00e1c',
          SECTION_1_BODY: 'B\u1ea1n c\u1ea7n cung c\u1ea5p th\u00f4ng tin ch\u00ednh x\u00e1c, b\u1ea3o v\u1ec7 th\u00f4ng tin \u0111\u0103ng nh\u1eadp v\u00e0 th\u00f4ng b\u00e1o khi ph\u00e1t hi\u1ec7n truy c\u1eadp tr\u00e1i ph\u00e9p.',
          SECTION_2_TITLE: '\u0110\u1eb7t ph\u00f2ng, gi\u00e1 v\u00e0 thanh to\u00e1n',
          SECTION_2_BODY: 'Gi\u00e1, thu\u1ebf, ph\u1ee5 ph\u00ed, ch\u00ednh s\u00e1ch h\u1ee7y v\u00e0 ph\u01b0\u01a1ng th\u1ee9c thanh to\u00e1n \u0111\u01b0\u1ee3c hi\u1ec3n th\u1ecb trong quy tr\u00ecnh \u0111\u1eb7t ph\u00f2ng. X\u00e1c nh\u1eadn cu\u1ed1i c\u00f9ng v\u00e0 h\u00f3a \u0111\u01a1n l\u00e0 ngu\u1ed3n th\u00f4ng tin cho giao d\u1ecbch \u0111\u00e3 ho\u00e0n t\u1ea5t.',
          SECTION_3_TITLE: 'S\u1eed d\u1ee5ng h\u1ee3p l\u1ec7',
          SECTION_3_BODY: 'Kh\u00f4ng \u0111\u01b0\u1ee3c l\u00e0m gi\u00e1n \u0111o\u1ea1n d\u1ecbch v\u1ee5, truy c\u1eadp d\u1eef li\u1ec7u kh\u00f4ng thu\u1ed9c quy\u1ec1n, l\u00e0m gi\u1ea3 thanh to\u00e1n ho\u1eb7c s\u1eed d\u1ee5ng LuxeStay cho ho\u1ea1t \u0111\u1ed9ng tr\u00e1i ph\u00e1p lu\u1eadt.',
        },
        PRIVACY: {
          TITLE: 'Ch\u00ednh s\u00e1ch b\u1ea3o m\u1eadt',
          INTRO: 'LuxeStay gi\u1ea3i th\u00edch d\u1eef li\u1ec7u n\u00e0o \u0111\u01b0\u1ee3c x\u1eed l\u00fd, m\u1ee5c \u0111\u00edch s\u1eed d\u1ee5ng v\u00e0 c\u00e1ch b\u1ea1n th\u1ef1c hi\u1ec7n quy\u1ec1n \u0111\u1ed1i v\u1edbi th\u00f4ng tin c\u00e1 nh\u00e2n.',
          SECTION_1_TITLE: 'D\u1eef li\u1ec7u \u0111\u01b0\u1ee3c thu th\u1eadp',
          SECTION_1_BODY: 'H\u1ec7 th\u1ed1ng c\u00f3 th\u1ec3 x\u1eed l\u00fd th\u00f4ng tin t\u00e0i kho\u1ea3n, li\u00ean h\u1ec7, \u0111\u1eb7t ph\u00f2ng, thanh to\u00e1n, thi\u1ebft b\u1ecb v\u00e0 l\u1ecbch s\u1eed h\u1ed7 tr\u1ee3 c\u1ea7n thi\u1ebft \u0111\u1ec3 cung c\u1ea5p d\u1ecbch v\u1ee5 v\u00e0 b\u1ea3o v\u1ec7 t\u00e0i kho\u1ea3n.',
          SECTION_2_TITLE: 'M\u1ee5c \u0111\u00edch v\u00e0 chia s\u1ebb',
          SECTION_2_BODY: 'D\u1eef li\u1ec7u \u0111\u01b0\u1ee3c d\u00f9ng \u0111\u1ec3 th\u1ef1c hi\u1ec7n \u0111\u1eb7t ph\u00f2ng, x\u1eed l\u00fd thanh to\u00e1n, g\u1eedi th\u00f4ng b\u00e1o, ng\u0103n ch\u1eb7n gian l\u1eadn v\u00e0 h\u1ed7 tr\u1ee3.',
          SECTION_3_TITLE: 'L\u01b0u tr\u1eef, b\u1ea3o m\u1eadt v\u00e0 quy\u1ec1n c\u1ee7a b\u1ea1n',
          SECTION_3_BODY: 'LuxeStay \u00e1p d\u1ee5ng ki\u1ec3m so\u00e1t truy c\u1eadp v\u00e0 gi\u1edbi h\u1ea1n th\u1eddi gian l\u01b0u tr\u1eef theo m\u1ee5c \u0111\u00edch, ngh\u0129a v\u1ee5 ph\u00e1p l\u00fd v\u00e0 an to\u00e0n. B\u1ea1n c\u00f3 th\u1ec3 y\u00eau c\u1ea7u truy c\u1eadp, ch\u1ec9nh s\u1eeda ho\u1eb7c h\u1ed7 tr\u1ee3 v\u1ec1 d\u1eef li\u1ec7u qua trang Li\u00ean h\u1ec7.',
        },
        COOKIES: {
          TITLE: 'C\u00e0i \u0111\u1eb7t cookie',
          INTRO: 'B\u1ea1n c\u00f3 th\u1ec3 xem v\u00e0 l\u01b0u l\u1ef1a ch\u1ecdn cho c\u00e1c nh\u00f3m cookie kh\u00f4ng thi\u1ebft y\u1ebfu tr\u00ean thi\u1ebft b\u1ecb n\u00e0y.',
          SECTION_1_TITLE: 'Cookie thi\u1ebft y\u1ebfu',
          SECTION_1_BODY: 'Cookie ho\u1eb7c b\u1ed9 nh\u1edb t\u01b0\u01a1ng \u0111\u01b0\u01a1ng c\u00f3 th\u1ec3 c\u1ea7n thi\u1ebft cho b\u1ea3o m\u1eadt, phi\u00ean \u0111\u0103ng nh\u1eadp, ng\u00f4n ng\u1eef v\u00e0 ho\u1ea1t \u0111\u1ed9ng c\u1ed1t l\u00f5i c\u1ee7a trang.',
          SECTION_2_TITLE: 'Cookie ph\u00e2n t\u00edch v\u00e0 ti\u1ebfp th\u1ecb',
          SECTION_2_BODY: 'C\u00e1c nh\u00f3m kh\u00f4ng thi\u1ebft y\u1ebfu ch\u1ec9 n\u00ean \u0111\u01b0\u1ee3c s\u1eed d\u1ee5ng theo l\u1ef1a ch\u1ecdn c\u1ee7a b\u1ea1n v\u00e0 c\u1ea5u h\u00ecnh th\u1ef1c t\u1ebf c\u1ee7a m\u00f4i tr\u01b0\u1eddng.',
          SECTION_3_TITLE: 'Thay \u0111\u1ed5i l\u1ef1a ch\u1ecdn',
          SECTION_3_BODY: 'L\u1ef1a ch\u1ecdn \u0111\u01b0\u1ee3c l\u01b0u c\u1ee5c b\u1ed9 tr\u00ean tr\u00ecnh duy\u1ec7t n\u00e0y. B\u1ea1n c\u00f3 th\u1ec3 quay l\u1ea1i trang n\u00e0y b\u1ea5t c\u1ee9 l\u00fac n\u00e0o \u0111\u1ec3 c\u1eadp nh\u1eadt.',
        },
        CONTACT: {
          TITLE: 'Li\u00ean h\u1ec7 LuxeStay',
          INTRO: 'S\u1eed d\u1ee5ng k\u00eanh ph\u00f9 h\u1ee3p \u0111\u1ec3 h\u1ecfi v\u1ec1 t\u00e0i kho\u1ea3n, \u0111\u1eb7t ph\u00f2ng, thanh to\u00e1n, quy\u1ec1n ri\u00eang t\u01b0 ho\u1eb7c h\u1ee3p t\u00e1c.',
          SECTION_1_TITLE: 'Th\u00f4ng tin n\u00ean cung c\u1ea5p',
          SECTION_1_BODY: 'H\u00e3y n\u00eau m\u00e3 \u0111\u1eb7t ph\u00f2ng ho\u1eb7c email t\u00e0i kho\u1ea3n khi c\u1ea7n \u0111\u1ed1i chi\u1ebfu. Kh\u00f4ng g\u1eedi m\u1eadt kh\u1ea9u, m\u00e3 OTP, kh\u00f3a truy c\u1eadp ho\u1eb7c th\u00f4ng tin th\u1ebb \u0111\u1ea7y \u0111\u1ee7.',
          SECTION_2_TITLE: 'Y\u00eau c\u1ea7u b\u1ea3o m\u1eadt v\u00e0 quy\u1ec1n ri\u00eang t\u01b0',
          SECTION_2_BODY: 'M\u00f4 t\u1ea3 r\u00f5 y\u00eau c\u1ea7u, t\u00e0i kho\u1ea3n li\u00ean quan v\u00e0 c\u00e1ch b\u1ea1n mu\u1ed1n \u0111\u01b0\u1ee3c li\u00ean h\u1ec7. LuxeStay c\u00f3 th\u1ec3 c\u1ea7n x\u00e1c minh danh t\u00ednh tr\u01b0\u1edbc khi cung c\u1ea5p ho\u1eb7c thay \u0111\u1ed5i d\u1eef li\u1ec7u.',
          SECTION_3_TITLE: 'S\u1ef1 c\u1ed1 kh\u1ea9n c\u1ea5p',
          SECTION_3_BODY: 'N\u1ebfu nghi ng\u1edd t\u00e0i kho\u1ea3n b\u1ecb chi\u1ebfm quy\u1ec1n, h\u00e3y \u0111\u1ed5i m\u1eadt kh\u1ea9u ngay khi c\u00f3 th\u1ec3 v\u00e0 li\u00ean h\u1ec7 b\u1ed9 ph\u1eadn h\u1ed7 tr\u1ee3.',
        },
        SUPPORT: {
          TITLE: 'Trung t\u00e2m h\u1ed7 tr\u1ee3',
          INTRO: 'Nh\u1eadn h\u01b0\u1edbng d\u1eabn cho t\u00e0i kho\u1ea3n, \u0111\u1eb7t ph\u00f2ng, thanh to\u00e1n, ho\u00e0n ti\u1ec1n v\u00e0 c\u00e1c v\u1ea5n \u0111\u1ec1 khi s\u1eed d\u1ee5ng LuxeStay.',
          SECTION_1_TITLE: 'T\u00e0i kho\u1ea3n v\u00e0 \u0111\u0103ng nh\u1eadp',
          SECTION_1_BODY: 'S\u1eed d\u1ee5ng lu\u1ed3ng qu\u00ean m\u1eadt kh\u1ea9u n\u1ebfu kh\u00f4ng th\u1ec3 \u0111\u0103ng nh\u1eadp. Kh\u00f4ng chia s\u1ebb li\u00ean k\u1ebft \u0111\u1eb7t l\u1ea1i m\u1eadt kh\u1ea9u, m\u00e3 x\u00e1c minh ho\u1eb7c th\u00f4ng tin \u0111\u0103ng nh\u1eadp cho ng\u01b0\u1eddi kh\u00e1c.',
          SECTION_2_TITLE: '\u0110\u1eb7t ph\u00f2ng, thanh to\u00e1n v\u00e0 ho\u00e0n ti\u1ec1n',
          SECTION_2_BODY: 'Ki\u1ec3m tra l\u1ecbch s\u1eed chuy\u1ebfn \u0111i, tr\u1ea1ng th\u00e1i thanh to\u00e1n v\u00e0 h\u00f3a \u0111\u01a1n tr\u01b0\u1edbc khi li\u00ean h\u1ec7. K\u1ebft qu\u1ea3 t\u1eeb m\u00e1y ch\u1ee7 v\u00e0 nh\u00e0 cung c\u1ea5p thanh to\u00e1n l\u00e0 tr\u1ea1ng th\u00e1i c\u00f3 th\u1ea9m quy\u1ec1n.',
          SECTION_3_TITLE: 'B\u1ea3o v\u1ec7 th\u00f4ng tin',
          SECTION_3_BODY: 'Nh\u00e2n vi\u00ean h\u1ed7 tr\u1ee3 kh\u00f4ng y\u00eau c\u1ea7u m\u1eadt kh\u1ea9u, m\u00e3 OTP ho\u1eb7c th\u00f4ng tin th\u1ebb \u0111\u1ea7y \u0111\u1ee7. H\u00e3y b\u00e1o ngay n\u1ebfu b\u1ea1n nh\u1eadn \u0111\u01b0\u1ee3c y\u00eau c\u1ea7u \u0111\u00e1ng ng\u1edd.',
        },
      },
      COOKIES: {
        SETTINGS_TITLE: 'L\u1ef1a ch\u1ecdn cookie tr\u00ean thi\u1ebft b\u1ecb n\u00e0y',
        ESSENTIAL_TITLE: 'Thi\u1ebft y\u1ebfu',
        ESSENTIAL_BODY: 'Lu\u00f4n b\u1eadt cho b\u1ea3o m\u1eadt, phi\u00ean \u0111\u0103ng nh\u1eadp v\u00e0 ng\u00f4n ng\u1eef.',
        ANALYTICS_TITLE: 'Ph\u00e2n t\u00edch',
        ANALYTICS_BODY: 'Cho ph\u00e9p ghi nh\u1eadn th\u00f4ng tin s\u1eed d\u1ee5ng t\u1ed5ng h\u1ee3p khi t\u00edch h\u1ee3p ph\u00e2n t\u00edch \u0111\u01b0\u1ee3c b\u1eadt.',
        MARKETING_TITLE: 'Ti\u1ebfp th\u1ecb',
        MARKETING_BODY: 'Cho ph\u00e9p c\u00e1 nh\u00e2n h\u00f3a ti\u1ebfp th\u1ecb khi t\u00edch h\u1ee3p t\u01b0\u01a1ng \u1ee9ng \u0111\u01b0\u1ee3c b\u1eadt.',
        SAVE: 'L\u01b0u l\u1ef1a ch\u1ecdn',
        SAVED: '\u0110\u00e3 l\u01b0u l\u1ef1a ch\u1ecdn cookie tr\u00ean tr\u00ecnh duy\u1ec7t n\u00e0y.',
        SAVE_ERROR: 'Kh\u00f4ng th\u1ec3 l\u01b0u l\u1ef1a ch\u1ecdn trong tr\u00ecnh duy\u1ec7t. Vui l\u00f2ng ki\u1ec3m tra c\u00e0i \u0111\u1eb7t l\u01b0u tr\u1eef.',
      },
      CONTACT: {
        TITLE: 'K\u00eanh h\u1ed7 tr\u1ee3 tr\u1ef1c ti\u1ebfp',
        BODY: 'Ch\u1ecdn email ho\u1eb7c \u0111i\u1ec7n tho\u1ea1i. C\u00e1c li\u00ean k\u1ebft b\u00ean d\u01b0\u1edbi m\u1edf \u1ee9ng d\u1ee5ng ph\u00f9 h\u1ee3p tr\u00ean thi\u1ebft b\u1ecb.',
        PHONE: '\u0110i\u1ec7n tho\u1ea1i',
        EMAIL: 'Email',
      },
    },
  },
  en: {
    AUTH_LEGAL: {
      NAV: {
        TERMS: 'Terms of service',
        PRIVACY: 'Privacy policy',
        COOKIES: 'Cookie settings',
        CONTACT: 'Contact',
        SUPPORT: 'Support',
      },
      A11Y: {
        SKIP_TO_CONTENT: 'Skip to main content',
        HOME: 'Go to the LuxeStay home page',
        SWITCH_TO_ENGLISH: 'Switch to English',
        SWITCH_TO_VIETNAMESE: 'Switch to Vietnamese',
        INFORMATION_NAVIGATION: 'Policy and support navigation',
        CONTACT_ACTIONS: 'LuxeStay contact channels',
      },
      COMMON: {
        EYEBROW: 'LuxeStay information center',
        LAST_UPDATED: 'Last updated:',
        LAST_UPDATED_VALUE: 'August 4, 2026',
        BACK_TO_LOGIN: 'Back to sign in',
      },
      CONSENT: {
        PREFIX: 'I agree to the ',
        AND: ' and ',
      },
      PAGES: {
        TERMS: {
          TITLE: 'Terms of service',
          INTRO: 'These terms govern how you use your account, search for stays, and book services through LuxeStay.',
          SECTION_1_TITLE: 'Accounts and accurate information',
          SECTION_1_BODY: 'You must provide accurate information, protect your sign-in details, and report suspected unauthorized access.',
          SECTION_2_TITLE: 'Bookings, pricing, and payment',
          SECTION_2_BODY: 'Prices, taxes, fees, cancellation rules, and payment methods are displayed during checkout. The final confirmation and invoice are the source of record for a completed transaction.',
          SECTION_3_TITLE: 'Acceptable use',
          SECTION_3_BODY: 'You may not disrupt the service, access data without authority, falsify payments, or use LuxeStay for unlawful activity.',
        },
        PRIVACY: {
          TITLE: 'Privacy policy',
          INTRO: 'LuxeStay explains what data is processed, why it is used, and how you can exercise choices about your personal information.',
          SECTION_1_TITLE: 'Data we process',
          SECTION_1_BODY: 'The service may process account, contact, booking, payment, device, and support history information needed to provide the service and protect your account.',
          SECTION_2_TITLE: 'Purpose and sharing',
          SECTION_2_BODY: 'Data is used to fulfill bookings, process payments, send notices, prevent fraud, and provide support.',
          SECTION_3_TITLE: 'Retention, security, and your choices',
          SECTION_3_BODY: 'LuxeStay applies access controls and retention limits based on purpose, legal duties, and safety. You can request access, correction, or data support through the Contact page.',
        },
        COOKIES: {
          TITLE: 'Cookie settings',
          INTRO: 'Review and save your choices for non-essential cookie categories on this device.',
          SECTION_1_TITLE: 'Essential storage',
          SECTION_1_BODY: 'Cookies or equivalent storage may be necessary for security, sign-in sessions, language preferences, and core site operation.',
          SECTION_2_TITLE: 'Analytics and marketing',
          SECTION_2_BODY: 'Non-essential categories should be used only according to your choice and the integrations actually enabled in the environment.',
          SECTION_3_TITLE: 'Changing your choices',
          SECTION_3_BODY: 'Your selection is stored locally in this browser. You can return to this page at any time to update it.',
        },
        CONTACT: {
          TITLE: 'Contact LuxeStay',
          INTRO: 'Use the appropriate channel for account, booking, payment, privacy, or partnership questions.',
          SECTION_1_TITLE: 'Information to include',
          SECTION_1_BODY: 'Include a booking reference or account email when needed for matching. Never send a password, one-time code, access key, or full card details.',
          SECTION_2_TITLE: 'Security and privacy requests',
          SECTION_2_BODY: 'Describe your request, the related account, and how you prefer to be contacted. LuxeStay may need to verify identity before disclosing or changing data.',
          SECTION_3_TITLE: 'Urgent situations',
          SECTION_3_BODY: 'If you suspect account takeover, change your password when possible and contact support.',
        },
        SUPPORT: {
          TITLE: 'Support center',
          INTRO: 'Get guidance for accounts, bookings, payments, refunds, and issues encountered while using LuxeStay.',
          SECTION_1_TITLE: 'Account and sign-in',
          SECTION_1_BODY: 'Use the password recovery flow if you cannot sign in. Do not share password reset links, verification codes, or sign-in details with anyone.',
          SECTION_2_TITLE: 'Bookings, payments, and refunds',
          SECTION_2_BODY: 'Check trip history, payment status, and invoices before contacting support. Server and payment-provider results are authoritative for financial status.',
          SECTION_3_TITLE: 'Protect your information',
          SECTION_3_BODY: 'Support staff will not ask for your password, one-time code, or full card details. Report any suspicious request immediately.',
        },
      },
      COOKIES: {
        SETTINGS_TITLE: 'Cookie choices on this device',
        ESSENTIAL_TITLE: 'Essential',
        ESSENTIAL_BODY: 'Always enabled for security, sign-in sessions, and language preferences.',
        ANALYTICS_TITLE: 'Analytics',
        ANALYTICS_BODY: 'Allows aggregate usage measurement when an analytics integration is enabled.',
        MARKETING_TITLE: 'Marketing',
        MARKETING_BODY: 'Allows marketing personalization when the corresponding integration is enabled.',
        SAVE: 'Save choices',
        SAVED: 'Cookie choices were saved in this browser.',
        SAVE_ERROR: 'The browser could not save your choices. Check its storage settings.',
      },
      CONTACT: {
        TITLE: 'Direct support channels',
        BODY: 'Choose email or telephone. The links open the appropriate application on your device.',
        PHONE: 'Telephone',
        EMAIL: 'Email',
      },
    },
  },
};

@Injectable({ providedIn: 'root' })
export class AuthLegalCopyService {
  private readonly localeService = inject(LocaleService);

  text(key: string): string {
    const value = key.split('.').reduce<string | MessageTree | undefined>((current, part) => {
      if (!current || typeof current === 'string') return undefined;
      return current[part];
    }, MESSAGES[this.localeService.locale()]);
    return typeof value === 'string' ? value : key;
  }
}
