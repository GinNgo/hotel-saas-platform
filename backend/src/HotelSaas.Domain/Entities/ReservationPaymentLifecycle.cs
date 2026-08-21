using HotelSaas.Domain.Enums;

namespace HotelSaas.Domain.Entities;

public static class ReservationPaymentLifecycle
{
    public static readonly TimeSpan PaymentWindow = TimeSpan.FromMinutes(15);

    public static bool ExpireIfOverdue(Reservation reservation, DateTime nowUtc)
    {
        if (reservation.Status != ReservationStatus.PendingPayment ||
            reservation.CreatedAtUtc.Add(PaymentWindow) > nowUtc)
            return false;

        reservation.Status = ReservationStatus.Cancelled;
        reservation.CancellationReasonCode = "PAYMENT_TIMEOUT";
        reservation.CancellationReason = "Quá hạn thanh toán 15 phút";
        reservation.CancelledAtUtc ??= nowUtc;
        foreach (var payment in reservation.Payments.Where(item => item.Status == PaymentStatus.Pending))
            payment.Status = PaymentStatus.Expired;
        return true;
    }
}
