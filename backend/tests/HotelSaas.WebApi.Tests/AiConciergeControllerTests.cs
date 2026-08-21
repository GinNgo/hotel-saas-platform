using System.Text;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class AiConciergeControllerTests
{
    [Fact]
    public void Customer_concierge_returns_truthful_booking_guidance()
    {
        var controller = Controller();

        var result = controller.CustomerChat(new("Tôi muốn hủy booking và hoàn tiền"));

        var response = Assert.IsType<AiChatResponse>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Contains("hoàn tiền", response.Reply, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Gemini", response.Reply, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Stream_uses_sse_events_and_a_done_marker()
    {
        var controller = Controller();

        await controller.CustomerChatStream(new("Tìm khách sạn ở đâu"), CancellationToken.None);

        controller.Response.Body.Position = 0;
        using var reader = new StreamReader(controller.Response.Body, Encoding.UTF8);
        var body = await reader.ReadToEndAsync();
        Assert.Equal("text/event-stream; charset=utf-8", controller.Response.ContentType);
        Assert.Contains("event: message", body);
        Assert.Contains("event: done\ndata:[DONE]", body);
    }

    [Fact]
    public void Rejects_oversized_or_untrusted_history_payloads()
    {
        var controller = Controller();
        var history = Enumerable.Range(0, 11).Select(_ => new AiChatHistoryItem("user", "hello")).ToList();

        var result = controller.CustomerChat(new("hello", history));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public void Tool_authorization_denies_missing_permission()
    {
        var controller = Controller();

        var result = controller.AuthorizeTool("pricing.update", new(null, true));

        var response = Assert.IsType<AiToolAuthorizationResult>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.False(response.Allowed);
        Assert.Equal("PERMISSION_DENIED", response.DenialCode);
    }

    [Fact]
    public void Tool_authorization_requires_confirmation_and_enforces_property_scope()
    {
        var controller = Controller(
            new Claim("permission", "room_rate.update:1"),
            new Claim("assigned_property_id", "property-a"));

        var needsConfirmation = controller.AuthorizeTool("pricing.update", new("property-a", false));
        var confirmationResponse = Assert.IsType<AiToolAuthorizationResult>(Assert.IsType<OkObjectResult>(needsConfirmation.Result).Value);
        Assert.False(confirmationResponse.Allowed);
        Assert.True(confirmationResponse.ConfirmationRequired);
        Assert.Equal("CONFIRMATION_REQUIRED", confirmationResponse.DenialCode);

        var wrongProperty = controller.AuthorizeTool("pricing.update", new("property-b", true));
        var scopeResponse = Assert.IsType<AiToolAuthorizationResult>(Assert.IsType<OkObjectResult>(wrongProperty.Result).Value);
        Assert.False(scopeResponse.Allowed);
        Assert.Equal("TENANT_SCOPE_DENIED", scopeResponse.DenialCode);
    }

    [Fact]
    public void Platform_tool_requires_admin_role_even_with_permission()
    {
        var staff = Controller(new Claim("permission", "role_permission.update:1"));
        var denied = staff.AuthorizeTool("rbac.update", new(null, true));
        Assert.Equal("TENANT_SCOPE_DENIED", Assert.IsType<AiToolAuthorizationResult>(Assert.IsType<OkObjectResult>(denied.Result).Value).DenialCode);

        var admin = Controller(new Claim("permission", "role_permission.update:1"), new Claim(ClaimTypes.Role, "SUPER_ADMIN"));
        var allowed = admin.AuthorizeTool("rbac.update", new(null, true));
        Assert.True(Assert.IsType<AiToolAuthorizationResult>(Assert.IsType<OkObjectResult>(allowed.Result).Value).Allowed);
    }

    private static AiConciergeController Controller(params Claim[] claims)
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();
        context.User = new ClaimsPrincipal(new ClaimsIdentity(claims, "test"));
        return new AiConciergeController
        {
            ControllerContext = new ControllerContext { HttpContext = context }
        };
    }
}
