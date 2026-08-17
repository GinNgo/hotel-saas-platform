using HotelSaas.Domain.Enums;

namespace HotelSaas.Application.DTOs.Rooms;

public record RoomTypeDto(
    Guid Id,
    Guid TenantId,
    string Name,
    string Code,
    string? Description,
    decimal BasePricePerNight,
    int CapacityAdults,
    int CapacityChildren,
    double AreaSquareMeters,
    string? BedType,
    List<string> Images
);

public record RoomDto(
    Guid Id,
    string RoomNumber,
    int Floor,
    Guid RoomTypeId,
    string RoomTypeName,
    RoomStatus Status,
    bool IsActive
);

public record SearchRoomsQueryDto(
    string? City,
    Guid? TenantId,
    DateOnly CheckInDate,
    DateOnly CheckOutDate,
    int Adults = 2,
    int Children = 0
);

public record AvailableRoomResultDto(
    Guid TenantId,
    string TenantName,
    string City,
    Guid RoomTypeId,
    string RoomTypeName,
    decimal BasePricePerNight,
    int AvailableCount,
    int CapacityAdults,
    int CapacityChildren
);
