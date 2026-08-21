using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/promotions")]
[Authorize]
public sealed class PromotionsController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "hotel.read")]
    public async Task<ActionResult<List<PromotionDto>>> List()
    {
        if (!TenantId(out var tenantId)) return Forbid();
        var rows = await context.Promotions.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.TenantId == tenantId && !item.IsDeleted)
            .OrderByDescending(item => item.StartDateUtc).ThenBy(item => item.Code)
            .ToListAsync();
        return Ok(rows.Select(ToDto).ToList());
    }

    [HttpPost]
    [Authorize(Policy = "hotel.create")]
    public async Task<ActionResult<PromotionDto>> Create([FromBody] SavePromotionRequest request)
    {
        if (!TenantId(out var tenantId)) return Forbid();
        var error = Validate(request); if (error is not null) return BadRequest(new { message = error });
        if (await context.Promotions.IgnoreQueryFilters().AnyAsync(item => item.TenantId == tenantId && !item.IsDeleted && item.Code == request.Code.Trim().ToUpperInvariant()))
            return Conflict(new { message = "Mã ưu đãi đã tồn tại trong cơ sở." });
        var promotion = new Promotion { TenantId = tenantId };
        Apply(promotion, request); context.Promotions.Add(promotion); await context.SaveChangesAsync();
        return CreatedAtAction(nameof(List), new { id = promotion.Id }, ToDto(promotion));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "hotel.update")]
    public async Task<ActionResult<PromotionDto>> Update(Guid id, [FromBody] SavePromotionRequest request)
    {
        if (!TenantId(out var tenantId)) return Forbid();
        var promotion = await context.Promotions.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == id && item.TenantId == tenantId && !item.IsDeleted);
        if (promotion is null) return NotFound();
        var error = Validate(request); if (error is not null) return BadRequest(new { message = error });
        if (await context.Promotions.IgnoreQueryFilters().AnyAsync(item => item.TenantId == tenantId && item.Id != id && !item.IsDeleted && item.Code == request.Code.Trim().ToUpperInvariant()))
            return Conflict(new { message = "Mã ưu đãi đã tồn tại trong cơ sở." });
        Apply(promotion, request); await context.SaveChangesAsync(); return Ok(ToDto(promotion));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "hotel.update")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        if (!TenantId(out var tenantId)) return Forbid();
        var promotion = await context.Promotions.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == id && item.TenantId == tenantId && !item.IsDeleted);
        if (promotion is null) return NotFound();
        promotion.IsActive = false; promotion.IsDeleted = true; await context.SaveChangesAsync(); return NoContent();
    }

    private bool TenantId(out Guid tenantId) => Guid.TryParse(User.FindFirstValue("tenant_id"), out tenantId);
    private static string? Validate(SavePromotionRequest request) => request.ApplicationType is not ("AUTOMATIC" or "COUPON") ? "Loại ưu đãi không hợp lệ."
        : string.IsNullOrWhiteSpace(request.Code) ? "Mã ưu đãi là bắt buộc."
        : request.Code.Trim().Length > 50 ? "Mã ưu đãi tối đa 50 ký tự."
        : string.IsNullOrWhiteSpace(request.Title) ? "Tên ưu đãi là bắt buộc."
        : request.DiscountPercent <= 0 || request.DiscountPercent > 100 ? "Phần trăm giảm phải từ 0 đến 100."
        : request.StartDateUtc >= request.EndDateUtc ? "Ngày kết thúc phải sau ngày bắt đầu." : null;
    private static void Apply(Promotion promotion, SavePromotionRequest request)
    {
        promotion.ApplicationType = request.ApplicationType; promotion.Code = request.Code.Trim().ToUpperInvariant(); promotion.Title = request.Title.Trim();
        promotion.DiscountPercent = request.DiscountPercent; promotion.MaxDiscountAmount = request.MaxDiscountAmount;
        promotion.MinBookingAmount = request.MinBookingAmount; promotion.StartDateUtc = request.StartDateUtc;
        promotion.EndDateUtc = request.EndDateUtc; promotion.IsActive = request.IsActive;
    }
    private static PromotionDto ToDto(Promotion item) => new(item.Id, item.TenantId, item.Code, item.Title, item.DiscountPercent,
        item.MaxDiscountAmount, item.MinBookingAmount, item.StartDateUtc, item.EndDateUtc, item.IsActive, item.ApplicationType);
}

public sealed record SavePromotionRequest(string Code, string Title, decimal DiscountPercent, decimal? MaxDiscountAmount,
    decimal? MinBookingAmount, DateTime StartDateUtc, DateTime EndDateUtc, bool IsActive = true, string ApplicationType = "AUTOMATIC");
public sealed record PromotionDto(Guid Id, Guid TenantId, string Code, string Title, decimal DiscountPercent,
    decimal? MaxDiscountAmount, decimal? MinBookingAmount, DateTime StartDateUtc, DateTime EndDateUtc, bool IsActive, string ApplicationType);
