using HotelSaas.Domain.Enums;

namespace HotelSaas.Application.DTOs.Reservations;

public record CreateBookingHoldRequestDto(
    Guid TenantId,
    Guid RoomTypeId,
    DateOnly CheckInDate,
    DateOnly CheckOutDate,
    int Quantity = 1,
    string? CouponCode = null
);

public record BookingHoldResponseDto(
    string HoldToken,
    DateTime ExpiresAtUtc,
    Guid TenantId,
    Guid RoomTypeId,
    DateOnly CheckInDate,
    DateOnly CheckOutDate,
    decimal EstimatedTotal,
    decimal BaseSubtotal = 0,
    decimal DiscountAmount = 0,
    decimal TaxAmount = 0,
    decimal FeeAmount = 0,
    Guid? PromotionId = null,
    string? PromotionCode = null,
    string? PromotionTitle = null
);

public record ConfirmBookingRequestDto(
    string HoldToken,
    string GuestFullName,
    string GuestEmail,
    string GuestPhoneNumber,
    string? GuestIdentityCard,
    string? SpecialRequests,
    PaymentMethod PaymentMethod,
    int? Adults = null,
    int? Children = null
);

public record ReservationDto(
    Guid Id,
    Guid TenantId,
    string BookingCode,
    string GuestFullName,
    string GuestEmail,
    string GuestPhoneNumber,
    DateOnly CheckInDate,
    DateOnly CheckOutDate,
    ReservationStatus Status,
    decimal TotalAmount,
    decimal DepositAmount,
    string? RoomTypeName,
    List<string> AssignedRooms
);
