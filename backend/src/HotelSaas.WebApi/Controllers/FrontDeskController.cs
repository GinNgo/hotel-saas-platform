using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Application.DTOs.FrontDesk;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FrontDeskController : ControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentTenantService _tenantService;

    public FrontDeskController(IApplicationDbContext context, ICurrentTenantService tenantService)
    {
        _context = context;
        _tenantService = tenantService;
    }

    [HttpPost("check-in")]
    [Authorize(Policy = "reservation.checkin")]
    public async Task<ActionResult<Result>> CheckIn([FromBody] CheckInRequestDto request)
    {
        var reservation = await _context.Reservations
            .Include(r => r.Details)
            .FirstOrDefaultAsync(r => r.Id == request.ReservationId);

        if (reservation == null) return NotFound(Result.Failure("Không tìm thấy đơn đặt phòng."));
        if (reservation.Status != ReservationStatus.Confirmed)
            return Conflict(Result.Failure("Chỉ có thể check-in đơn đã xác nhận."));

        var requiredRooms = reservation.Details.Count;
        var requestedRoomIds = request.AssignedRoomIds.Distinct().ToList();
        if (requestedRoomIds.Count != requiredRooms)
            return BadRequest(Result.Failure($"Cần gán đúng {requiredRooms} phòng cho đơn đặt phòng."));

        var assignedRooms = await _context.Rooms
            .Where(r => requestedRoomIds.Contains(r.Id) && r.IsActive)
            .ToListAsync();

        if (assignedRooms.Count != requestedRoomIds.Count)
            return BadRequest(Result.Failure("Một hoặc nhiều phòng được chọn không tồn tại hoặc đã ngừng hoạt động."));

        var remainingByType = reservation.Details
            .GroupBy(d => d.RoomTypeId)
            .ToDictionary(group => group.Key, group => group.Count());

        foreach (var room in assignedRooms)
        {
            if (room.Status != RoomStatus.Clean) return BadRequest(Result.Failure($"Phòng {room.RoomNumber} chưa Sạch."));
            if (!remainingByType.TryGetValue(room.RoomTypeId, out var remaining) || remaining == 0)
                return BadRequest(Result.Failure($"Phòng {room.RoomNumber} không đúng hạng phòng đã đặt."));
            remainingByType[room.RoomTypeId] = remaining - 1;
        }

        foreach (var detail in reservation.Details)
        {
            var room = assignedRooms.First(r => r.RoomTypeId == detail.RoomTypeId && !reservation.Details.Any(d => d != detail && d.RoomId == r.Id));
            detail.RoomId = room.Id;
            room.Status = RoomStatus.Occupied;
        }

        reservation.Status = ReservationStatus.CheckedIn;
        reservation.ActualCheckInUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(Result.Success($"Check-in thành công cho khách {reservation.GuestFullName}."));
    }

    [HttpPost("folio/add-item")]
    [Authorize(Policy = "reservation.read")]
    public async Task<ActionResult<Result>> AddFolioItem([FromBody] AddFolioItemRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Description))
            return BadRequest(Result.Failure("Mô tả phí dịch vụ là bắt buộc."));
        if (request.UnitPrice <= 0 || request.Quantity <= 0)
            return BadRequest(Result.Failure("Đơn giá và số lượng phải lớn hơn 0."));

        // Kiểm tra Feature Tier (Gói Basic không có Folio nâng cao)
        if (_tenantService.Tier == SubscriptionTier.Basic)
        {
            return BadRequest(Result.Failure("Chức năng quản lý Folio Dịch vụ chỉ khả dụng từ gói PRO trở lên. Vui lòng nâng cấp gói."));
        }

        var folio = await _context.Folios.FindAsync(request.FolioId);
        if (folio == null || folio.IsClosed) return BadRequest(Result.Failure("Folio không hợp lệ hoặc đã đóng."));

        var item = new FolioItem
        {
            TenantId = folio.TenantId,
            FolioId = request.FolioId,
            ItemType = request.ItemType,
            Description = request.Description.Trim(),
            UnitPrice = request.UnitPrice,
            Quantity = request.Quantity,
            CreatedByStaffName = User.FindFirstValue(ClaimTypes.Name) ?? "Lễ tân"
        };

        folio.TotalCharges += item.Amount;
        _context.FolioItems.Add(item);
        await _context.SaveChangesAsync();

        return Ok(Result.Success("Đã thêm phí dịch vụ vào hóa đơn."));
    }

    [HttpPost("check-out")]
    [Authorize(Policy = "reservation.checkout")]
    public async Task<ActionResult<Result>> CheckOut([FromBody] CheckOutRequestDto request)
    {
        if (request.AdditionalPayment < 0)
            return BadRequest(Result.Failure("Khoản thanh toán bổ sung không thể là số âm."));

        var reservation = await _context.Reservations
            .Include(r => r.Details).ThenInclude(d => d.Room)
            .Include(r => r.Folio)
            .FirstOrDefaultAsync(r => r.Id == request.ReservationId);

        if (reservation == null) return NotFound(Result.Failure("Không tìm thấy đơn."));
        if (reservation.Status != ReservationStatus.CheckedIn)
            return Conflict(Result.Failure("Chỉ có thể check-out đơn đang lưu trú."));

        if (reservation.Folio != null)
        {
            if (reservation.Folio.BalanceDue - request.AdditionalPayment > 0)
                return BadRequest(Result.Failure($"Khách còn thiếu {reservation.Folio.BalanceDue - request.AdditionalPayment:N0} VND."));

            if (request.AdditionalPayment > 0)
            {
                reservation.Folio.TotalCredits += request.AdditionalPayment;
                _context.Payments.Add(new Payment
                {
                    TenantId = reservation.TenantId,
                    ReservationId = reservation.Id,
                    Amount = request.AdditionalPayment,
                    Method = request.PaymentMethod,
                    Status = PaymentStatus.Completed,
                    TransactionReference = $"FRONTDESK-{Guid.NewGuid():N}",
                    PaidAtUtc = DateTime.UtcNow
                });
            }
            reservation.Folio.IsClosed = true;
        }

        foreach (var detail in reservation.Details)
        {
            if (detail.Room != null)
            {
                detail.Room.Status = RoomStatus.Dirty;
                var hasCheckoutCleaning = await _context.HousekeepingTasks.AnyAsync(task =>
                    task.ReservationId == reservation.Id && task.RoomId == detail.Room.Id &&
                    task.TaskType == "CheckoutCleaning" && task.Status != HousekeepingTaskStatus.Completed && !task.IsDeleted);
                if (!hasCheckoutCleaning) _context.HousekeepingTasks.Add(new HousekeepingTask
                {
                    TenantId = reservation.TenantId,
                    RoomId = detail.Room.Id,
                    ReservationId = reservation.Id,
                    TaskType = "CheckoutCleaning",
                    Status = HousekeepingTaskStatus.Pending,
                    Priority = HousekeepingPriority.High,
                    Notes = $"Dọn phòng sau khi {reservation.GuestFullName} check-out."
                });
            }
        }

        reservation.Status = ReservationStatus.CheckedOut;
        reservation.ActualCheckOutUtc = DateTime.UtcNow;
        var dateLocks = await _context.RoomDateLocks.IgnoreQueryFilters()
            .Where(item => item.ReservationId == reservation.Id).ToListAsync();
        _context.RoomDateLocks.RemoveRange(dateLocks);
        await _context.SaveChangesAsync();

        return Ok(Result.Success($"Check-out thành công cho khách {reservation.GuestFullName}."));
    }
}
