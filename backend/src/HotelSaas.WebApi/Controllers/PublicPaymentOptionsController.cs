using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/public/properties/{propertyId:guid}/payment-options")]
[AllowAnonymous]
public class PublicPaymentOptionsController : ControllerBase
{
    private readonly IApplicationDbContext _context;

    public PublicPaymentOptionsController(IApplicationDbContext context) => _context = context;

    [HttpGet]
    public async Task<ActionResult<List<PublicPaymentOptionDto>>> Get(Guid propertyId)
    {
        var propertyExists = await _context.Tenants.IgnoreQueryFilters()
            .AnyAsync(item => item.Id == propertyId && !item.IsDeleted && item.Status == TenantStatus.Active);
        if (!propertyExists) return NotFound(new { message = "Không tìm thấy cơ sở." });

        var configuration = await _context.PropertyPaymentConfigurations.IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.TenantId == propertyId && !item.IsDeleted);
        return Ok(PropertyPaymentOptionPolicy.Available(configuration));
    }
}

public record PublicPaymentOptionDto(string Code, string Provider, bool RequiresPrepayment);
