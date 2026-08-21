using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ServicesController : ControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentTenantService _tenantService;

    public ServicesController(IApplicationDbContext context, ICurrentTenantService tenantService)
    {
        _context = context;
        _tenantService = tenantService;
    }

    [HttpGet]
    [Authorize(Policy = "hotel_service.read")]
    public async Task<ActionResult<List<HotelServiceDto>>> GetServices([FromQuery] Guid? hotelId)
    {
        if (!HasScope(hotelId)) return Forbid();
        var services = await _context.HotelServices.AsNoTracking().Where(item => !item.IsDeleted)
            .OrderBy(item => item.NameVi).ToListAsync();
        return Ok(services.Select(ToDto).ToList());
    }

    [HttpPost]
    [Authorize(Policy = "hotel_service.create")]
    public async Task<ActionResult<HotelServiceDto>> Create([FromQuery] Guid? hotelId, [FromBody] SaveHotelServiceRequest request)
    {
        if (!HasScope(hotelId)) return Forbid();
        var error = Validate(request);
        if (error != null) return error;
        var code = request.Code.Trim().ToUpperInvariant();
        if (await _context.HotelServices.AnyAsync(item => item.Code == code && !item.IsDeleted))
            return Conflict(new { message = "Mã dịch vụ đã tồn tại trong cơ sở." });

        var service = new HotelService
        {
            TenantId = _tenantService.TenantId!.Value, Code = code, NameVi = request.NameVi.Trim(),
            NameEn = request.NameEn?.Trim(), Price = request.Price,
            DescriptionVi = request.DescriptionVi?.Trim(), DescriptionEn = request.DescriptionEn?.Trim(),
            IsActive = !string.Equals(request.Status, "INACTIVE", StringComparison.OrdinalIgnoreCase)
        };
        _context.HotelServices.Add(service);
        await _context.SaveChangesAsync();
        return Ok(ToDto(service));
    }

    [HttpPut("{serviceId:guid}")]
    [Authorize(Policy = "hotel_service.update")]
    public async Task<ActionResult<HotelServiceDto>> Update(Guid serviceId, [FromBody] SaveHotelServiceRequest request)
    {
        var error = Validate(request);
        if (error != null) return error;
        var service = await _context.HotelServices.FirstOrDefaultAsync(item => item.Id == serviceId && !item.IsDeleted);
        if (service == null) return NotFound(new { message = "Không tìm thấy dịch vụ." });
        var code = request.Code.Trim().ToUpperInvariant();
        if (await _context.HotelServices.AnyAsync(item => item.Id != serviceId && item.Code == code && !item.IsDeleted))
            return Conflict(new { message = "Mã dịch vụ đã tồn tại trong cơ sở." });

        service.Code = code;
        service.NameVi = request.NameVi.Trim();
        service.NameEn = request.NameEn?.Trim();
        service.Price = request.Price;
        service.DescriptionVi = request.DescriptionVi?.Trim();
        service.DescriptionEn = request.DescriptionEn?.Trim();
        service.IsActive = !string.Equals(request.Status, "INACTIVE", StringComparison.OrdinalIgnoreCase);
        await _context.SaveChangesAsync();
        return Ok(ToDto(service));
    }

    [HttpDelete("{serviceId:guid}")]
    [Authorize(Policy = "hotel_service.delete")]
    public async Task<IActionResult> Delete(Guid serviceId)
    {
        var service = await _context.HotelServices.FirstOrDefaultAsync(item => item.Id == serviceId && !item.IsDeleted);
        if (service == null) return NotFound(new { message = "Không tìm thấy dịch vụ." });
        service.IsDeleted = true;
        service.IsActive = false;
        await _context.SaveChangesAsync();
        return NoContent();
    }

    private bool HasScope(Guid? hotelId) => _tenantService.TenantId.HasValue &&
        (!hotelId.HasValue || hotelId == _tenantService.TenantId);

    private static ObjectResult? Validate(SaveHotelServiceRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || string.IsNullOrWhiteSpace(request.NameVi))
            return new BadRequestObjectResult(new { message = "Mã và tên dịch vụ là bắt buộc." });
        if (request.Price <= 0)
            return new BadRequestObjectResult(new { message = "Giá dịch vụ phải lớn hơn 0." });
        return null;
    }

    private static HotelServiceDto ToDto(HotelService service) => new(
        service.Id, service.TenantId, service.Code, service.NameVi, service.NameEn,
        service.Price, service.DescriptionVi, service.DescriptionEn,
        service.IsActive ? "ACTIVE" : "INACTIVE", false, service.CreatedAtUtc);
}

public record SaveHotelServiceRequest(string Code, string NameVi, string? NameEn, decimal Price,
    string? DescriptionVi, string? DescriptionEn, string? Status);
public record HotelServiceDto(Guid Id, Guid HotelId, string Code, string NameVi, string? NameEn,
    decimal Price, string? DescriptionVi, string? DescriptionEn, string Status,
    bool SystemService, DateTime CreatedAt);
