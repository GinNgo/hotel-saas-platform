using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/room-types")]
[Authorize]
public sealed class RoomTypesController(IApplicationDbContext context) : ControllerBase
{
    private static readonly HashSet<string> AllowedAmenities = new(StringComparer.OrdinalIgnoreCase)
        { "AIR_CONDITIONING", "PRIVATE_BATHROOM", "BATHTUB", "BALCONY", "CITY_VIEW", "SEA_VIEW", "MINIBAR", "TV", "SAFE", "WORK_DESK", "SOUNDPROOF", "KITCHEN" };

    [HttpGet]
    [Authorize(Policy = "room_type.read")]
    public async Task<ActionResult<List<AdminRoomTypeDto>>> List([FromQuery] bool includeDeleted = false)
    {
        IQueryable<RoomType> query = context.RoomTypes.IgnoreQueryFilters().AsNoTracking().Where(item => includeDeleted || !item.IsDeleted)
            .Include(item => item.Tenant).Include(item => item.Images).Include(item => item.Amenities).Include(item => item.Rooms);
        if (!User.IsInRole("SuperAdmin"))
        {
            if (!TenantId(out var tenantId)) return Forbid();
            query = query.Where(item => item.TenantId == tenantId);
        }
        return Ok((await query.OrderBy(item => item.Name).ToListAsync()).Select(ToDto).ToList());
    }

    [HttpGet("paged")]
    [Authorize(Policy = "room_type.read")]
    public async Task<ActionResult<PagedRoomTypeResponse>> Paged([FromQuery] RoomTypeQuery queryOptions)
    {
        var query = context.RoomTypes.IgnoreQueryFilters().AsNoTracking().Where(item => queryOptions.IncludeDeleted || !item.IsDeleted);
        if (!User.IsInRole("SuperAdmin")) { if (!TenantId(out var tenantId)) return Forbid(); query = query.Where(item => item.TenantId == tenantId); }
        if (queryOptions.PropertyId.HasValue) query = query.Where(item => item.TenantId == queryOptions.PropertyId.Value);
        if (!string.IsNullOrWhiteSpace(queryOptions.Search)) query = query.Where(item => item.Name.Contains(queryOptions.Search) || item.Code.Contains(queryOptions.Search));
        if (!string.IsNullOrWhiteSpace(queryOptions.Status)) query = query.Where(item => queryOptions.Status == "DELETED" ? item.IsDeleted : !item.IsDeleted && (queryOptions.Status == "ACTIVE" ? item.IsActive : !item.IsActive));
        query = queryOptions.SortDirection?.Equals("DESC", StringComparison.OrdinalIgnoreCase) == true ? query.OrderByDescending(item => item.Name) : query.OrderBy(item => item.Name);
        var page = Math.Max(1, queryOptions.Page); var size = Math.Clamp(queryOptions.PageSize, 1, 100); var total = await query.CountAsync();
        var items = await query.Skip((page - 1) * size).Take(size).Include(item => item.Images).Include(item => item.Amenities).Include(item => item.Rooms).ToListAsync();
        return Ok(new PagedRoomTypeResponse(items.Select(ToDto).ToList(), page, size, total, (int)Math.Ceiling(total / (double)size)));
    }

    [HttpPost]
    [Authorize(Policy = "room_type.create")]
    public async Task<ActionResult<AdminRoomTypeDto>> Create([FromBody] SaveAdminRoomTypeRequest request)
    {
        if (!CanAccess(request.HotelId)) return Forbid();
        var validation = Validate(request);
        if (validation is not null) return BadRequest(new { message = validation });
        var tenant = await context.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == request.HotelId && !item.IsDeleted);
        if (tenant is null) return NotFound(new { message = "Không tìm thấy cơ sở lưu trú." });
        var code = request.Code!.Trim().ToUpperInvariant();
        if (await context.RoomTypes.IgnoreQueryFilters().AnyAsync(item => item.TenantId == tenant.Id && item.Code == code && !item.IsDeleted))
            return Conflict(new { message = "Mã loại phòng đã tồn tại trong cơ sở." });

        var roomType = new RoomType { TenantId = tenant.Id, Tenant = tenant, Code = code };
        Apply(roomType, request);
        context.RoomTypes.Add(roomType);
        await context.SaveChangesAsync();
        return CreatedAtAction(nameof(List), new { id = roomType.Id }, ToDto(roomType));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "room_type.update")]
    public async Task<ActionResult<AdminRoomTypeDto>> Update(Guid id, [FromBody] SaveAdminRoomTypeRequest request)
    {
        var roomType = await context.RoomTypes.IgnoreQueryFilters().Include(item => item.Tenant).Include(item => item.Images)
            .Include(item => item.Amenities).Include(item => item.Rooms).FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
        if (roomType is null) return NotFound(new { message = "Không tìm thấy loại phòng." });
        if (!CanAccess(roomType.TenantId) || request.HotelId != roomType.TenantId) return Forbid();
        var validation = Validate(request);
        if (validation is not null) return BadRequest(new { message = validation });
        var code = request.Code!.Trim().ToUpperInvariant();
        if (await context.RoomTypes.IgnoreQueryFilters().AnyAsync(item => item.Id != id && item.TenantId == roomType.TenantId && item.Code == code && !item.IsDeleted))
            return Conflict(new { message = "Mã loại phòng đã tồn tại trong cơ sở." });
        roomType.Code = code;
        ApplyScalars(roomType, request);
        SyncAmenities(roomType, request.AmenityCodes);
        SyncImages(roomType, request.ImageUrls);
        await context.SaveChangesAsync();
        return Ok(ToDto(roomType));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "room_type.delete")]
    public async Task<IActionResult> Deactivate(Guid id)
    {
        var roomType = await context.RoomTypes.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
        if (roomType is null) return NotFound();
        if (!CanAccess(roomType.TenantId)) return Forbid();
        if (await context.ReservationDetails.IgnoreQueryFilters().AnyAsync(detail => detail.RoomTypeId == id && detail.Reservation != null && detail.Reservation.CheckInDate >= DateOnly.FromDateTime(DateTime.UtcNow) && detail.Reservation.Status != ReservationStatus.Cancelled))
            return Conflict(new { message = "Không thể xóa loại phòng còn đặt phòng trong tương lai." });
        roomType.IsActive = false;
        roomType.IsDeleted = true;
        await context.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/restore")]
    [Authorize(Policy = "room_type.update")]
    public async Task<ActionResult<AdminRoomTypeDto>> Restore(Guid id)
    {
        var roomType = await context.RoomTypes.IgnoreQueryFilters().Include(item => item.Images).Include(item => item.Amenities).Include(item => item.Rooms).FirstOrDefaultAsync(item => item.Id == id && item.IsDeleted);
        if (roomType is null) return NotFound();
        if (!CanAccess(roomType.TenantId)) return Forbid();
        if (await context.RoomTypes.IgnoreQueryFilters().AnyAsync(item => item.Id != id && item.TenantId == roomType.TenantId && item.Code == roomType.Code && !item.IsDeleted))
            return Conflict(new { message = "Mã loại phòng đã được sử dụng." });
        roomType.IsDeleted = false;
        roomType.IsActive = true;
        await context.SaveChangesAsync();
        return Ok(ToDto(roomType));
    }

    [HttpPost("{id:guid}/images")]
    [HttpPost("/api/media/room-types/{id:guid}")]
    [Authorize(Policy = "room_type.update")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<ActionResult<RoomTypeImageDto>> UploadImage(Guid id, IFormFile file, [FromForm] string? altText = null)
    {
        var roomType = await context.RoomTypes.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted);
        if (roomType is null) return NotFound();
        if (!CanAccess(roomType.TenantId)) return Forbid();
        if (file is null || file.Length <= 0 || file.Length > 5 * 1024 * 1024) return BadRequest(new { message = "Ảnh phải có dung lượng từ 1 byte đến 5 MB." });
        await using var input = file.OpenReadStream();
        using var memory = new MemoryStream();
        await input.CopyToAsync(memory);
        if (!ImageHeader.TryRead(memory.ToArray(), out var metadata) || !string.Equals(file.ContentType, metadata.ContentType, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Tệp ảnh không hợp lệ." });
        if (await context.RoomImages.IgnoreQueryFilters().CountAsync(image => image.RoomTypeId == id && !image.IsDeleted) >= 20)
            return Conflict(new { message = "Mỗi loại phòng tối đa 20 ảnh." });
        var webRoot = HttpContext.RequestServices.GetRequiredService<IWebHostEnvironment>().WebRootPath ?? Path.Combine(AppContext.BaseDirectory, "wwwroot");
        var relativeDirectory = Path.Combine("uploads", "room-types", id.ToString("N"));
        var directory = Path.Combine(webRoot, relativeDirectory);
        Directory.CreateDirectory(directory);
        var name = $"{Guid.NewGuid():N}{metadata.Extension}";
        await System.IO.File.WriteAllBytesAsync(Path.Combine(directory, name), memory.ToArray());
        var thumbnailName = $"{Path.GetFileNameWithoutExtension(name)}-thumb{metadata.Extension}";
        await CreateThumbnailAsync(memory.ToArray(), Path.Combine(directory, thumbnailName), metadata.ContentType);
        var url = "/" + Path.Combine(relativeDirectory, name).Replace('\\', '/');
        var thumbnailUrl = "/" + Path.Combine(relativeDirectory, thumbnailName).Replace('\\', '/');
        var order = await context.RoomImages.IgnoreQueryFilters().Where(image => image.RoomTypeId == id && !image.IsDeleted).Select(image => (int?)image.DisplayOrder).MaxAsync() ?? -1;
        var entity = new RoomImage { TenantId = roomType.TenantId, RoomTypeId = id, ImageUrl = url, AltText = Clean(altText), DisplayOrder = order + 1 };
        context.RoomImages.Add(entity);
        await context.SaveChangesAsync();
        return Ok(new RoomTypeImageDto(entity.Id, entity.ImageUrl, thumbnailUrl, entity.DisplayOrder, entity.AltText, entity.DisplayOrder == 0));
    }

    private static async Task CreateThumbnailAsync(byte[] bytes, string destination, string contentType)
    {
        using var input = new MemoryStream(bytes);
        using var image = await Image.LoadAsync(input);
        image.Mutate(context => context.Resize(new ResizeOptions { Mode = ResizeMode.Max, Size = new Size(640, 640) }));
        await using var output = System.IO.File.Create(destination);
        if (contentType == "image/png") await image.SaveAsync(output, new PngEncoder { CompressionLevel = PngCompressionLevel.BestCompression });
        else if (contentType == "image/webp") await image.SaveAsync(output, new WebpEncoder { Quality = 78 });
        else await image.SaveAsync(output, new JpegEncoder { Quality = 78 });
    }

    [HttpDelete("{id:guid}/images/{imageId:guid}")]
    [HttpDelete("/api/media/room-types/{id:guid}/{imageId:guid}")]
    [Authorize(Policy = "room_type.update")]
    public async Task<IActionResult> DeleteImage(Guid id, Guid imageId)
    {
        var image = await context.RoomImages.IgnoreQueryFilters().Include(item => item.RoomType).FirstOrDefaultAsync(item => item.Id == imageId && item.RoomTypeId == id && !item.IsDeleted);
        if (image is null) return NotFound();
        if (!CanAccess(image.TenantId)) return Forbid();
        image.IsDeleted = true;
        await context.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("{id:guid}/images/{imageId:guid}")]
    [HttpPut("/api/media/room-types/{id:guid}/{imageId:guid}")]
    [Authorize(Policy = "room_type.update")]
    public async Task<ActionResult<RoomTypeImageDto>> UpdateImage(Guid id, Guid imageId, [FromBody] UpdateRoomTypeImageRequest request)
    {
        var image = await context.RoomImages.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == imageId && item.RoomTypeId == id && !item.IsDeleted);
        if (image is null) return NotFound();
        if (!CanAccess(image.TenantId)) return Forbid();
        if (request.AltText?.Trim().Length > 255) return BadRequest(new { message = "Mô tả ảnh tối đa 255 ký tự." });
        image.AltText = Clean(request.AltText);
        await context.SaveChangesAsync();
        return Ok(new RoomTypeImageDto(image.Id, image.ImageUrl, ThumbnailUrl(image.ImageUrl), image.DisplayOrder, image.AltText, image.DisplayOrder == 0));
    }

    [HttpPut("{id:guid}/images/order")]
    [HttpPut("/api/media/room-types/{id:guid}/order")]
    [Authorize(Policy = "room_type.update")]
    public async Task<IActionResult> OrderImages(Guid id, [FromBody] IReadOnlyList<Guid> imageIds)
    {
        var roomType = await context.RoomTypes.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == id);
        if (roomType is null) return NotFound();
        if (!CanAccess(roomType.TenantId)) return Forbid();
        var images = await context.RoomImages.IgnoreQueryFilters().Where(item => item.RoomTypeId == id && !item.IsDeleted).ToListAsync();
        if (imageIds.Count != images.Count || imageIds.Distinct().Count() != imageIds.Count || imageIds.Any(item => images.All(image => image.Id != item)))
            return BadRequest(new { message = "Danh sách thứ tự ảnh không hợp lệ." });
        for (var index = 0; index < imageIds.Count; index++) images.Single(image => image.Id == imageIds[index]).DisplayOrder = index;
        await context.SaveChangesAsync();
        return NoContent();
    }

    private static string? Validate(SaveAdminRoomTypeRequest request)
    {
        if (request.HotelId == Guid.Empty || string.IsNullOrWhiteSpace(request.Code) || request.Code.Trim().Length > 50) return "Cơ sở và mã loại phòng là bắt buộc.";
        if (string.IsNullOrWhiteSpace(request.NameVi) || request.NameVi.Trim().Length > 255) return "Tên loại phòng không hợp lệ.";
        if (request.BasePrice < 0 || request.MaxAdults < 1 || request.MaxChildren < 0 || request.MaxGuests < request.MaxAdults || request.BedCount < 1 || request.Area < 0) return "Giá, giường, diện tích hoặc sức chứa không hợp lệ.";
        if (request.FreeCancellationHours is < 0 or > 720) return "Thời hạn hủy miễn phí phải từ 0 đến 720 giờ.";
        if ((request.AmenityCodes ?? []).Any(code => !AllowedAmenities.Contains(code.Trim()))) return "Danh sách tiện nghi phòng có mã không hợp lệ.";
        if ((request.ImageUrls ?? []).Any(url => string.IsNullOrWhiteSpace(url) || url.Trim().Length > 1000)) return "Danh sách ảnh loại phòng không hợp lệ.";
        return null;
    }

    private void Apply(RoomType roomType, SaveAdminRoomTypeRequest request)
    {
        ApplyScalars(roomType, request);
        SyncAmenities(roomType, request.AmenityCodes);
        SyncImages(roomType, request.ImageUrls);
    }

    private static void ApplyScalars(RoomType roomType, SaveAdminRoomTypeRequest request)
    {
        roomType.Name = request.NameVi!.Trim(); roomType.NameEn = Clean(request.NameEn);
        roomType.Description = Clean(request.DescriptionVi); roomType.DescriptionEn = Clean(request.DescriptionEn);
        roomType.BedType = Clean(request.BedType); roomType.BedCount = request.BedCount; roomType.AreaSquareMeters = request.Area;
        roomType.CapacityAdults = request.MaxAdults; roomType.CapacityChildren = request.MaxChildren;
        roomType.BasePricePerNight = request.BasePrice; roomType.IsActive = !string.Equals(request.Status, "INACTIVE", StringComparison.OrdinalIgnoreCase);
        roomType.IncludesBreakfast = request.IncludesBreakfast; roomType.IsRefundable = request.IsRefundable;
        roomType.FreeCancellationHours = request.IsRefundable ? request.FreeCancellationHours : 0; roomType.SmokingAllowed = request.SmokingAllowed;

    }

    private void SyncAmenities(RoomType roomType, IReadOnlyList<string>? amenityCodes)
    {
        var requestedAmenities = (amenityCodes ?? []).Select(code => code.Trim().ToUpperInvariant()).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var item in roomType.Amenities.Where(item => !requestedAmenities.Contains(item.Code)).ToList())
            context.RoomTypeAmenities.Remove(item);
        foreach (var code in requestedAmenities.Where(code => roomType.Amenities.All(item => !item.Code.Equals(code, StringComparison.OrdinalIgnoreCase))))
        {
            var amenity = new RoomTypeAmenity { TenantId = roomType.TenantId, RoomTypeId = roomType.Id, Code = code };
            context.RoomTypeAmenities.Add(amenity);
        }
    }

    private void SyncImages(RoomType roomType, IReadOnlyList<string>? imageUrls)
    {
        var requestedUrls = (imageUrls ?? []).Select(url => url.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        foreach (var image in roomType.Images.Where(image => !requestedUrls.Contains(image.ImageUrl, StringComparer.OrdinalIgnoreCase)).ToList())
            context.RoomImages.Remove(image);

        for (var order = 0; order < requestedUrls.Count; order++)
        {
            var url = requestedUrls[order];
            var existing = roomType.Images.FirstOrDefault(image => image.ImageUrl.Equals(url, StringComparison.OrdinalIgnoreCase));
            if (existing is not null)
                existing.DisplayOrder = order;
            else
            {
                var image = new RoomImage { TenantId = roomType.TenantId, RoomTypeId = roomType.Id, ImageUrl = url, DisplayOrder = order };
                context.RoomImages.Add(image);
            }
        }
    }

    private bool CanAccess(Guid tenantId) => User.IsInRole("SuperAdmin") || TenantId(out var scopedTenantId) && scopedTenantId == tenantId;
    private bool TenantId(out Guid tenantId) => Guid.TryParse(User.FindFirstValue("tenant_id"), out tenantId);
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string ThumbnailUrl(string url)
    {
        var extension = Path.GetExtension(url);
        return string.IsNullOrWhiteSpace(extension) ? url : url[..^extension.Length] + "-thumb" + extension;
    }
    private static AdminRoomTypeDto ToDto(RoomType item) => new(item.Id, item.TenantId, item.Code, item.Name, item.NameEn,
        item.Description, item.DescriptionEn, item.BedType, item.BedCount, item.AreaSquareMeters, item.CapacityAdults,
        item.CapacityChildren, item.CapacityAdults + item.CapacityChildren, item.BasePricePerNight, item.IsDeleted ? "DELETED" : item.IsActive ? "ACTIVE" : "INACTIVE",
        item.Rooms.Count(room => !room.IsDeleted), item.Images.Where(image => !image.IsDeleted).OrderBy(image => image.DisplayOrder).Select(image => image.ImageUrl).ToList(),
        item.IncludesBreakfast, item.IsRefundable, item.FreeCancellationHours, item.SmokingAllowed,
        item.Amenities.Where(amenity => !amenity.IsDeleted).Select(amenity => amenity.Code).OrderBy(code => code).ToList(),
        item.Images.Where(image => !image.IsDeleted).OrderBy(image => image.DisplayOrder).Select(image => new RoomTypeImageDto(image.Id, image.ImageUrl, ThumbnailUrl(image.ImageUrl), image.DisplayOrder, image.AltText, image.DisplayOrder == 0)).ToList());
}

public sealed record SaveAdminRoomTypeRequest(Guid HotelId, string? Code, string? NameVi, string? NameEn, string? DescriptionVi,
    string? DescriptionEn, string? BedType, int BedCount, double Area, int MaxAdults, int MaxChildren, int MaxGuests,
    decimal BasePrice, string? Status, IReadOnlyList<string>? ImageUrls = null, bool IncludesBreakfast = false,
    bool IsRefundable = true, int FreeCancellationHours = 24, bool SmokingAllowed = false, IReadOnlyList<string>? AmenityCodes = null);
public sealed record AdminRoomTypeDto(Guid Id, Guid HotelId, string Code, string NameVi, string? NameEn, string? DescriptionVi,
    string? DescriptionEn, string? BedType, int BedCount, double Area, int MaxAdults, int MaxChildren, int MaxGuests,
    decimal BasePrice, string Status, int TotalRooms, List<string> ImageUrls, bool IncludesBreakfast, bool IsRefundable,
    int FreeCancellationHours, bool SmokingAllowed, List<string> AmenityCodes, List<RoomTypeImageDto>? Images = null);
public sealed record RoomTypeImageDto(Guid Id, string Url, string ThumbnailUrl, int DisplayOrder, string? AltText, bool IsPrimary);
public sealed record UpdateRoomTypeImageRequest(string? AltText);
public sealed record RoomTypeQuery(string? Search = null, Guid? PropertyId = null, string? Status = null, int Page = 1, int PageSize = 20, string? SortBy = "nameVi", string? SortDirection = "ASC", bool IncludeDeleted = false);
public sealed record PagedRoomTypeResponse(List<AdminRoomTypeDto> Items, int Page, int PageSize, int TotalItems, int TotalPages);
