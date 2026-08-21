using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Data;

public static class DbInitializer
{
    public static async Task SeedAsync(IApplicationDbContext context, IPasswordHasher passwordHasher)
    {
        var db = (DbContext)context;
        await db.Database.EnsureCreatedAsync();

        await SeedRbacAsync(context);

        if (await context.Users.IgnoreQueryFilters().AnyAsync()) return;

        // 1. Seed SuperAdmin & Customer
        var superAdmin = new User
        {
            Username = "superadmin",
            Email = "superadmin@hotelsaas.vn",
            FullName = "Quản Trị Viên Nền Tảng",
            GlobalRole = GlobalUserRole.SuperAdmin,
            PasswordHash = passwordHasher.HashPassword("SuperAdmin@123"),
            IsActive = true
        };

        var customer = new User
        {
            Username = "customer",
            Email = "customer@gmail.com",
            FullName = "Nguyễn Khách Hàng VIP",
            GlobalRole = GlobalUserRole.Customer,
            PasswordHash = passwordHasher.HashPassword("Customer@123"),
            IsActive = true
        };

        context.Users.AddRange(superAdmin, customer);

        // 2. Seed Khách sạn A (Gói PRO)
        var hotelA = new Tenant
        {
            Name = "Khách sạn LuxeStay Sài Gòn",
            Code = "KS-LXS-SG",
            Slug = "luxestay-saigon",
            Address = "123 Lê Lợi, Phường Bến Thành, Quận 1",
            City = "Hồ Chí Minh",
            PhoneNumber = "02838221234",
            Email = "contact@luxestaysaigon.vn",
            SubscriptionTier = SubscriptionTier.Pro,
            Status = TenantStatus.Active
        };

        var hotelAOwner = new User
        {
            Username = "manager_hotel_a",
            Email = "owner@luxestaysaigon.vn",
            FullName = "Trần Quản Lý KS A",
            GlobalRole = GlobalUserRole.TenantStaff,
            Tenant = hotelA,
            PasswordHash = passwordHasher.HashPassword("Owner@123"),
            IsActive = true
        };

        var hotelAStaff = new TenantStaff
        {
            Tenant = hotelA,
            User = hotelAOwner,
            Role = StaffRole.Owner,
            IsActive = true
        };

        var standardTypeA = new RoomType
        {
            Tenant = hotelA,
            Name = "Phòng Deluxe City View",
            Code = "DLX-CV",
            BasePricePerNight = 1200000,
            CapacityAdults = 2,
            CapacityChildren = 1,
            AreaSquareMeters = 35,
            BedType = "1 Giường King"
        };

        var room101 = new Room { Tenant = hotelA, RoomType = standardTypeA, RoomNumber = "101", Floor = 1, Status = RoomStatus.Clean };
        var room102 = new Room { Tenant = hotelA, RoomType = standardTypeA, RoomNumber = "102", Floor = 1, Status = RoomStatus.Clean };

        context.Tenants.Add(hotelA);
        context.Users.Add(hotelAOwner);
        context.TenantStaffs.Add(hotelAStaff);
        context.RoomTypes.Add(standardTypeA);
        context.Rooms.AddRange(room101, room102);

        // 3. Seed Khách sạn B (Gói BASIC)
        var hotelB = new Tenant
        {
            Name = "Homestay Biển Đà Nẵng",
            Code = "HS-DANANG",
            Slug = "homestay-bien-da-nang",
            Address = "45 Võ Nguyên Giáp, Sơn Trà",
            City = "Đà Nẵng",
            PhoneNumber = "02363889900",
            Email = "booking@homestaydanang.vn",
            SubscriptionTier = SubscriptionTier.Basic,
            Status = TenantStatus.Active
        };

        var hotelBOwner = new User
        {
            Username = "manager_hotel_b",
            Email = "owner@homestaydanang.vn",
            FullName = "Lê Chủ Nhà Đà Nẵng",
            GlobalRole = GlobalUserRole.TenantStaff,
            Tenant = hotelB,
            PasswordHash = passwordHasher.HashPassword("Owner@123"),
            IsActive = true
        };

        var hotelBStaff = new TenantStaff
        {
            Tenant = hotelB,
            User = hotelBOwner,
            Role = StaffRole.Owner,
            IsActive = true
        };

        var standardTypeB = new RoomType
        {
            Tenant = hotelB,
            Name = "Phòng Standard View Biển",
            Code = "STD-SEA",
            BasePricePerNight = 600000,
            CapacityAdults = 2,
            CapacityChildren = 0,
            AreaSquareMeters = 25,
            BedType = "1 Giường Queen"
        };

        var roomB201 = new Room { Tenant = hotelB, RoomType = standardTypeB, RoomNumber = "201", Floor = 2, Status = RoomStatus.Clean };

        context.Tenants.Add(hotelB);
        context.Users.Add(hotelBOwner);
        context.TenantStaffs.Add(hotelBStaff);
        context.RoomTypes.Add(standardTypeB);
        context.Rooms.Add(roomB201);

        // Public-search demo property used by local/E2E journeys.
        var oceanPearl = new Tenant
        {
            Name = "Ocean Pearl",
            Code = "HS-OCEAN-PEARL",
            Slug = "ocean-pearl",
            Address = "21 Đường Vườn Xanh, Mỹ Tho",
            City = "Tiền Giang",
            PhoneNumber = "02733889900",
            Email = "booking@oceanpearl.vn",
            SubscriptionTier = SubscriptionTier.Basic,
            Status = TenantStatus.Active,
            PropertyType = "HOTEL",
            StarRating = 4,
            Latitude = 10.3600,
            Longitude = 106.3650
        };
        var oceanType = new RoomType
        {
            Tenant = oceanPearl,
            Name = "Deluxe Garden View",
            Code = "DLX-GARDEN",
            BasePricePerNight = 850000,
            CapacityAdults = 2,
            CapacityChildren = 1,
            AreaSquareMeters = 32,
            BedType = "1 Giường King"
        };
        var oceanRoom = new Room { Tenant = oceanPearl, RoomType = oceanType, RoomNumber = "301", Floor = 3, Status = RoomStatus.Clean };
        context.Tenants.Add(oceanPearl);
        context.RoomTypes.Add(oceanType);
        context.Rooms.Add(oceanRoom);

        await context.SaveChangesAsync();
    }

    private static async Task SeedRbacAsync(IApplicationDbContext context)
    {
        var functionCodes = new[] { "SYSTEM", "HOTEL", "HOTEL_SERVICE", "BOOKING", "FINANCE", "RESERVATION_PAYMENT", "AI", "USER", "ROLE", "ROLE_PERMISSION", "ROOM", "ROOM_TYPE", "RESERVATION", "RESERVATION_ASSIGNMENT", "RESERVATION_CANCEL", "RESERVATION_NO_SHOW", "CHECKIN", "CHECKOUT", "HOUSEKEEPING", "OPERATIONAL_TASK", "INVOICE", "REPORT", "AI_CHAT", "CUSTOMER", "PROPERTY_CLAIM", "PROPERTY_PAYMENT_CONFIG", "PROPERTY_REFUND", "PLATFORM_REFUND", "PLATFORM_BILLING", "PLATFORM_REVENUE", "PAYMENT_READINESS", "AUDIT_LOG" };
        var functions = await context.PermissionFunctions.IgnoreQueryFilters().ToListAsync();
        foreach (var code in functionCodes.Where(code => functions.All(item => item.Code != code)))
        {
            var function = new PermissionFunction { Code = code, Name = code, ModuleCode = code.Split('_')[0], SupportedActionMask = 127 };
            functions.Add(function);
            context.PermissionFunctions.Add(function);
        }

        var roles = await context.AccessRoles.IgnoreQueryFilters().ToListAsync();
        foreach (var role in new[] { ("SUPERADMIN", "Super Admin"), ("OWNER", "Chủ cơ sở"), ("MANAGER", "Quản lý"), ("RECEPTIONIST", "Lễ tân"), ("HOUSEKEEPER", "Buồng phòng") })
        {
            if (roles.All(item => item.Code != role.Item1))
            {
                var accessRole = new AccessRole { Code = role.Item1, Name = role.Item2, IsSystemRole = true };
                roles.Add(accessRole);
                context.AccessRoles.Add(accessRole);
            }
        }
        await context.SaveChangesAsync();

        var permissions = await context.RolePermissions.IgnoreQueryFilters().ToListAsync();
        var allFunctions = await context.PermissionFunctions.IgnoreQueryFilters().ToListAsync();
        foreach (var role in roles)
        foreach (var function in allFunctions)
            if (permissions.All(item => item.RoleId != role.Id || item.FunctionId != function.Id))
            {
                var permission = new RolePermission { RoleId = role.Id, FunctionId = function.Id, ActionMask = role.Code == "HOUSEKEEPER" ? 69 : role.Code == "RECEPTIONIST" ? 71 : 127 };
                permissions.Add(permission);
                context.RolePermissions.Add(permission);
            }
        await context.SaveChangesAsync();
    }
}
