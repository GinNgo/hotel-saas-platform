using HotelSaas.WebApi.Controllers;
using Microsoft.AspNetCore.RateLimiting;
using System.Reflection;
using Xunit;

namespace HotelSaas.WebApi.Tests;

public class RateLimitingPolicyTests
{
    [Theory]
    [InlineData(typeof(ReservationsController), nameof(ReservationsController.Book), "booking-submit")]
    [InlineData(typeof(ReservationsController), nameof(ReservationsController.CreateBookingHold), "booking-hold")]
    [InlineData(typeof(ReservationsController), nameof(ReservationsController.ReleaseBookingHold), "booking-hold")]
    [InlineData(typeof(ReservationsController), nameof(ReservationsController.GuestBooking), "guest-booking-access")]
    [InlineData(typeof(ReservationsController), nameof(ReservationsController.CancelGuestBooking), "guest-booking-access")]
    [InlineData(typeof(ReservationsController), nameof(ReservationsController.RecoverGuestBooking), "guest-booking-recovery")]
    [InlineData(typeof(ReservationsController), nameof(ReservationsController.ResendGuestConfirmationEmail), "confirmation-email")]
    [InlineData(typeof(ReservationsController), nameof(ReservationsController.ResendMineConfirmationEmail), "confirmation-email")]
    [InlineData(typeof(PaymentsController), nameof(PaymentsController.CreateSession), "payment-session")]
    [InlineData(typeof(PaymentsController), nameof(PaymentsController.GetActiveSession), "payment-session")]
    public void Anonymous_conversion_endpoints_use_the_expected_rate_limit_policy(
        Type controllerType, string methodName, string expectedPolicy)
    {
        var method = controllerType.GetMethod(methodName, BindingFlags.Instance | BindingFlags.Public);
        var attribute = method?.GetCustomAttribute<EnableRateLimitingAttribute>();

        Assert.NotNull(attribute);
        Assert.Equal(expectedPolicy, attribute.PolicyName);
    }
}
