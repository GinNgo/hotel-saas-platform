import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { permissionGuard } from './core/guards/permission.guard';
import { roleGuard } from './core/guards/role-guard';
import { FunctionCode, ActionCode } from './core/services/permission.service';
import { clientAuthGuard } from './core/guards/client-auth.guard';
import { systemDashboardGuard } from './core/guards/system-dashboard.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/client-layout/client-layout').then(m => m.ClientLayout),
    children: [
      { path: '', loadComponent: () => import('./features/client/home/home').then(m => m.HomeComponent), pathMatch: 'full' },
      { path: 'search', loadComponent: () => import('./features/property-search/pages/property-search-page/property-search-page').then(m => m.PropertySearchPageComponent) },
      { path: 'hotel/:id', loadComponent: () => import('./features/client/hotel-detail/hotel-detail.component').then(m => m.HotelDetailComponent) },
      { path: 'booking/:roomTypeId', loadComponent: () => import('./features/client/booking-checkout/booking-checkout.component').then(m => m.BookingCheckoutComponent) },
      { path: 'booking/manage/:bookingCode', loadComponent: () => import('./features/client/guest-booking/guest-booking.component').then(m => m.GuestBookingComponent) },
      { path: 'profile', loadComponent: () => import('./features/client/profile/profile.component').then(m => m.ProfileComponent), canActivate: [clientAuthGuard] },
      { path: 'favorites', loadComponent: () => import('./features/client/favorites/favorites-page.component').then(m => m.FavoritesPageComponent), canActivate: [clientAuthGuard] },
      { path: 'refunds', loadComponent: () => import('./features/client/profile/refund-history.component').then(m => m.RefundHistoryComponent), canActivate: [clientAuthGuard] },
      { path: 'booking-history', loadComponent: () => import('./features/client/profile/profile.component').then(m => m.ProfileComponent), canActivate: [clientAuthGuard], data: { tab: 'bookings' } },
      { path: 'my-invoices', loadComponent: () => import('./features/client/my-invoices/my-invoices.component').then(m => m.MyInvoicesComponent), canActivate: [clientAuthGuard] },
      { path: 'settings', loadComponent: () => import('./features/client/account-settings/account-settings.component').then(m => m.AccountSettingsComponent), canActivate: [clientAuthGuard] },
      { path: 'terms', loadComponent: () => import('./features/auth/legal-support/public-information-page.component').then(m => m.PublicInformationPageComponent), data: { page: 'TERMS' } },
      { path: 'privacy', loadComponent: () => import('./features/auth/legal-support/public-information-page.component').then(m => m.PublicInformationPageComponent), data: { page: 'PRIVACY' } },
      { path: 'cookies', loadComponent: () => import('./features/auth/legal-support/public-information-page.component').then(m => m.PublicInformationPageComponent), data: { page: 'COOKIES' } },
      { path: 'contact', loadComponent: () => import('./features/auth/legal-support/public-information-page.component').then(m => m.PublicInformationPageComponent), data: { page: 'CONTACT' } },
      { path: 'support', loadComponent: () => import('./features/auth/legal-support/public-information-page.component').then(m => m.PublicInformationPageComponent), data: { page: 'SUPPORT' } }
    ]
  },
  { path: 'payment-result', loadComponent: () => import('./features/client/payment-result/payment-result').then(m => m.PaymentResultComponent) },
  { path: 'forgot-password', loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent) },
  { path: 'reset-password', loadComponent: () => import('./features/auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent) },
  { path: 'verify-email', loadComponent: () => import('./features/auth/verify-email/verify-email.component').then(m => m.VerifyEmailComponent) },
  { path: 'login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'register', loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent) },
  { path: 'partner/register', loadComponent: () => import('./features/client/partner-register/partner-register.component').then(m => m.PartnerRegisterComponent), canActivate: [clientAuthGuard] },
  { path: 'partner/registration-status', loadComponent: () => import('./features/client/partner-registration-status/partner-registration-status.component').then(m => m.PartnerRegistrationStatusComponent), canActivate: [clientAuthGuard] },
  { path: 'admin/login', loadComponent: () => import('./features/auth/admin-login/admin-login.component').then(m => m.AdminLoginComponent) },
  {
    path: 'admin',
    loadComponent: () => import('./layout/admin-layout/admin-layout').then(m => m.AdminLayout),
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/admin/dashboard/dashboard').then(m => m.Dashboard), canActivate: [systemDashboardGuard, permissionGuard], data: { functionCode: FunctionCode.REPORT, actionCode: ActionCode.VIEW } },
      { path: 'profile', loadComponent: () => import('./features/admin/profile/profile.component').then(m => m.AdminProfileComponent) },
      { path: 'users', loadComponent: () => import('./features/admin/user-management/user-management').then(m => m.UserManagement), canActivate: [permissionGuard], data: { functionCode: FunctionCode.USER, actionCode: ActionCode.VIEW, userType: 'STAFF' } },
      { path: 'customers', loadComponent: () => import('./features/admin/user-management/user-management').then(m => m.UserManagement), canActivate: [permissionGuard], data: { functionCode: FunctionCode.CUSTOMER, actionCode: ActionCode.VIEW, userType: 'CUSTOMER' } },

      { path: 'room-types', loadComponent: () => import('./features/admin/room-type-management/room-type-management').then(m => m.RoomTypeManagement), canActivate: [permissionGuard], data: { functionCode: FunctionCode.ROOM_TYPE, actionCode: ActionCode.VIEW } },
      { path: 'rooms', loadComponent: () => import('./features/admin/room-management/room-management').then(m => m.RoomManagement), canActivate: [permissionGuard], data: { functionCode: FunctionCode.ROOM, actionCode: ActionCode.VIEW } },
      { path: 'services', loadComponent: () => import('./features/admin/service-management/service-management').then(m => m.ServiceManagement), canActivate: [permissionGuard], data: { functionCode: FunctionCode.HOTEL_SERVICE, actionCode: ActionCode.VIEW } },
      { path: 'reservations', loadComponent: () => import('./features/admin/reservation-management/reservation-management').then(m => m.ReservationManagement), canActivate: [permissionGuard], data: { functionCode: FunctionCode.RESERVATION, actionCode: ActionCode.VIEW } },
      { path: 'refunds', loadComponent: () => import('./features/admin/reservation-management/refund-management.component').then(m => m.RefundManagementComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.PROPERTY_REFUND, actionCode: ActionCode.VIEW } },
      { path: 'platform-revenue', loadComponent: () => import('./features/admin/platform-revenue/platform-revenue.component').then(m => m.PlatformRevenueComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.PLATFORM_REVENUE, actionCode: ActionCode.VIEW } },
      { path: 'reservations/timeline', loadComponent: () => import('./features/admin/reservation-timeline/reservation-timeline.component').then(m => m.ReservationTimelineComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.RESERVATION, actionCode: ActionCode.VIEW } },
      { path: 'reservations/create', loadComponent: () => import('./features/admin/reservation-create/reservation-create').then(m => m.ReservationCreate), canActivate: [permissionGuard], data: { functionCode: FunctionCode.RESERVATION, actionCode: ActionCode.CREATE } },
      { path: 'invoices', loadComponent: () => import('./features/admin/invoice-management/invoice-management').then(m => m.InvoiceManagement), canActivate: [permissionGuard], data: { functionCode: FunctionCode.INVOICE, actionCode: ActionCode.VIEW } },
      { path: 'housekeeping', loadComponent: () => import('./features/management/housekeeping/housekeeping.component').then(m => m.HousekeepingComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.HOUSEKEEPING, actionCode: ActionCode.VIEW } },
      { path: 'property-revenue', loadComponent: () => import('./features/management/property-revenue/property-revenue.component').then(m => m.PropertyRevenueComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.REPORT, actionCode: ActionCode.VIEW } },
      { path: 'modules', loadComponent: () => import('./features/system/module-management/module-management').then(m => m.ModuleManagementComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.SYSTEM, actionCode: ActionCode.VIEW } },
      { path: 'chat', loadComponent: () => import('./features/admin/chat-dashboard/chat-dashboard').then(m => m.ChatDashboardComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.AI_CHAT, actionCode: ActionCode.VIEW } },
      { path: 'properties', loadComponent: () => import('./features/admin/property-management/property-management').then(m => m.PropertyManagementComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.HOTEL, actionCode: ActionCode.VIEW } },
      { path: 'plans', loadComponent: () => import('./features/admin/subscription-plans/subscription-plans').then(m => m.SubscriptionPlansComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.PLATFORM_BILLING, actionCode: ActionCode.VIEW } },
      { path: 'platform-payment-configuration', loadComponent: () => import('./features/admin/platform-payment-configuration/platform-payment-configuration.component').then(m => m.PlatformPaymentConfigurationComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.PAYMENT_READINESS, actionCode: ActionCode.VIEW } },
      { path: 'roles', loadComponent: () => import('./features/admin/role-management/role-management.component').then(m => m.RoleManagementComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.ROLE, actionCode: ActionCode.VIEW } },
      { path: 'role-permissions', loadComponent: () => import('./features/admin/role-permission/role-permission.component').then(m => m.RolePermissionComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.ROLE_PERMISSION, actionCode: ActionCode.VIEW } },
      { path: 'audit-log', loadComponent: () => import('./features/admin/audit-log/audit-log.component').then(m => m.AuditLogComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.AUDIT_LOG, actionCode: ActionCode.VIEW } },
      { path: 'email-outbox', loadComponent: () => import('./features/admin/email-outbox/email-outbox.component').then(m => m.EmailOutboxComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.AUDIT_LOG, actionCode: ActionCode.VIEW } },
      { path: 'property-claims', loadComponent: () => import('./features/admin/property-claims/property-claims.component').then(m => m.PropertyClaimsComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.PROPERTY_CLAIM, actionCode: ActionCode.VIEW } },
      { path: 'property-owners', loadComponent: () => import('./features/admin/partner-overview/partner-overview.component').then(m => m.PartnerOverviewComponent), canActivate: [permissionGuard], data: { title: 'Chủ cơ sở', endpoint: 'property-owners', functionCode: FunctionCode.USER, actionCode: ActionCode.VIEW } },
      { path: 'property-registrations', loadComponent: () => import('./features/admin/partner-overview/partner-overview.component').then(m => m.PartnerOverviewComponent), canActivate: [permissionGuard], data: { title: 'Tài khoản đã đăng phòng', endpoint: 'property-registrations', functionCode: FunctionCode.HOTEL, actionCode: ActionCode.VIEW } },
      { path: 'unsubscribed-owners', loadComponent: () => import('./features/admin/partner-overview/partner-overview.component').then(m => m.PartnerOverviewComponent), canActivate: [permissionGuard], data: { title: 'Tài khoản chưa mua gói', endpoint: 'property-owners/unsubscribed', functionCode: FunctionCode.PLATFORM_BILLING, actionCode: ActionCode.VIEW } },
      { path: 'property-approvals', loadComponent: () => import('./features/admin/partner-overview/partner-overview.component').then(m => m.PartnerOverviewComponent), canActivate: [permissionGuard], data: { title: 'Duyệt cơ sở', endpoint: 'property-approvals', functionCode: FunctionCode.HOTEL, actionCode: ActionCode.APPROVE } },
      { path: 'property-staff', loadComponent: () => import('./features/admin/partner-overview/partner-overview.component').then(m => m.PartnerOverviewComponent), canActivate: [permissionGuard], data: { title: 'Nhân viên cơ sở', endpoint: 'property-staff', functionCode: FunctionCode.USER, actionCode: ActionCode.VIEW } },
      { path: 'property-room-types', loadComponent: () => import('./features/admin/partner-overview/partner-overview.component').then(m => m.PartnerOverviewComponent), canActivate: [permissionGuard], data: { title: 'Danh mục loại phòng', endpoint: 'property-room-types', functionCode: FunctionCode.ROOM_TYPE, actionCode: ActionCode.VIEW } },
      { path: 'property-rooms', loadComponent: () => import('./features/admin/partner-overview/partner-overview.component').then(m => m.PartnerOverviewComponent), canActivate: [permissionGuard], data: { title: 'Danh sách phòng', endpoint: 'property-rooms', functionCode: FunctionCode.ROOM, actionCode: ActionCode.VIEW } },
      { path: 'subscription-orders', loadComponent: () => import('./features/admin/partner-overview/partner-overview.component').then(m => m.PartnerOverviewComponent), canActivate: [permissionGuard], data: { title: 'Đơn đăng ký gói', endpoint: 'subscription-orders', functionCode: FunctionCode.PLATFORM_BILLING, actionCode: ActionCode.VIEW } },
      { path: 'subscription-payments', loadComponent: () => import('./features/admin/partner-overview/partner-overview.component').then(m => m.PartnerOverviewComponent), canActivate: [permissionGuard], data: { title: 'Thanh toán gói', endpoint: 'subscription-payments', functionCode: FunctionCode.PLATFORM_BILLING, actionCode: ActionCode.VIEW } },
      { path: 'software-contracts', loadComponent: () => import('./features/admin/partner-overview/partner-overview.component').then(m => m.PartnerOverviewComponent), canActivate: [permissionGuard], data: { title: 'Hợp đồng phần mềm', endpoint: 'software-contracts', functionCode: FunctionCode.PLATFORM_BILLING, actionCode: ActionCode.VIEW } },
      { path: 'role', redirectTo: 'roles', pathMatch: 'full' },
      { path: 'roles-management', redirectTo: 'roles', pathMatch: 'full' },
      { path: 'permissions/roles', redirectTo: 'role-permissions', pathMatch: 'full' },
      { path: 'room-type', redirectTo: 'room-types', pathMatch: 'full' },
      { path: 'manage-rooms', redirectTo: 'rooms', pathMatch: 'full' },
      { path: '404', loadComponent: () => import('./features/error/not-found/not-found.component').then(m => m.NotFoundComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: '**', redirectTo: '404' }
    ]
  },
  {
    path: 'management',
    loadComponent: () => import('./layout/management-layout/management-layout').then(m => m.ManagementLayout),
    canActivate: [authGuard, roleGuard],
    data: { roles: ['PROPERTY_OWNER', 'HOTEL_ADMIN', 'HOTEL_MANAGER', 'RECEPTIONIST', 'HOUSEKEEPING', 'SUPER_ADMIN', 'ADMIN'] },
    children: [
      { path: 'dashboard', loadComponent: () => import('./features/management/dashboard/management-dashboard.component').then(m => m.ManagementDashboardComponent) },
      { path: 'properties', loadComponent: () => import('./features/management/properties/management-properties.component').then(m => m.ManagementPropertiesComponent) },
      { path: 'room-types', loadComponent: () => import('./features/management/inventory/management-inventory.component').then(m => m.ManagementInventoryComponent), canActivate: [permissionGuard], data: { mode: 'room-types', functionCode: FunctionCode.ROOM_TYPE, actionCode: ActionCode.VIEW } },
      { path: 'promotions', loadComponent: () => import('./features/management/promotions/promotion-management.component').then(m => m.PromotionManagementComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.HOTEL, actionCode: ActionCode.VIEW } },
      { path: 'rooms', loadComponent: () => import('./features/management/inventory/management-inventory.component').then(m => m.ManagementInventoryComponent), canActivate: [permissionGuard], data: { mode: 'rooms', functionCode: FunctionCode.ROOM, actionCode: ActionCode.VIEW } },
      { path: 'front-desk', loadComponent: () => import('./features/admin/reservation-management/reservation-management').then(m => m.ReservationManagement), canActivate: [permissionGuard], data: { functionCode: FunctionCode.RESERVATION, actionCode: ActionCode.VIEW } },
      { path: 'front-desk/create', loadComponent: () => import('./features/admin/reservation-create/reservation-create').then(m => m.ReservationCreate), canActivate: [permissionGuard], data: { functionCode: FunctionCode.RESERVATION, actionCode: ActionCode.CREATE } },
      { path: 'front-desk/timeline', loadComponent: () => import('./features/admin/reservation-timeline/reservation-timeline.component').then(m => m.ReservationTimelineComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.RESERVATION, actionCode: ActionCode.VIEW } },
      { path: 'housekeeping', loadComponent: () => import('./features/management/housekeeping/housekeeping.component').then(m => m.HousekeepingComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.HOUSEKEEPING, actionCode: ActionCode.VIEW } },
      { path: 'tasks', loadComponent: () => import('./features/management/operational-tasks/operational-tasks.component').then(m => m.OperationalTasksComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.OPERATIONAL_TASK, actionCode: ActionCode.VIEW } },
      { path: 'ai-tasks', loadComponent: () => import('./features/management/operational-tasks/operational-tasks.component').then(m => m.OperationalTasksComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.OPERATIONAL_TASK, actionCode: ActionCode.VIEW } },
      { path: 'services', loadComponent: () => import('./features/admin/service-management/service-management').then(m => m.ServiceManagement), canActivate: [permissionGuard], data: { functionCode: FunctionCode.HOTEL_SERVICE, actionCode: ActionCode.VIEW } },
      { path: 'payment-configuration', loadComponent: () => import('./features/management/property-payment-configuration/property-payment-configuration.component').then(m => m.PropertyPaymentConfigurationComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.PROPERTY_PAYMENT_CONFIG, actionCode: ActionCode.VIEW } },
      { path: 'refunds', loadComponent: () => import('./features/admin/reservation-management/refund-management.component').then(m => m.RefundManagementComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.PROPERTY_REFUND, actionCode: ActionCode.VIEW } },
      { path: 'property-revenue', loadComponent: () => import('./features/management/property-revenue/property-revenue.component').then(m => m.PropertyRevenueComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.REPORT, actionCode: ActionCode.VIEW } },
      { path: 'audit-log', loadComponent: () => import('./features/admin/audit-log/audit-log.component').then(m => m.AuditLogComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.AUDIT_LOG, actionCode: ActionCode.VIEW } },
      { path: 'billing', loadComponent: () => import('./features/management/subscription-billing/subscription-billing.component').then(m => m.SubscriptionBillingComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.PLATFORM_BILLING, actionCode: ActionCode.VIEW } },
      { path: 'support', loadComponent: () => import('./features/management/system-support/system-support.component').then(m => m.SystemSupportComponent), canActivate: [permissionGuard], data: { functionCode: FunctionCode.AI_CHAT, actionCode: ActionCode.VIEW } },
      { path: 'subscription', redirectTo: 'billing', pathMatch: 'full' },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  { path: '403', loadComponent: () => import('./features/error/forbidden/forbidden.component').then(m => m.ForbiddenComponent) },
  { path: '**', redirectTo: '' }
];
