using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Application.DTOs.Reservations;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReservationsController : ControllerBase
{
    private readonly IApplicationDbContext _context;

    public ReservationsController(IApplicationDbContext context)
    {
        _context = context;
    }

    [HttpPost("hold")]
    public async Task<ActionResult<Result<BookingHoldResponseDto>>> CreateBookingHold([FromBody] CreateBookingHoldRequestDto request)
    {
        var roomType = await _context.RoomTypes
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(rt => rt.Id == request.RoomTypeId && rt.TenantId == request.TenantId);

        if (roomType == null) return NotFound(Result<BookingHoldResponseDto>.Failure("Không tìm thấy loại phòng."));

        var hold = new BookingHold
        {
            TenantId = request.TenantId,
            RoomTypeId = request.RoomTypeId,
            CheckInDate = request.CheckInDate.ToDateTime(TimeOnly.MinValue),
            CheckOutDate = request.CheckOutDate.ToDateTime(TimeOnly.MinValue),
            Quantity = request.Quantity,
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(15)
        };

        _context.BookingHolds.Add(hold);
        await _context.SaveChangesAsync();

        var nights = request.CheckOutDate.DayNumber - request.CheckInDate.DayNumber;
        var estTotal = roomType.BasePricePerNight * nights * request.Quantity;

        var resp = new BookingHoldResponseDto(hold.HoldToken, hold.ExpiresAtUtc, hold.TenantId, hold.RoomTypeId, request.CheckInDate, request.CheckOutDate, estTotal);
        return Ok(Result<BookingHoldResponseDto>.Success(resp, "Đã khóa giữ chỗ 15 phút."));
    }

    [HttpPost("confirm")]
    public async Task<ActionResult<Result<ReservationDto>>> ConfirmBooking([FromBody] ConfirmBookingRequestDto request)
    {
        var hold = await _context.BookingHolds
            .IgnoreQueryFilters()
            .Include(h => h.RoomType)
            .FirstOrDefaultAsync(h => h.HoldToken == request.HoldToken);

        if (hold == null || hold.IsReleased || hold.ExpiresAtUtc < DateTime.UtcNow)
        {
            return BadRequest(Result<ReservationDto>.Failure("Phiên giữ chỗ không hợp lệ hoặc đã hết hạn 15 phút."));
        }

        var checkInDate = DateOnly.FromDateTime(hold.CheckInDate);
        var checkOutDate = DateOnly.FromDateTime(hold.CheckOutDate);
        var nights = checkOutDate.DayNumber - checkInDate.DayNumber;
        var totalAmount = hold.RoomType!.BasePricePerNight * nights * hold.Quantity;
        var bookingCode = $"LXS-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..6].ToUpper()}";

        var reservation = new Reservation
        {
            TenantId = hold.TenantId,
            BookingCode = bookingCode,
            GuestFullName = request.GuestFullName,
            GuestEmail = request.GuestEmail,
            GuestPhoneNumber = request.GuestPhoneNumber,
            GuestIdentityCard = request.GuestIdentityCard,
            CheckInDate = checkInDate,
            CheckOutDate = checkOutDate,
            Status = request.PaymentMethod == PaymentMethod.VNPay ? ReservationStatus.PendingPayment : ReservationStatus.Confirmed,
            TotalAmount = totalAmount,
            DepositAmount = request.PaymentMethod == PaymentMethod.VNPay ? totalAmount : 0,
            SpecialRequests = request.SpecialRequests
        };

        for (int i = 0; i < hold.Quantity; i++)
        {
            reservation.Details.Add(new ReservationDetail
            {
                TenantId = hold.TenantId,
                RoomTypeId = hold.RoomTypeId,
                NightlyPrice = hold.RoomType.BasePricePerNight,
                NumberOfNights = nights,
                SubTotal = hold.RoomType.BasePricePerNight * nights
            });
        }

        var folio = new Folio
        {
            TenantId = hold.TenantId,
            FolioNumber = $"FOL-{bookingCode}",
            TotalCharges = totalAmount,
            TotalCredits = 0
        };

        folio.Items.Add(new FolioItem
        {
            TenantId = hold.TenantId,
            ItemType = FolioItemType.RoomCharge,
            Description = $"Tiền phòng ({nights} đêm)",
            UnitPrice = totalAmount,
            Quantity = 1
        });

        reservation.Folio = folio;
        _context.Reservations.Add(reservation);

        hold.IsConvertedToReservation = true;
        await _context.SaveChangesAsync();

        var dto = new ReservationDto(reservation.Id, reservation.TenantId, reservation.BookingCode, reservation.GuestFullName, reservation.GuestEmail, reservation.GuestPhoneNumber, reservation.CheckInDate, reservation.CheckOutDate, reservation.Status, reservation.TotalAmount, reservation.DepositAmount, hold.RoomType.Name, new List<string>());
        return Ok(Result<ReservationDto>.Success(dto, "Tạo đơn đặt phòng thành công!"));
    }
}
