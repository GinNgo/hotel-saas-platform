using System.Globalization;
using System.Security.Claims;
using System.Text;
using HotelSaas.Application.Common.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/admin/audit-events")]
[Authorize(Policy = "audit_log.read")]
public sealed class OperationalAuditController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<object>> Search([FromQuery] AuditEventFilters filters)
    {
        var query = Filter(filters);
        var page = Math.Max(0, filters.Page ?? 0);
        var size = Math.Clamp(filters.Size ?? 25, 1, 100);
        var total = await query.CountAsync();
        var rows = await query.OrderByDescending(item => item.CreatedAtUtc)
            .Skip(page * size).Take(size).Select(item => new
            {
                item.Id, item.Scope, HotelId = item.TenantId, item.Domain, item.EventType, item.AggregateType,
                item.AggregateId, item.ActorType, item.ActorId, item.Reason, item.BeforeState, item.AfterState,
                item.CorrelationId, OccurredAt = item.CreatedAtUtc, item.StatusCode
            }).ToListAsync();
        return Ok(new { content = rows, totalElements = total, totalPages = (int)Math.Ceiling(total / (double)size), number = page, size });
    }

    [HttpGet("export")]
    [Authorize(Policy = "audit_log.execute")]
    public async Task<IActionResult> Export([FromQuery] AuditEventFilters filters)
    {
        var rows = await Filter(filters).OrderByDescending(item => item.CreatedAtUtc).Take(50_000).ToListAsync();
        var csv = new StringBuilder("Id,Scope,TenantId,Domain,EventType,AggregateType,AggregateId,ActorType,ActorId,Reason,CorrelationId,StatusCode,OccurredAt\r\n");
        foreach (var item in rows)
            csv.AppendLine(string.Join(',', new[]
            {
                Csv(item.Id), Csv(item.Scope), Csv(item.TenantId), Csv(item.Domain), Csv(item.EventType),
                Csv(item.AggregateType), Csv(item.AggregateId), Csv(item.ActorType), Csv(item.ActorId),
                Csv(item.Reason), Csv(item.CorrelationId), Csv(item.StatusCode), Csv(item.CreatedAtUtc.ToString("O", CultureInfo.InvariantCulture))
            }));
        return File(new UTF8Encoding(true).GetBytes(csv.ToString()), "text/csv; charset=utf-8", "operational-audit.csv");
    }

    private IQueryable<Domain.Entities.OperationalAuditEvent> Filter(AuditEventFilters filters)
    {
        var tenantId = Guid.TryParse(User.FindFirstValue("tenant_id"), out var tenant) ? tenant : (Guid?)null;
        var query = context.OperationalAuditEvents.AsNoTracking().Where(item => !item.IsDeleted);
        if (tenantId.HasValue) query = query.Where(item => item.TenantId == tenantId);
        else if (filters.HotelId.HasValue) query = query.Where(item => item.TenantId == filters.HotelId);
        if (!string.IsNullOrWhiteSpace(filters.Scope)) query = query.Where(item => item.Scope == filters.Scope.ToUpper());
        if (!string.IsNullOrWhiteSpace(filters.Domain)) query = query.Where(item => item.Domain == filters.Domain.ToUpper());
        if (!string.IsNullOrWhiteSpace(filters.EventType)) query = query.Where(item => item.EventType.Contains(filters.EventType.ToUpper()));
        if (!string.IsNullOrWhiteSpace(filters.AggregateType)) query = query.Where(item => item.AggregateType == filters.AggregateType.ToUpper());
        if (!string.IsNullOrWhiteSpace(filters.AggregateId)) query = query.Where(item => item.AggregateId == filters.AggregateId);
        if (filters.ActorId.HasValue) query = query.Where(item => item.ActorId == filters.ActorId);
        if (!string.IsNullOrWhiteSpace(filters.CorrelationId)) query = query.Where(item => item.CorrelationId.Contains(filters.CorrelationId));
        if (filters.From.HasValue) query = query.Where(item => item.CreatedAtUtc >= filters.From.Value.ToUniversalTime());
        if (filters.To.HasValue) query = query.Where(item => item.CreatedAtUtc <= filters.To.Value.ToUniversalTime());
        return query;
    }

    private static string Csv(object? value)
    {
        var text = value?.ToString() ?? string.Empty;
        if (text.Length > 0 && "=+-@".Contains(text[0])) text = "'" + text;
        return '"' + text.Replace("\"", "\"\"") + '"';
    }
}

public sealed record AuditEventFilters(string? Scope, Guid? HotelId, string? Domain, string? EventType,
    string? AggregateType, string? AggregateId, Guid? ActorId, string? CorrelationId,
    DateTime? From, DateTime? To, int? Page, int? Size);
