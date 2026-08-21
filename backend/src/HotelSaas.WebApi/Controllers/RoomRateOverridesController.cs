using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/room-rate-overrides")]
[Authorize]
public sealed class RoomRateOverridesController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "room_type.read")]
    public async Task<ActionResult<List<RoomRateOverrideDto>>> List([FromQuery] Guid roomTypeId)
    {
        var roomType = await FindRoomType(roomTypeId);
        if (roomType is null) return NotFound();
        if (!CanAccess(roomType.TenantId)) return Forbid();
        var rates = await context.RoomRateOverrides.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.RoomTypeId == roomTypeId && !item.IsDeleted)
            .OrderBy(item => item.StartDate).ThenByDescending(item => item.Priority).ToListAsync();
        return Ok(rates.Select(ToDto).ToList());
    }

    [HttpPost]
    [Authorize(Policy = "room_type.create")]
    public async Task<ActionResult<RoomRateOverrideDto>> Create([FromBody] SaveRoomRateOverrideRequest request)
    {
        var roomType = await FindRoomType(request.RoomTypeId);
        if (roomType is null) return NotFound(new { message = "Không tìm thấy loại phòng." });
        if (!CanAccess(roomType.TenantId)) return Forbid();
        var error = Validate(request); if (error is not null) return BadRequest(new { message = error });
        var rate = new RoomRateOverride { TenantId = roomType.TenantId, RoomTypeId = roomType.Id };
        Apply(rate, request); context.RoomRateOverrides.Add(rate); await context.SaveChangesAsync();
        return CreatedAtAction(nameof(List), new { roomTypeId = roomType.Id }, ToDto(rate));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "room_type.update")]
    public async Task<ActionResult<RoomRateOverrideDto>> Update(Guid id, [FromBody] SaveRoomRateOverrideRequest request)
    {
        var rate = await context.RoomRateOverrides.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
        if (rate is null) return NotFound();
        if (!CanAccess(rate.TenantId) || request.RoomTypeId != rate.RoomTypeId) return Forbid();
        var error = Validate(request); if (error is not null) return BadRequest(new { message = error });
        Apply(rate, request); await context.SaveChangesAsync(); return Ok(ToDto(rate));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "room_type.delete")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var rate = await context.RoomRateOverrides.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
        if (rate is null) return NotFound();
        if (!CanAccess(rate.TenantId)) return Forbid();
        rate.IsDeleted = true; rate.IsActive = false; await context.SaveChangesAsync(); return NoContent();
    }

    private Task<RoomType?> FindRoomType(Guid id) => context.RoomTypes.IgnoreQueryFilters()
        .FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
    private bool CanAccess(Guid tenantId) => User.IsInRole("SuperAdmin") ||
        Guid.TryParse(User.FindFirstValue("tenant_id"), out var scopedTenantId) && scopedTenantId == tenantId;
    private static string? Validate(SaveRoomRateOverrideRequest request) => request.RoomTypeId == Guid.Empty ? "Loại phòng là bắt buộc."
        : request.StartDate > request.EndDate ? "Ngày kết thúc phải từ ngày bắt đầu trở đi."
        : request.NightlyPrice <= 0 ? "Giá mỗi đêm phải lớn hơn 0."
        : request.Priority is < 0 or > 1000 ? "Priority phải từ 0 đến 1000." : null;
    private static void Apply(RoomRateOverride rate, SaveRoomRateOverrideRequest request)
    { rate.StartDate = request.StartDate; rate.EndDate = request.EndDate; rate.NightlyPrice = request.NightlyPrice; rate.Priority = request.Priority; rate.IsActive = request.IsActive; }
    private static RoomRateOverrideDto ToDto(RoomRateOverride rate) => new(rate.Id, rate.TenantId, rate.RoomTypeId,
        rate.StartDate, rate.EndDate, rate.NightlyPrice, rate.Priority, rate.IsActive, rate.CreatedAtUtc, rate.UpdatedAtUtc);
}

public sealed record SaveRoomRateOverrideRequest(Guid RoomTypeId, DateOnly StartDate, DateOnly EndDate,
    decimal NightlyPrice, int Priority = 0, bool IsActive = true);
public sealed record RoomRateOverrideDto(Guid Id, Guid TenantId, Guid RoomTypeId, DateOnly StartDate, DateOnly EndDate,
    decimal NightlyPrice, int Priority, bool IsActive, DateTime CreatedAtUtc, DateTime? UpdatedAtUtc);
