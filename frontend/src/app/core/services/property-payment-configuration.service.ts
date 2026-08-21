import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PropertyPaymentEnvironment = 'SIMULATOR' | 'SANDBOX' | 'PRODUCTION';
export type PropertyDepositPolicy = 'NONE' | 'FIXED' | 'PERCENTAGE';
export type PropertyPaymentMethodCode =
  | 'MANUAL_TRANSFER'
  | 'QR_TRANSFER'
  | 'VNPAY'
  | 'MOMO'
  | 'ZALOPAY'
  | 'CASH'
  | 'CARD_TERMINAL'
  | 'OTHER';

export interface PropertyPaymentMethodRequest {
  method: PropertyPaymentMethodCode;
  enabled: boolean;
  provider?: string;
  merchantReference?: string;
}

export interface PropertyPaymentMethodResponse {
  method: PropertyPaymentMethodCode;
  enabled: boolean;
  provider?: string;
  merchantReferenceMasked?: string;
}

export interface PropertyPaymentMethodReadiness {
  method: PropertyPaymentMethodCode;
  provider?: string;
  ready: boolean;
  blockers: string[];
}

export interface PublicPropertyPaymentOption {
  code: 'PAY_AT_HOTEL' | PropertyPaymentMethodCode;
  provider: string;
  requiresPrepayment: boolean;
}

export interface PropertyPaymentReadiness {
  ready: boolean;
  environment: PropertyPaymentEnvironment;
  blockers: string[];
  methods: PropertyPaymentMethodReadiness[];
}

export interface PropertyPaymentConfiguration {
  id?: number;
  propertyId: string | number;
  enabled: boolean;
  environment: PropertyPaymentEnvironment;
  bankName?: string;
  bankCode?: string;
  accountName?: string;
  accountNumberMasked?: string;
  depositPolicyType: PropertyDepositPolicy;
  depositValue?: number;
  paymentExpiryMinutes: number;
  transferTemplate?: string;
  qrProvider?: string;
  instructionsVi?: string;
  instructionsEn?: string;
  version: number;
  methods: PropertyPaymentMethodResponse[];
  readiness: PropertyPaymentReadiness;
}

export interface PropertyPaymentConfigurationUpdate {
  enabled: boolean;
  environment: PropertyPaymentEnvironment;
  methods: PropertyPaymentMethodRequest[];
  bankName?: string;
  bankCode?: string;
  accountName?: string;
  accountNumber?: string;
  depositPolicyType: PropertyDepositPolicy;
  depositValue?: number;
  paymentExpiryMinutes: number;
  transferTemplate?: string;
  qrProvider?: string;
  instructionsVi?: string;
  instructionsEn?: string;
}

@Injectable({ providedIn: 'root' })
export class PropertyPaymentConfigurationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/management/properties`;

  get(propertyId: string | number): Observable<PropertyPaymentConfiguration> {
    return this.http.get<PropertyPaymentConfiguration>(this.configurationUrl(propertyId));
  }

  update(
    propertyId: string | number,
    request: PropertyPaymentConfigurationUpdate,
  ): Observable<PropertyPaymentConfiguration> {
    return this.http.put<PropertyPaymentConfiguration>(this.configurationUrl(propertyId), request);
  }

  validate(
    propertyId: string | number,
    request?: PropertyPaymentConfigurationUpdate,
  ): Observable<PropertyPaymentReadiness> {
    return this.http.post<PropertyPaymentReadiness>(
      `${this.configurationUrl(propertyId)}/validate`,
      request ?? null,
    );
  }

  publicOptions(propertyId: string | number): Observable<PublicPropertyPaymentOption[]> {
    return this.http.get<PublicPropertyPaymentOption[]>(
      `${environment.apiUrl}/public/properties/${propertyId}/payment-options`,
    );
  }

  private configurationUrl(propertyId: string | number): string {
    return `${this.baseUrl}/${propertyId}/payment-configuration`;
  }
}
