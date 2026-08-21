using HotelSaas.Application.Common.Models;
using HotelSaas.Application.DTOs.Reservations;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using HotelSaas.Infrastructure.Persistence;
using HotelSaas.Infrastructure.Services;
using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public sealed class RoomDateLockConcurrencyTests
{
    [Fact]
    public async Task Two_hold_requests_for_one_room_produce_exactly_one_winner()
    {
        var databasePath = Path.Combine(Path.GetTempPath(), $"hotel-hold-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<ApplicationDbContext>()
                .UseSqlite($"Data Source={databasePath};Default Timeout=10").Options;
            Guid tenantId;
            Guid roomTypeId;
            await using (var setup = new ApplicationDbContext(options, new CurrentTenantService()))
            {
                await setup.Database.EnsureCreatedAsync();
                var tenant = new Tenant
                {
                    Name = "Concurrency Hotel", Code = $"LOCK-{Guid.NewGuid():N}", Slug = $"lock-{Guid.NewGuid():N}",
                    Address = "Test", City = "Da Nang", Status = TenantStatus.Active
                };
                var roomType = new RoomType
                {
                    TenantId = tenant.Id, Tenant = tenant, Code = "DLX", Name = "Deluxe",
                    BasePricePerNight = 1_000_000, IsActive = true, CapacityAdults = 2,
                    Rooms = { new Room { TenantId = tenant.Id, RoomNumber = "101", Status = RoomStatus.Clean } }
                };
                setup.AddRange(tenant, roomType);
                await setup.SaveChangesAsync();
                tenantId = tenant.Id;
                roomTypeId = roomType.Id;
            }

            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var request = new CreateBookingHoldRequestDto(tenantId, roomTypeId, today.AddDays(1), today.AddDays(3), 1);
            await using var firstDb = new ApplicationDbContext(options, new CurrentTenantService());
            await using var secondDb = new ApplicationDbContext(options, new CurrentTenantService());
            var first = new ReservationsController(firstDb).CreateBookingHold(request, "concurrent-hold-a");
            var second = new ReservationsController(secondDb).CreateBookingHold(request, "concurrent-hold-b");

            var responses = await Task.WhenAll(first, second);

            Assert.Single(responses, item => item.Result is OkObjectResult);
            Assert.Single(responses, item => item.Result is ConflictObjectResult);
            await using var verify = new ApplicationDbContext(options, new CurrentTenantService());
            Assert.Single(await verify.BookingHolds.IgnoreQueryFilters().ToListAsync());
            Assert.Equal(2, await verify.RoomDateLocks.IgnoreQueryFilters().CountAsync());
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            if (File.Exists(databasePath)) File.Delete(databasePath);
        }
    }
}
