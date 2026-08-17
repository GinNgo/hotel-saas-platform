using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PaymentsController : ControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly IVnPayService _vnPayService;

    public PaymentsController(IApplicationDbContext context, IVnPayService vnPayService)
    {
        _context = context;
        _vnPayService = vnPayService;
    }

    [HttpPost("vnpay-url/{reservationId:guid}")]
    public async Task<ActionResult<Result<string>>> CreateVnPayUrl(Guid reservationId)
    {
        var reservation = await _context.Reservations
            .IgnoreQueryFilters()
            .Include(r => r.Tenant)
            .FirstOrDefaultAsync(r => r.Id == reservationId);

        if (reservation == null) return NotFound(Result<string>.Failure("Không tìm thấy đơn đặt phòng."));

        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
        var customTmn = reservation.Tenant?.CustomVnPayTmnCode;
        var customSec = reservation.Tenant?.CustomVnPayHashSecret;

        var url = _vnPayService.CreatePaymentUrl(reservation.Id, reservation.BookingCode, reservation.TotalAmount, $"Thanh toan {reservation.BookingCode}", ip, customTmn, customSec);
        return Ok(Result<string>.Success(url));
    }

    [HttpGet("vnpay-callback")]
    public async Task<IActionResult> VnPayCallback()
    {
        var dict = Request.Query.ToDictionary(q => q.Key, q => q.Value.ToString());
        var (isSuccess, txnNo, respCode) = _vnPayService.ProcessIpn(dict);

        var txnRef = dict.GetValueOrDefault("vnp_TxnRef", string.Empty);
        var bookingCode = txnRef.Split('_').FirstOrDefault();

        if (!string.IsNullOrEmpty(bookingCode))
        {
            var res = await _context.Reservations
                .IgnoreQueryFilters()
                .Include(r => r.Folio)
                .FirstOrDefaultAsync(r => r.BookingCode == bookingCode);

            if (res != null && isSuccess && res.Status == ReservationStatus.PendingPayment)
            {
                res.Status = ReservationStatus.Confirmed;
                res.DepositAmount = res.TotalAmount;

                var pay = new Payment
                {
                    TenantId = res.TenantId,
                    ReservationId = res.Id,
                    Amount = res.TotalAmount,
                    Method = PaymentMethod.VNPay,
                    Status = PaymentStatus.Completed,
                    TransactionReference = txnNo,
                    PaidAtUtc = DateTime.UtcNow
                };
                _context.Payments.Add(pay);

                if (res.Folio != null)
                {
                    res.Folio.TotalCredits += res.TotalAmount;
                }
                await _context.SaveChangesAsync();
            }
        }

        return Redirect($"http://localhost:4200/booking/success?bookingCode={bookingCode}&status={(isSuccess ? "success" : "failed")}");
    }
}
