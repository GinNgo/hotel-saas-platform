using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.Authorization;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public sealed class ReservationAuthorizationMetadataTests
{
    [Theory]
    [InlineData(nameof(ReservationsController.CreateOperational), "reservation.create")]
    [InlineData(nameof(ReservationsController.GetReservations), "reservation.read")]
    [InlineData(nameof(ReservationsController.UpdateStatus), "reservation.update")]
    [InlineData(nameof(ReservationsController.CheckIn), "reservation.checkin")]
    [InlineData(nameof(ReservationsController.AssignRooms), "reservation.assign")]
    [InlineData(nameof(ReservationsController.CancelOperational), "reservation.cancel")]
    [InlineData(nameof(ReservationsController.MarkNoShow), "reservation.no_show")]
    public void Operational_endpoint_uses_its_exact_permission_policy(string methodName, string expectedPolicy)
    {
        var method = typeof(ReservationsController).GetMethod(methodName);
        Assert.NotNull(method);
        var policies = method!.GetCustomAttributes(typeof(AuthorizeAttribute), true)
            .Cast<AuthorizeAttribute>().Select(attribute => attribute.Policy).ToList();

        Assert.Contains(expectedPolicy, policies);
    }
}
