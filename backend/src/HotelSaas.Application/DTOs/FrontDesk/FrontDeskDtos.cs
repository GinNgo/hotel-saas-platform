using HotelSaas.Domain.Enums;

namespace HotelSaas.Application.DTOs.FrontDesk;

public record CheckInRequestDto(
    Guid ReservationId,
    List<Guid> AssignedRoomIds,
    string? GuestIdentityCard
);

public record CheckOutRequestDto(
    Guid ReservationId,
    decimal AdditionalPayment = 0,
    PaymentMethod PaymentMethod = PaymentMethod.Cash
);

public record AddFolioItemRequestDto(
    Guid FolioId,
    FolioItemType ItemType,
    string Description,
    decimal UnitPrice,
    int Quantity = 1
);

public record FolioDto(
    Guid Id,
    Guid ReservationId,
    string FolioNumber,
    decimal TotalCharges,
    decimal TotalCredits,
    decimal BalanceDue,
    bool IsClosed,
    List<FolioItemDto> Items
);

public record FolioItemDto(
    Guid Id,
    FolioItemType ItemType,
    string Description,
    decimal UnitPrice,
    int Quantity,
    decimal Amount,
    DateTime DateIncurredUtc,
    string? CreatedByStaffName
);
