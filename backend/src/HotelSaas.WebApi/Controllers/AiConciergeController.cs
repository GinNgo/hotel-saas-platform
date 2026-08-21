using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;
using System.Text.Json;
using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/ai")]
public sealed class AiConciergeController : ControllerBase
{
    private readonly IApplicationDbContext? context;
    public AiConciergeController() { }
    public AiConciergeController(IApplicationDbContext context) => this.context = context;
    private static readonly IReadOnlyList<AiToolDescriptor> ToolCatalog =
    [
        new("booking.read", "Đọc booking hiện tại", "booking.read", "customer-or-assigned-property", "AI_BOOKING_READ"),
        new("invoice.read", "Đọc hóa đơn", "invoice.read", "customer-or-assigned-property", "AI_INVOICE_READ"),
        new("refund.read", "Đọc trạng thái hoàn tiền", "property_refund.read", "customer-or-assigned-property", "AI_REFUND_READ"),
        new("refund.request", "Tạo yêu cầu hoàn tiền", "property_refund.create", "customer-or-owned-property", "AI_REFUND_REQUEST"),
        new("reservation.checkin", "Check-in/out", "reservation.execute", "assigned-property", "AI_RESERVATION_MUTATION", true),
        new("pricing.update", "Thay đổi giá", "room_rate.update", "assigned-property", "AI_PRICING_MUTATION", true),
        new("rbac.update", "Cấp quyền", "role_permission.update", "platform-admin", "AI_RBAC_MUTATION", true),
    ];

    [HttpGet("tools")]
    [Authorize(Policy = "ai_chat.read")]
    public ActionResult<IReadOnlyList<AiToolDescriptor>> Tools() => Ok(ToolCatalog);

    [HttpPost("tools/{name}/authorize")]
    [Authorize(Policy = "ai_chat.create")]
    public ActionResult<AiToolAuthorizationResult> AuthorizeTool(string name, [FromBody] AiToolAuthorizationRequest request)
    {
        var tool = ToolCatalog.FirstOrDefault(item => item.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
        if (tool is null) return NotFound(new { message = "Không tìm thấy tool." });
        var allowed = User.FindAll("permission").Any(claim =>
        {
            var parts = claim.Value.Split(':', 2, StringSplitOptions.TrimEntries);
            return parts.Length == 2 && parts[0].Equals(tool.RequiredFunction, StringComparison.OrdinalIgnoreCase) && int.TryParse(parts[1], out var mask) && (mask & 1) == 1;
        });
        var scopeAllowed = IsScopeAllowed(tool.Scope, request.PropertyId);
        var confirmationRequired = tool.RequiresConfirmation && !request.Confirmed;
        return Ok(new AiToolAuthorizationResult(tool.Name, allowed && scopeAllowed && !confirmationRequired, confirmationRequired, !scopeAllowed ? "TENANT_SCOPE_DENIED" : !allowed ? "PERMISSION_DENIED" : confirmationRequired ? "CONFIRMATION_REQUIRED" : null));
    }

    [HttpPost("tools/{name}/execute")]
    [Authorize(Policy = "ai_chat.create")]
    public async Task<ActionResult<AiToolExecutionResult>> ExecuteTool(string name, [FromBody] AiToolExecutionRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey) || request.IdempotencyKey.Trim().Length > 100)
            return BadRequest(new { message = "Idempotency key là bắt buộc và tối đa 100 ký tự." });
        var authorization = AuthorizeTool(name, new AiToolAuthorizationRequest(request.PropertyId, request.Confirmed));
        if (authorization.Result is not OkObjectResult { Value: AiToolAuthorizationResult result })
            return BadRequest(new { message = "Không thể xác thực tool." });
        if (!result.Allowed) return StatusCode(StatusCodes.Status403Forbidden, result);
        if (context is null) return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Audit store chưa sẵn sàng." });
        var tool = ToolCatalog.First(item => item.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
        var existing = await context.OperationalTasks.FirstOrDefaultAsync(item => item.IdempotencyKey == request.IdempotencyKey.Trim() && !item.IsDeleted, cancellationToken);
        if (existing is not null)
            return Accepted(new AiToolExecutionResult(tool.Name, "ALREADY_QUEUED", tool.AuditEvent, existing.Id, existing.PublicId));
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var actorId);
        Guid.TryParse(request.PropertyId, out var tenantId);
        Guid? taskId = null;
        if (tool.Scope != "platform-admin" && tenantId != Guid.Empty)
        {
            var task = new OperationalTask
            {
                TenantId = tenantId,
                PublicId = $"AI-{Guid.NewGuid():N}",
                TaskType = "AI_TOOL",
                FunctionCode = tool.RequiredFunction,
                RequiredAction = 1,
                AggregateType = "AiTool",
                AggregateId = Guid.NewGuid(),
                Status = "OPEN",
                Version = 1,
                ResultReference = JsonSerializer.Serialize(new { tool = tool.Name, request.PropertyId, request.ReservationId, request.RoomId, request.AssignedRoomIds, request.ExpectedVersion, payload = SanitizePayload(request.Payload), request.Reason })
                , ToolName = tool.Name, IdempotencyKey = request.IdempotencyKey.Trim()
            };
            context.OperationalTasks.Add(task);
            taskId = task.Id;
        }
        context.OperationalAuditEvents.Add(new OperationalAuditEvent
        {
            TenantId = tenantId == Guid.Empty ? null : tenantId,
            Scope = tool.Scope == "platform-admin" ? "SYSTEM" : "TENANT",
            Domain = "AI",
            EventType = tool.AuditEvent,
            AggregateType = "AiTool",
            AggregateId = tool.Name,
            ActorId = actorId == Guid.Empty ? null : actorId,
            ActorType = "USER",
            Reason = request.Reason?.Trim() ?? "AI tool execution",
            CorrelationId = HttpContext.TraceIdentifier,
            StatusCode = StatusCodes.Status202Accepted
        });
        await context.SaveChangesAsync(cancellationToken);
        return Accepted(new AiToolExecutionResult(tool.Name, taskId.HasValue ? "AUTHORIZED_QUEUED" : "AUTHORIZED_AUDITED", tool.AuditEvent, taskId));
    }

    private bool IsScopeAllowed(string scope, string? propertyId)
    {
        if (scope == "platform-admin")
            return User.FindAll(ClaimTypes.Role).Any(claim =>
                claim.Value.Equals("ADMIN", StringComparison.OrdinalIgnoreCase) ||
                claim.Value.Equals("SUPER_ADMIN", StringComparison.OrdinalIgnoreCase));

        if (propertyId is null) return true;
        return User.FindAll("assigned_property_id").Concat(User.FindAll("active_property_id"))
            .Any(claim => claim.Value.Equals(propertyId, StringComparison.OrdinalIgnoreCase));
    }

    private static object? SanitizePayload(JsonElement? payload)
    {
        if (!payload.HasValue) return null;
        return Sanitize(payload.Value);
    }

    private static object? Sanitize(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            var result = new Dictionary<string, object?>();
            foreach (var property in value.EnumerateObject())
                result[property.Name] = Sensitive(property.Name) ? "[REDACTED]" : Sanitize(property.Value);
            return result;
        }
        if (value.ValueKind == JsonValueKind.Array) return value.EnumerateArray().Select(Sanitize).ToList();
        return value.ValueKind == JsonValueKind.Null ? null : value.ToString();
    }

    private static bool Sensitive(string name) => name.Contains("token", StringComparison.OrdinalIgnoreCase) || name.Contains("secret", StringComparison.OrdinalIgnoreCase) || name.Contains("password", StringComparison.OrdinalIgnoreCase) || name.Contains("card", StringComparison.OrdinalIgnoreCase);

    [HttpPost("chat")]
    [Authorize(Policy = "ai_chat.create")]
    public ActionResult<AiChatResponse> StaffChat([FromBody] AiChatRequest request)
    {
        var error = Validate(request);
        if (error != null) return BadRequest(new { message = error });
        return Ok(new AiChatResponse(Reply(request.Message, true), "LuxeStay nghiệp vụ", DateTime.UtcNow));
    }

    [HttpPost("customer/chat")]
    [AllowAnonymous]
    [EnableRateLimiting("ai-concierge")]
    public ActionResult<AiChatResponse> CustomerChat([FromBody] AiChatRequest request)
    {
        var error = Validate(request);
        if (error != null) return BadRequest(new { message = error });
        return Ok(new AiChatResponse(Reply(request.Message, false), "LuxeStay hướng dẫn", DateTime.UtcNow));
    }

    [HttpPost("customer/chat/stream")]
    [AllowAnonymous]
    [EnableRateLimiting("ai-concierge")]
    public async Task CustomerChatStream([FromBody] AiChatRequest request, CancellationToken cancellationToken)
    {
        var error = Validate(request);
        if (error != null)
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            await Response.WriteAsJsonAsync(new { message = error }, cancellationToken);
            return;
        }

        Response.StatusCode = StatusCodes.Status200OK;
        Response.ContentType = "text/event-stream; charset=utf-8";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers["X-Accel-Buffering"] = "no";
        await Response.WriteAsync($"event: metadata\ndata:{System.Text.Json.JsonSerializer.Serialize(new { source = "LuxeStay hướng dẫn", updatedAtUtc = DateTime.UtcNow })}\n\n", cancellationToken);
        foreach (var chunk in Chunks(Reply(request.Message, false)))
        {
            await Response.WriteAsync($"event: message\ndata:{chunk}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }
        await Response.WriteAsync("event: done\ndata:[DONE]\n\n", cancellationToken);
    }

    private static string? Validate(AiChatRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Message) || request.Message.Trim().Length > 500)
            return "Tin nhắn phải có từ 1 đến 500 ký tự.";
        if (request.History is { Count: > 10 } || request.History?.Any(item =>
                item.Role is not ("user" or "ai") || string.IsNullOrWhiteSpace(item.Text) || item.Text.Length > 1000) == true)
            return "Lịch sử hội thoại không hợp lệ.";
        return null;
    }

    private static string Reply(string message, bool staff)
    {
        var text = message.Trim().ToLowerInvariant();
        if (Contains(text, "hủy", "cancel", "hoàn tiền", "refund"))
            return "Bạn có thể mở Đặt phòng của tôi, chọn booking phù hợp và xem điều kiện hủy hoặc hoàn tiền đã được chốt tại thời điểm đặt. Booking đã thanh toán sẽ hiển thị trạng thái yêu cầu hoàn tiền sau khi hủy.";
        if (Contains(text, "thanh toán", "payment", "vnpay", "chuyển khoản"))
            return "Phương thức thanh toán phụ thuộc cấu hình của từng chỗ nghỉ. Ở bước thanh toán, hệ thống chỉ hiển thị phương thức đang hoạt động; nếu giao dịch còn chờ, hãy dùng nút tiếp tục thanh toán trên booking thay vì tạo đơn mới.";
        if (Contains(text, "đặt phòng", "booking", "check-in", "check in", "nhận phòng"))
            return "Hãy chọn điểm đến, ngày nhận/trả phòng và số khách để tìm phòng. Trước khi xác nhận, bạn sẽ thấy giá phòng, ưu đãi, thuế, phí dịch vụ, chính sách hủy và phương thức thanh toán của chỗ nghỉ.";
        if (Contains(text, "hóa đơn", "invoice", "folio"))
            return staff
                ? "Hóa đơn chỉ nên phát hành từ folio đã đối soát. Hãy kiểm tra room charge, dịch vụ, payment, refund và số dư trước khi checkout hoặc gửi PDF cho khách."
                : "Hóa đơn đã chốt nằm trong mục Hóa đơn của tôi. Nếu booking chưa checkout hoặc còn số dư cần đối soát, hóa đơn cuối cùng có thể chưa được phát hành.";
        if (Contains(text, "phòng", "hotel", "khách sạn", "resort", "villa", "homestay", "ở đâu"))
            return "Tôi có thể giúp bạn chuẩn bị bộ lọc tìm kiếm. Hãy cho biết điểm đến, ngày đi, số khách, số phòng và ngân sách; nút xem phòng phù hợp sẽ dùng dữ liệu tìm kiếm hiện có của LuxeStay.";
        if (Contains(text, "xin chào", "hello", "hi", "chào"))
            return "Xin chào! Tôi là trợ lý hướng dẫn tự động của LuxeStay. Tôi có thể hỗ trợ tìm phòng, quy trình đặt phòng, thanh toán, hủy/hoàn tiền và hóa đơn.";
        return staff
            ? "Tôi là trợ lý hướng dẫn nghiệp vụ, chưa phải mô hình AI sinh nội dung. Bạn có thể hỏi về booking, check-in, thanh toán, folio, hoàn tiền hoặc hóa đơn; dữ liệu cụ thể vẫn cần kiểm tra trên màn hình nghiệp vụ authoritative."
            : "Tôi là trợ lý hướng dẫn tự động, chưa phải mô hình AI sinh nội dung. Bạn có thể hỏi về tìm phòng, đặt phòng, thanh toán, hủy/hoàn tiền hoặc hóa đơn; với booking cụ thể, hãy mở Đặt phòng của tôi hoặc chuyển sang nhân viên hỗ trợ.";
    }

    private static bool Contains(string source, params string[] values) => values.Any(source.Contains);
    private static IEnumerable<string> Chunks(string value)
    {
        var words = value.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        for (var index = 0; index < words.Length; index++)
            yield return (index == 0 ? string.Empty : " ") + words[index];
    }
}

public sealed record AiChatRequest(string Message, List<AiChatHistoryItem>? History = null);
public sealed record AiChatHistoryItem(string Role, string Text);
public sealed record AiChatResponse(string Reply, string Source, DateTime UpdatedAtUtc);
public sealed record AiToolDescriptor(string Name, string Description, string RequiredFunction, string Scope, string AuditEvent, bool RequiresConfirmation = false);
public sealed record AiToolAuthorizationRequest(string? PropertyId = null, bool Confirmed = false);
public sealed record AiToolAuthorizationResult(string ToolName, bool Allowed, bool ConfirmationRequired, string? DenialCode);
public sealed record AiToolExecutionRequest(string? PropertyId = null, bool Confirmed = false, string? Reason = null,
    Guid? ReservationId = null, Guid? RoomId = null, IReadOnlyList<Guid>? AssignedRoomIds = null, int? ExpectedVersion = null,
    JsonElement? Payload = null, string? IdempotencyKey = null);
public sealed record AiToolExecutionResult(string ToolName, string Status, string AuditEvent, Guid? TaskId = null, string? PublicId = null);
