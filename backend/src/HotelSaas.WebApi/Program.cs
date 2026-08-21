using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Infrastructure;
using HotelSaas.WebApi.Data;
using HotelSaas.WebApi.Middlewares;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Threading.RateLimiting;
using HotelSaas.WebApi.Authorization;
using HotelSaas.WebApi.Realtime;

var builder = WebApplication.CreateBuilder(args);

// 1. Add Infrastructure & Multi-Tenant Services
builder.Services.AddInfrastructure(builder.Configuration);

// 2. Add Controllers
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });

// 3. Add Authentication & Authorization
var jwtSecret = builder.Configuration["JwtSettings:Secret"] ?? "SuperSecretKeyForHotelSaasPlatform2026!@#$%LongEnough";
var jwtIssuer = builder.Configuration["JwtSettings:Issuer"] ?? "HotelSaasApi";
var jwtAudience = builder.Configuration["JwtSettings:Audience"] ?? "HotelSaasClient";

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtIssuer,
        ValidAudience = jwtAudience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddSingleton<IAuthorizationHandler, PermissionAuthorizationHandler>();
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("reservation.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("RESERVATION", 1)));
    options.AddPolicy("reservation.create", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("RESERVATION", 2)));
    options.AddPolicy("reservation.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("RESERVATION", 4)));
    options.AddPolicy("reservation.assign", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("RESERVATION_ASSIGNMENT", 64)));
    options.AddPolicy("reservation.checkin", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("CHECKIN", 64)));
    options.AddPolicy("reservation.checkout", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("CHECKOUT", 64)));
    options.AddPolicy("reservation.cancel", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("RESERVATION_CANCEL", 64)));
    options.AddPolicy("reservation.no_show", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("RESERVATION_NO_SHOW", 64)));
    options.AddPolicy("housekeeping.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("HOUSEKEEPING", 1)));
    options.AddPolicy("housekeeping.create", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("HOUSEKEEPING", 2)));
    options.AddPolicy("housekeeping.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("HOUSEKEEPING", 4)));
    options.AddPolicy("housekeeping.delete", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("HOUSEKEEPING", 8)));
    options.AddPolicy("housekeeping.execute", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("HOUSEKEEPING", 64)));
    options.AddPolicy("user.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("USER", 1)));
    options.AddPolicy("user.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("USER", 4)));
    options.AddPolicy("role.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROLE", 1)));
    options.AddPolicy("role.create", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROLE", 2)));
    options.AddPolicy("role.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROLE", 4)));
    options.AddPolicy("role.delete", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROLE", 8)));
    options.AddPolicy("role_permission.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROLE_PERMISSION", 1)));
    options.AddPolicy("role_permission.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROLE_PERMISSION", 4)));
    options.AddPolicy("room.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROOM", 1)));
    options.AddPolicy("room.create", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROOM", 2)));
    options.AddPolicy("room.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROOM", 4)));
    options.AddPolicy("room.delete", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROOM", 8)));
    options.AddPolicy("room.execute", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROOM", 64)));
    options.AddPolicy("room_type.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROOM_TYPE", 1)));
    options.AddPolicy("room_type.create", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROOM_TYPE", 2)));
    options.AddPolicy("room_type.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROOM_TYPE", 4)));
    options.AddPolicy("room_type.delete", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("ROOM_TYPE", 8)));
    options.AddPolicy("hotel_service.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("HOTEL_SERVICE", 1)));
    options.AddPolicy("hotel_service.create", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("HOTEL_SERVICE", 2)));
    options.AddPolicy("hotel_service.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("HOTEL_SERVICE", 4)));
    options.AddPolicy("hotel_service.delete", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("HOTEL_SERVICE", 8)));
    options.AddPolicy("operational_task.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("OPERATIONAL_TASK", 1)));
    options.AddPolicy("operational_task.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("OPERATIONAL_TASK", 4)));
    options.AddPolicy("operational_task.execute", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("OPERATIONAL_TASK", 64)));
    options.AddPolicy("invoice.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("INVOICE", 1)));
    options.AddPolicy("invoice.execute", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("INVOICE", 64)));
    options.AddPolicy("property_refund.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PROPERTY_REFUND", 1)));
    options.AddPolicy("property_refund.approve", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PROPERTY_REFUND", 32)));
    options.AddPolicy("property_refund.execute", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PROPERTY_REFUND", 64)));
    options.AddPolicy("report.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("REPORT", 1)));
    options.AddPolicy("report.export", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("REPORT", 16)));
    options.AddPolicy("system.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("SYSTEM", 1)));
    options.AddPolicy("system.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("SYSTEM", 4)));
    options.AddPolicy("ai_chat.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("AI_CHAT", 1)));
    options.AddPolicy("ai_chat.create", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("AI_CHAT", 2)));
    options.AddPolicy("ai_chat.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("AI_CHAT", 4)));
    options.AddPolicy("finance.create", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("FINANCE", 2)));
    options.AddPolicy("checkout.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("CHECKOUT", 1)));
    options.AddPolicy("checkout.approve", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("CHECKOUT", 32)));
    options.AddPolicy("checkout.execute", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("CHECKOUT", 64)));
    options.AddPolicy("hotel.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("HOTEL", 1)));
    options.AddPolicy("hotel.create", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("HOTEL", 2)));
    options.AddPolicy("hotel.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("HOTEL", 4)));
    options.AddPolicy("hotel.approve", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("HOTEL", 32)));
    options.AddPolicy("property_claim.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PROPERTY_CLAIM", 1)));
    options.AddPolicy("property_claim.approve", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PROPERTY_CLAIM", 32)));
    options.AddPolicy("payment_config.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PROPERTY_PAYMENT_CONFIG", 1)));
    options.AddPolicy("payment_config.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PROPERTY_PAYMENT_CONFIG", 4)));
    options.AddPolicy("payment_config.execute", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PROPERTY_PAYMENT_CONFIG", 64)));
    options.AddPolicy("platform_billing.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PLATFORM_BILLING", 1)));
    options.AddPolicy("platform_billing.create", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PLATFORM_BILLING", 2)));
    options.AddPolicy("platform_billing.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PLATFORM_BILLING", 4)));
    options.AddPolicy("platform_billing.execute", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PLATFORM_BILLING", 64)));
    options.AddPolicy("audit_log.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("AUDIT_LOG", 1)));
    options.AddPolicy("audit_log.execute", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("AUDIT_LOG", 64)));
    options.AddPolicy("reservation_payment.execute", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("RESERVATION_PAYMENT", 64)));
    options.AddPolicy("payment_readiness.read", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PAYMENT_READINESS", 1)));
    options.AddPolicy("payment_readiness.update", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PAYMENT_READINESS", 4)));
    options.AddPolicy("payment_readiness.execute", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PAYMENT_READINESS", 64)));
    options.AddPolicy("payment_readiness.approve", policy => policy.RequireAuthenticatedUser().AddRequirements(new PermissionRequirement("PAYMENT_READINESS", 32)));
});
builder.Services.AddRateLimiter(options =>
{
    static string ClientKey(HttpContext context) => context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    static RateLimitPartition<string> Fixed(HttpContext context, int permitLimit, TimeSpan window) =>
        RateLimitPartition.GetFixedWindowLimiter(ClientKey(context), _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = permitLimit,
            Window = window,
            QueueLimit = 0,
            AutoReplenishment = true
        });

    options.AddPolicy("guest-booking-access", context => Fixed(context, 20, TimeSpan.FromMinutes(1)));
    options.AddPolicy("guest-booking-recovery", context => Fixed(context, 5, TimeSpan.FromMinutes(1)));
    options.AddPolicy("booking-hold", context => Fixed(context, 12, TimeSpan.FromMinutes(1)));
    options.AddPolicy("booking-submit", context => Fixed(context, 10, TimeSpan.FromMinutes(1)));
    options.AddPolicy("payment-session", context => Fixed(context, 12, TimeSpan.FromMinutes(1)));
    options.AddPolicy("confirmation-email", context => Fixed(context, 3, TimeSpan.FromMinutes(1)));
    options.AddPolicy("ai-concierge", context => Fixed(context, 20, TimeSpan.FromMinutes(1)));
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.Headers.RetryAfter = "60";
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            code = "RATE_LIMITED",
            message = "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút."
        }, cancellationToken);
    };
});

// 4. Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("http://localhost:4200", "https://localhost:4200")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// 5. Add Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR();
builder.Services.AddScoped<IReservationRealtimePublisher, ReservationRealtimePublisher>();

var app = builder.Build();

// 6. Seed Database on Startup
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<IApplicationDbContext>();
    var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
    await DbInitializer.SeedAsync(context, passwordHasher);
}

// 7. Middlewares Pipeline
app.UseMiddleware<GlobalExceptionMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Hotel SaaS Platform API v1");
        c.RoutePrefix = string.Empty;
    });
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseRateLimiter();
// Tenant scope depends on the authenticated JWT claims and must run after authentication.
app.UseMiddleware<TenantResolutionMiddleware>();
app.UseAuthorization();
app.UseMiddleware<OperationalAuditMiddleware>();
app.UseMiddleware<RoomStatusRealtimeMiddleware>();

app.MapControllers();
app.MapHub<RoomStatusHub>("/hubs/room-status");

app.Run();
