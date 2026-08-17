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
[Authorize(Roles = "Owner,Manager,Receptionist")]
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
    public async Task<ActionResult<Result>> CheckIn([FromBody] CheckInRequestDto request)
    {
        var reservation = await _context.Reservations
            .Include(r => r.Details)
            .FirstOrDefaultAsync(r => r.Id == request.ReservationId);

        if (reservation == null) return NotFound(Result.Failure("Không tìm thấy đơn đặt phòng."));

        var assignedRooms = await _context.Rooms
            .Where(r => request.AssignedRoomIds.Contains(r.Id))
            .ToListAsync();

        foreach (var room in assignedRooms)
        {
            if (room.Status != RoomStatus.Clean) return BadRequest(Result.Failure($"Phòng {room.RoomNumber} chưa Sạch."));
            room.Status = RoomStatus.Occupied;
        }

        for (int i = 0; i < reservation.Details.Count && i < assignedRooms.Count; i++)
        {
            reservation.Details.ElementAt(i).RoomId = assignedRooms[i].Id;
        }

        reservation.Status = ReservationStatus.CheckedIn;
        reservation.ActualCheckInUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(Result.Success($"Check-in thành công cho khách {reservation.GuestFullName}."));
    }

    [HttpPost("folio/add-item")]
    public async Task<ActionResult<Result>> AddFolioItem([FromBody] AddFolioItemRequestDto request)
    {
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
            Description = request.Description,
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
    public async Task<ActionResult<Result>> CheckOut([FromBody] CheckOutRequestDto request)
    {
        var reservation = await _context.Reservations
            .Include(r => r.Details).ThenInclude(d => d.Room)
            .Include(r => r.Folio)
            .FirstOrDefaultAsync(r => r.Id == request.ReservationId);

        if (reservation == null) return NotFound(Result.Failure("Không tìm thấy đơn."));

        if (reservation.Folio != null)
        {
            if (request.AdditionalPayment > 0) reservation.Folio.TotalCredits += request.AdditionalPayment;
            if (reservation.Folio.BalanceDue > 0) return BadRequest(Result.Failure($"Khách còn thiếu {reservation.Folio.BalanceDue:N0} VND."));
            reservation.Folio.IsClosed = true;
        }

        foreach (var detail in reservation.Details)
        {
            if (detail.Room != null)
            {
                detail.Room.Status = RoomStatus.Dirty;
                _context.HousekeepingTasks.Add(new HousekeepingTask
                {
                    TenantId = reservation.TenantId,
                    RoomId = detail.Room.Id,
                    Status = HousekeepingTaskStatus.Pending,
                    Priority = HousekeepingPriority.High,
                    Notes = $"Dọn phòng sau khi {reservation.GuestFullName} check-out."
                });
            }
        }

        reservation.Status = ReservationStatus.CheckedOut;
        reservation.ActualCheckOutUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return Ok(Result.Success($"Check-out thành công cho khách {reservation.GuestFullName}."));
    }
}
