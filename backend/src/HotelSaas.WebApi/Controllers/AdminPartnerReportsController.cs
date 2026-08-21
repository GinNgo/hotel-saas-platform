using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize]
public sealed class AdminPartnerReportsController(IApplicationDbContext context) : ControllerBase
{
    [HttpGet("property-owners")]
    [Authorize(Policy = "user.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> PropertyOwners()
    {
        var owners = await context.TenantStaffs.IgnoreQueryFilters().AsNoTracking()
            .Include(item => item.User).Include(item => item.Tenant).ThenInclude(item => item!.ActiveSubscriptionPlan)
            .Where(item => !item.IsDeleted && item.IsActive && item.Role == StaffRole.Owner && item.User != null && !item.User.IsDeleted && item.Tenant != null && !item.Tenant.IsDeleted)
            .ToListAsync();
        var paidByOwner = await context.PlatformPaymentAttempts.AsNoTracking()
            .Where(item => item.Status == "COMPLETED" && !item.IsDeleted && item.PlatformSubscriptionOrder != null)
            .GroupBy(item => item.PlatformSubscriptionOrder!.OwnerUserId)
            .Select(group => new { UserId = group.Key, Total = group.Sum(item => item.ExpectedAmount) })
            .ToDictionaryAsync(item => item.UserId, item => item.Total);
        var roomsByTenant = await context.Rooms.IgnoreQueryFilters().AsNoTracking()
            .Where(item => !item.IsDeleted && item.IsActive)
            .GroupBy(item => item.TenantId).Select(group => new { TenantId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.TenantId, item => item.Count);

        var rows = owners.GroupBy(item => item.UserId).Select(group =>
        {
            var latest = group.OrderByDescending(item => item.Tenant!.SubscriptionEffectiveFromUtc).First();
            var activePlan = latest.Tenant!.ActiveSubscriptionPlan;
            return new
            {
                UserId = group.Key, FullName = latest.User!.FullName, latest.User.Email,
                AccountStatus = latest.User.IsActive ? "ACTIVE" : "INACTIVE",
                PropertyCount = group.Select(item => item.TenantId).Distinct().Count(),
                RoomCount = group.Sum(item => roomsByTenant.GetValueOrDefault(item.TenantId)),
                PlanCode = activePlan?.Code ?? "NO_PLAN",
                SubscriptionStatus = ActiveSubscription(latest.Tenant) ? "ACTIVE" : "NONE",
                StartAt = latest.Tenant.SubscriptionEffectiveFromUtc, EndAt = latest.Tenant.SubscriptionEffectiveUntilUtc,
                IsLifetime = activePlan?.IsLifetime ?? false,
                PaymentStatus = paidByOwner.ContainsKey(group.Key) ? "PAID" : "UNPAID",
                TotalPaid = paidByOwner.GetValueOrDefault(group.Key)
            };
        }).OrderBy(item => item.FullName).ToList();
        return Ok(rows);
    }

    [HttpGet("property-registrations")]
    [Authorize(Policy = "hotel.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> PropertyRegistrations() => Ok(await OwnerAssignments()
        .Select(item => new
        {
            item.User!.FullName, item.User.Email, NameVi = item.Tenant!.Name, PropertyId = item.TenantId,
            ApprovalStatus = Approval(item.Tenant.Status), OperationStatus = Operation(item.Tenant.Status), RegisteredAt = item.CreatedAtUtc
        }).OrderBy(item => item.RegisteredAt).ToListAsync());

    [HttpGet("property-owners/unsubscribed")]
    [Authorize(Policy = "platform_billing.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> UnsubscribedOwners() => Ok(await OwnerAssignments()
        .Where(item => item.Tenant!.ActiveSubscriptionPlanId == null ||
            (item.Tenant.SubscriptionEffectiveUntilUtc != null && item.Tenant.SubscriptionEffectiveUntilUtc <= DateTime.UtcNow))
        .Select(item => new { UserId = item.UserId, item.User!.FullName, item.User.Email, AccountStatus = item.User.IsActive ? "ACTIVE" : "INACTIVE" })
        .Distinct().OrderBy(item => item.FullName).ToListAsync());

    [HttpGet("property-staff")]
    [Authorize(Policy = "user.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> PropertyStaff() => Ok(await context.TenantStaffs.IgnoreQueryFilters().AsNoTracking()
        .Where(item => !item.IsDeleted && item.User != null && !item.User.IsDeleted && item.Tenant != null && !item.Tenant.IsDeleted)
        .Select(item => new
        {
            item.User!.FullName, item.User.Email, PropertyName = item.Tenant!.Name,
            RelationshipType = item.Role.ToString().ToUpper(), AssignmentStatus = item.IsActive ? "ACTIVE" : "INACTIVE",
            AccountStatus = item.User.IsActive ? "ACTIVE" : "INACTIVE", StartDate = item.CreatedAtUtc, EndDate = (DateTime?)null
        }).OrderBy(item => item.PropertyName).ThenBy(item => item.FullName).ToListAsync());

    [HttpGet("property-room-types")]
    [Authorize(Policy = "room_type.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> PropertyRoomTypes() => Ok(await context.RoomTypes.IgnoreQueryFilters().AsNoTracking()
        .Where(item => !item.IsDeleted && item.Tenant != null && !item.Tenant.IsDeleted)
        .Select(item => new
        {
            item.Id, PropertyName = item.Tenant!.Name, item.Code, NameVi = item.Name, BasePrice = item.BasePricePerNight,
            MaxAdults = item.CapacityAdults, MaxChildren = item.CapacityChildren,
            MaxGuests = item.CapacityAdults + item.CapacityChildren,
            RoomCount = item.Rooms.Count(room => !room.IsDeleted && room.IsActive), Status = item.IsActive ? "ACTIVE" : "INACTIVE"
        }).OrderBy(item => item.PropertyName).ThenBy(item => item.Code).ToListAsync());

    [HttpGet("property-rooms")]
    [Authorize(Policy = "room.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> PropertyRooms() => Ok(await context.Rooms.IgnoreQueryFilters().AsNoTracking()
        .Where(item => !item.IsDeleted && item.Tenant != null && !item.Tenant.IsDeleted && item.RoomType != null && !item.RoomType.IsDeleted)
        .Select(item => new
        {
            item.Id, PropertyName = item.Tenant!.Name, RoomTypeName = item.RoomType!.Name, item.RoomNumber, item.Floor,
            Status = RoomStatusName(item.Status), HousekeepingStatus = HousekeepingStatus(item.Status),
            MaintenanceStatus = item.Status == RoomStatus.OutOfService ? "MAINTENANCE" : "NONE", IsDemo = false
        }).OrderBy(item => item.PropertyName).ThenBy(item => item.RoomNumber).ToListAsync());

    [HttpGet("subscription-orders")]
    [Authorize(Policy = "platform_billing.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> SubscriptionOrders()
    {
        var orders = await context.PlatformSubscriptionOrders.AsNoTracking()
            .Where(item => !item.IsDeleted).OrderByDescending(item => item.CreatedAtUtc).ToListAsync();
        var owners = await UserEmails(orders.Select(item => item.OwnerUserId));
        return Ok(orders.Select(item => (object)new
        {
            item.OrderCode, Email = owners.GetValueOrDefault(item.OwnerUserId, "—"), item.PlanCode,
            BillingType = item.BillingPeriod, TotalAmount = item.Price, item.Currency, item.Status, CreatedAt = item.CreatedAtUtc
        }).ToList());
    }

    [HttpGet("subscription-payments")]
    [Authorize(Policy = "platform_billing.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> SubscriptionPayments()
    {
        var attempts = await context.PlatformPaymentAttempts.AsNoTracking().Include(item => item.PlatformSubscriptionOrder)
            .Where(item => !item.IsDeleted && item.PlatformSubscriptionOrder != null && !item.PlatformSubscriptionOrder.IsDeleted)
            .OrderByDescending(item => item.CreatedAtUtc).ToListAsync();
        var owners = await UserEmails(attempts.Select(item => item.PlatformSubscriptionOrder!.OwnerUserId));
        return Ok(attempts.Select(item => (object)new
        {
            item.PlatformSubscriptionOrder!.OrderCode,
            Email = owners.GetValueOrDefault(item.PlatformSubscriptionOrder.OwnerUserId, "—"),
            PaymentMethod = item.Method, Amount = item.ExpectedAmount, PaymentStatus = item.Status,
            TransactionCode = item.ProviderOrderReference, PaidAt = item.CompletedAtUtc
        }).ToList());
    }

    [HttpGet("software-contracts")]
    [Authorize(Policy = "platform_billing.read")]
    public async Task<ActionResult<IReadOnlyList<object>>> SoftwareContracts()
    {
        var orders = await context.PlatformSubscriptionOrders.AsNoTracking().Include(item => item.SubscriptionPlan)
            .Where(item => !item.IsDeleted && (item.Status == "APPLIED" || item.AppliedAtUtc != null))
            .OrderByDescending(item => item.AppliedAtUtc).ToListAsync();
        var owners = await UserEmails(orders.Select(item => item.OwnerUserId));
        var tenantIds = orders.Select(item => item.TenantId).Distinct().ToList();
        var tenants = await context.Tenants.IgnoreQueryFilters().AsNoTracking()
            .Where(item => tenantIds.Contains(item.Id) && !item.IsDeleted).ToDictionaryAsync(item => item.Id);
        return Ok(orders.Select(item =>
        {
            tenants.TryGetValue(item.TenantId, out var tenant);
            return (object)new
            {
                ContractNo = item.OrderCode, Email = owners.GetValueOrDefault(item.OwnerUserId, "—"),
                PropertyName = tenant?.Name ?? "—", item.PlanCode, ContractType = item.BillingPeriod,
                StartDate = item.AppliedAtUtc ?? item.CreatedAtUtc,
                EndDate = tenant?.SubscriptionEffectiveUntilUtc,
                IsLifetime = item.SubscriptionPlan?.IsLifetime ?? item.DurationUnit == "LIFETIME",
                ContractValue = item.Price,
                Status = tenant != null && ActiveSubscription(tenant) ? "ACTIVE" : "EXPIRED"
            };
        }).ToList());
    }

    private IQueryable<HotelSaas.Domain.Entities.TenantStaff> OwnerAssignments() => context.TenantStaffs.IgnoreQueryFilters().AsNoTracking()
        .Where(item => !item.IsDeleted && item.IsActive && item.Role == StaffRole.Owner && item.User != null && !item.User.IsDeleted && item.Tenant != null && !item.Tenant.IsDeleted);

    private async Task<Dictionary<Guid, string>> UserEmails(IEnumerable<Guid> userIds)
    {
        var ids = userIds.Distinct().ToList();
        return await context.Users.IgnoreQueryFilters().AsNoTracking()
            .Where(item => ids.Contains(item.Id) && !item.IsDeleted)
            .ToDictionaryAsync(item => item.Id, item => item.Email);
    }

    private static bool ActiveSubscription(HotelSaas.Domain.Entities.Tenant tenant) => tenant.ActiveSubscriptionPlanId.HasValue &&
        (!tenant.SubscriptionEffectiveUntilUtc.HasValue || tenant.SubscriptionEffectiveUntilUtc > DateTime.UtcNow);
    private static string Approval(TenantStatus status) => status == TenantStatus.Active ? "APPROVED" : status == TenantStatus.PendingApproval ? "PENDING_APPROVAL" : "REJECTED";
    private static string Operation(TenantStatus status) => status == TenantStatus.Active ? "ACTIVE" : "INACTIVE";
    private static string RoomStatusName(RoomStatus status) => status switch
    {
        RoomStatus.Clean => "AVAILABLE", RoomStatus.Dirty => "DIRTY", RoomStatus.Cleaning => "CLEANING",
        RoomStatus.Occupied => "OCCUPIED", RoomStatus.OutOfService => "OUT_OF_SERVICE", _ => status.ToString().ToUpper()
    };
    private static string HousekeepingStatus(RoomStatus status) => status switch
    {
        RoomStatus.Clean => "CLEAN", RoomStatus.Dirty => "DIRTY", RoomStatus.Cleaning => "CLEANING", _ => "NONE"
    };
}
