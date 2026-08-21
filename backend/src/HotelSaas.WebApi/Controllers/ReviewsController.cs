using System.Security.Claims;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
public sealed class ReviewsController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet("api/public/properties/{propertyId:guid}/reviews")]
    [AllowAnonymous]
    public async Task<ActionResult<object>> List(Guid propertyId, [FromQuery] int pageNumber = 1, [FromQuery] int pageSize = 10)
    {
        pageNumber = Math.Max(1, pageNumber); pageSize = Math.Clamp(pageSize, 1, 50);
        var query = context.PropertyReviews.AsNoTracking().Where(item => item.TenantId == propertyId && item.IsPublished && !item.IsDeleted);
        var total = await query.CountAsync();
        var summary = total == 0 ? null : await query.GroupBy(_ => 1).Select(group => new { Score = group.Average(item => item.Score), Cleanliness = group.Average(item => item.CleanlinessScore), Service = group.Average(item => item.ServiceScore), Location = group.Average(item => item.LocationScore), Value = group.Average(item => item.ValueScore) }).FirstAsync();
        var rows = await query.OrderByDescending(item => item.CreatedAtUtc).Skip((pageNumber - 1) * pageSize).Take(pageSize)
            .Select(item => new { item.Id, item.Score, item.CleanlinessScore, item.ServiceScore, item.LocationScore, item.ValueScore, item.Title, item.Comment,
                ReviewerName = context.Users.IgnoreQueryFilters().Where(user => user.Id == item.UserId).Select(user => user.FullName).FirstOrDefault(),
                StayedAt = context.Reservations.IgnoreQueryFilters().Where(reservation => reservation.Id == item.ReservationId).Select(reservation => (DateOnly?)reservation.CheckOutDate).FirstOrDefault(),
                CreatedAt = item.CreatedAtUtc, VerifiedStay = true }).ToListAsync();
        return Ok(new { Content = rows, TotalElements = total, TotalPages = total == 0 ? 0 : (int)Math.Ceiling(total / (double)pageSize), PageNumber = pageNumber, PageSize = pageSize, Summary = summary });
    }

    [HttpPost("api/reservations/{reservationId:guid}/review")]
    [Authorize(Roles = "Customer")]
    public async Task<ActionResult<object>> Submit(Guid reservationId, [FromBody] SubmitReviewRequest request)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Unauthorized();
        var validation = Validate(request); if (validation is not null) return BadRequest(new { message = validation });
        var reservation = await context.Reservations.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == reservationId && item.CustomerUserId == userId && !item.IsDeleted);
        if (reservation is null) return NotFound(new { message = "Không tìm thấy kỳ lưu trú thuộc tài khoản này." });
        if (reservation.Status != ReservationStatus.CheckedOut || reservation.CheckOutDate > DateOnly.FromDateTime(DateTime.UtcNow))
            return Conflict(new { message = "Chỉ kỳ lưu trú đã hoàn tất mới có thể đánh giá." });
        var existing = await context.PropertyReviews.FirstOrDefaultAsync(item => item.ReservationId == reservationId && !item.IsDeleted);
        if (existing is not null)
        {
            if (Same(existing, request)) return Ok(ToResponse(existing, true));
            return Conflict(new { message = "Kỳ lưu trú này đã được đánh giá." });
        }
        var review = new PropertyReview { TenantId = reservation.TenantId, ReservationId = reservation.Id, UserId = userId, Score = request.Score, CleanlinessScore = request.CleanlinessScore, ServiceScore = request.ServiceScore, LocationScore = request.LocationScore, ValueScore = request.ValueScore, Title = Clean(request.Title), Comment = request.Comment.Trim(), IsPublished = true };
        context.PropertyReviews.Add(review); await context.SaveChangesAsync(); return Ok(ToResponse(review, false));
    }

    private static string? Validate(SubmitReviewRequest request)
    {
        if (new[] { request.Score, request.CleanlinessScore, request.ServiceScore, request.LocationScore, request.ValueScore }.Any(score => score is < 1 or > 10)) return "Điểm đánh giá phải từ 1 đến 10.";
        if (string.IsNullOrWhiteSpace(request.Comment) || request.Comment.Trim().Length is < 10 or > 2000) return "Nội dung đánh giá phải có từ 10 đến 2000 ký tự.";
        if (request.Title?.Trim().Length > 150) return "Tiêu đề đánh giá tối đa 150 ký tự.";
        return null;
    }
    private static bool Same(PropertyReview item, SubmitReviewRequest request) => item.Score == request.Score && item.CleanlinessScore == request.CleanlinessScore && item.ServiceScore == request.ServiceScore && item.LocationScore == request.LocationScore && item.ValueScore == request.ValueScore && item.Title == Clean(request.Title) && item.Comment == request.Comment.Trim();
    private static object ToResponse(PropertyReview item, bool replayed) => new { item.Id, item.ReservationId, PropertyId = item.TenantId, item.Score, item.CleanlinessScore, item.ServiceScore, item.LocationScore, item.ValueScore, item.Title, item.Comment, item.IsPublished, CreatedAt = item.CreatedAtUtc, Replayed = replayed };
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public sealed record SubmitReviewRequest(int Score, int CleanlinessScore, int ServiceScore, int LocationScore, int ValueScore, string? Title, string Comment);
