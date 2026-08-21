using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Customer")]
public class FavoritesController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<FavoritePropertyDto>>> List()
    {
        if (!CustomerId(out var customerId)) return Unauthorized();
        var favorites = await context.FavoriteProperties.IgnoreQueryFilters()
            .Where(item => item.UserId == customerId && !item.IsDeleted && item.Tenant != null &&
                !item.Tenant.IsDeleted && item.Tenant.Status == TenantStatus.Active)
            .Include(item => item.Tenant!).ThenInclude(tenant => tenant.RoomTypes).ThenInclude(type => type.Images)
            .OrderByDescending(item => item.CreatedAtUtc).ToListAsync();
        var tenantIds = favorites.Select(item => item.TenantId).ToList();
        var ratings = await context.PropertyReviews.AsNoTracking().Where(item => tenantIds.Contains(item.TenantId) && item.IsPublished && !item.IsDeleted)
            .GroupBy(item => item.TenantId).Select(group => new { TenantId = group.Key, Score = group.Average(item => item.Score), Count = group.Count() }).ToDictionaryAsync(item => item.TenantId);
        return Ok(favorites.Select(item => ToDto(item, ratings.GetValueOrDefault(item.TenantId)?.Score, ratings.GetValueOrDefault(item.TenantId)?.Count ?? 0)).ToList());
    }

    [HttpPost("{propertyId:guid}")]
    public async Task<ActionResult<FavoritePropertyDto>> Add(Guid propertyId)
    {
        if (!CustomerId(out var customerId)) return Unauthorized();
        var tenant = await context.Tenants.IgnoreQueryFilters().Include(item => item.RoomTypes).ThenInclude(type => type.Images)
            .FirstOrDefaultAsync(item => item.Id == propertyId && !item.IsDeleted && item.Status == TenantStatus.Active);
        if (tenant is null) return NotFound(new { message = "Chỗ nghỉ không còn hiển thị." });
        var favorite = await context.FavoriteProperties.IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.UserId == customerId && item.TenantId == propertyId);
        if (favorite is null)
        {
            favorite = new FavoriteProperty { UserId = customerId, TenantId = propertyId, Tenant = tenant };
            context.FavoriteProperties.Add(favorite);
        }
        else
        {
            favorite.IsDeleted = false;
            favorite.UpdatedAtUtc = DateTime.UtcNow;
            favorite.Tenant = tenant;
        }
        await context.SaveChangesAsync();
        var rating = await context.PropertyReviews.AsNoTracking().Where(item => item.TenantId == propertyId && item.IsPublished && !item.IsDeleted)
            .GroupBy(_ => 1).Select(group => new { Score = group.Average(item => item.Score), Count = group.Count() }).FirstOrDefaultAsync();
        return Ok(ToDto(favorite, rating?.Score, rating?.Count ?? 0));
    }

    [HttpDelete("{propertyId:guid}")]
    public async Task<IActionResult> Remove(Guid propertyId)
    {
        if (!CustomerId(out var customerId)) return Unauthorized();
        var favorite = await context.FavoriteProperties.IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.UserId == customerId && item.TenantId == propertyId && !item.IsDeleted);
        if (favorite is null) return NoContent();
        favorite.IsDeleted = true;
        favorite.UpdatedAtUtc = DateTime.UtcNow;
        await context.SaveChangesAsync();
        return NoContent();
    }

    private bool CustomerId(out Guid customerId) => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out customerId);

    private static FavoritePropertyDto ToDto(FavoriteProperty favorite, double? rating, int reviewCount)
    {
        var tenant = favorite.Tenant!;
        var activeTypes = tenant.RoomTypes.Where(type => type.IsActive && !type.IsDeleted).ToList();
        var image = activeTypes.SelectMany(type => type.Images).OrderBy(item => item.DisplayOrder).Select(item => item.ImageUrl).FirstOrDefault();
        return new(favorite.Id, tenant.Id, tenant.Name, tenant.Slug, tenant.Address, tenant.City,
            image ?? tenant.LogoUrl, tenant.PropertyType, rating, reviewCount, activeTypes.Count == 0 ? null : activeTypes.Min(type => type.BasePricePerNight),
            favorite.CreatedAtUtc);
    }
}

public sealed record FavoritePropertyDto(Guid FavoriteId, Guid HotelId, string Name, string Slug, string AddressLine,
    string City, string? ImageUrl, string PropertyType, double? AverageRating, int ReviewCount, decimal? MinPrice,
    DateTime FavoritedAt);
