using HotelSaas.Application.Common.Interfaces;
using HotelSaas.Application.Common.Models;
using HotelSaas.Application.DTOs.Reservations;
using HotelSaas.Domain.Entities;
using HotelSaas.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Security.Claims;
using System.Text;
using System.Net.Mail;
using System.Net;
using System.Text.Json;

namespace HotelSaas.WebApi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReservationsController : ControllerBase
{
    private readonly IApplicationDbContext _context;
    private readonly IEmailDeliveryService? _emailDelivery;

    public ReservationsController(IApplicationDbContext context, IEmailDeliveryService? emailDelivery = null)
    {
        _context = context;
        _emailDelivery = emailDelivery;
    }

    [HttpPost]
    [Authorize(Policy = "reservation.create")]
    public async Task<ActionResult<OperationalReservationDto>> CreateOperational([FromBody] CreateOperationalReservationRequest request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey = null)
    {
        if (!Guid.TryParse(User.FindFirstValue("tenant_id"), out var tenantId)) return Forbid();
        if (string.IsNullOrWhiteSpace(idempotencyKey) || idempotencyKey.Trim().Length > 120)
            return BadRequest(new { message = "Idempotency-Key là bắt buộc và không được vượt quá 120 ký tự." });
        var requestKey = $"PMS:{tenantId:N}:{idempotencyKey.Trim()}";
        var requestFingerprint = OperationalFingerprint(request, tenantId);
        var replay = await OperationalQuery().IgnoreQueryFilters().FirstOrDefaultAsync(item => item.ClientRequestKey == requestKey);
        var requestedAdults = request.Adults ?? request.Guests;
        var requestedChildren = request.Children ?? 0;
        if (replay is not null)
        {
            var sameRequest = replay.CheckInDate == request.CheckInDate && replay.CheckOutDate == request.CheckOutDate &&
                replay.GuestFullName == request.GuestFullName?.Trim() && replay.GuestPhoneNumber == request.GuestPhoneNumber?.Trim() &&
                replay.TotalAmount == request.ExpectedTotal && replay.AdultCount == requestedAdults && replay.ChildCount == requestedChildren &&
                replay.PaymentMethodSnapshot == ParsePaymentMethod(request.PaymentMethod) && replay.Details.Count == 1 &&
                replay.Details.Single().RoomId == request.RoomId;
            var fingerprintMatches = replay.ClientRequestFingerprint is null ? sameRequest : replay.ClientRequestFingerprint == requestFingerprint;
            return fingerprintMatches ? Ok(ToOperationalDto(replay)) : Conflict(new { message = "Idempotency-Key đã được dùng cho yêu cầu khác." });
        }
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (request.CheckInDate < today || request.CheckInDate >= request.CheckOutDate || requestedAdults < 1 || requestedChildren < 0)
            return BadRequest(new { message = "Ngày lưu trú hoặc số khách không hợp lệ." });
        if (string.IsNullOrWhiteSpace(request.GuestFullName) || string.IsNullOrWhiteSpace(request.GuestPhoneNumber) ||
            request.GuestFullName.Trim().Length > 150 || request.GuestPhoneNumber.Trim().Length > 30 ||
            request.GuestEmail is { Length: > 200 })
            return BadRequest(new { message = "Thông tin khách lưu trú không hợp lệ." });
        if (request.ExpectedTotal < 0) return BadRequest(new { message = "Tổng tiền xác nhận không hợp lệ." });

        var room = await _context.Rooms.IgnoreQueryFilters().Include(item => item.RoomType)
            .FirstOrDefaultAsync(item => item.Id == request.RoomId && item.TenantId == tenantId && item.IsActive && !item.IsDeleted);
        if (room?.RoomType is null || !room.RoomType.IsActive || room.Status == RoomStatus.OutOfService)
            return BadRequest(new { message = "Phòng hoặc loại phòng không còn hoạt động." });
        var tenant = await _context.Tenants.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == tenantId && !item.IsDeleted);
        if (tenant?.Status != TenantStatus.Active) return Conflict(new { message = "Cơ sở lưu trú chưa ở trạng thái hoạt động." });
        if (requestedAdults > room.RoomType.CapacityAdults || requestedChildren > room.RoomType.CapacityChildren)
            return BadRequest(new { message = "Số người lớn hoặc trẻ em vượt quá sức chứa của phòng." });
        var paymentExpiryCutoff = DateTime.UtcNow.AddMinutes(-15);
        var overlaps = await _context.ReservationDetails.IgnoreQueryFilters().AnyAsync(detail => detail.RoomId.HasValue && detail.RoomId.Value == room.Id && detail.Reservation != null &&
            detail.Reservation.Status != ReservationStatus.Cancelled && detail.Reservation.Status != ReservationStatus.NoShow &&
            detail.Reservation.Status != ReservationStatus.CheckedOut &&
            (detail.Reservation.Status != ReservationStatus.PendingPayment || detail.Reservation.CreatedAtUtc > paymentExpiryCutoff) &&
            detail.Reservation.CheckInDate < request.CheckOutDate &&
            detail.Reservation.CheckOutDate > request.CheckInDate);
        if (overlaps) return Conflict(new { message = "Phòng đã có đơn trùng thời gian lưu trú." });
        var reservedForType = await _context.ReservationDetails.IgnoreQueryFilters().CountAsync(detail =>
            detail.TenantId == tenantId && detail.RoomTypeId == room.RoomTypeId && detail.Reservation != null &&
            detail.Reservation.Status != ReservationStatus.Cancelled && detail.Reservation.Status != ReservationStatus.NoShow &&
            detail.Reservation.Status != ReservationStatus.CheckedOut &&
            (detail.Reservation.Status != ReservationStatus.PendingPayment || detail.Reservation.CreatedAtUtc > paymentExpiryCutoff) &&
            detail.Reservation.CheckInDate < request.CheckOutDate &&
            detail.Reservation.CheckOutDate > request.CheckInDate);
        var start = request.CheckInDate.ToDateTime(TimeOnly.MinValue);
        var end = request.CheckOutDate.ToDateTime(TimeOnly.MinValue);
        var heldForType = await _context.BookingHolds.IgnoreQueryFilters().Where(hold => hold.TenantId == tenantId &&
            hold.RoomTypeId == room.RoomTypeId && !hold.IsReleased && !hold.IsConvertedToReservation && hold.ExpiresAtUtc > DateTime.UtcNow &&
            hold.CheckInDate < end && hold.CheckOutDate > start).SumAsync(hold => (int?)hold.Quantity) ?? 0;
        var inventoryForType = await _context.Rooms.IgnoreQueryFilters().CountAsync(item => item.TenantId == tenantId &&
            item.RoomTypeId == room.RoomTypeId && item.IsActive && !item.IsDeleted && item.Status != RoomStatus.OutOfService);
        if (inventoryForType - reservedForType - heldForType < 1)
            return Conflict(new { message = "Hạng phòng vừa hết tồn kho do reservation hoặc hold khác." });

        User? customer = null;
        if (request.UserId.HasValue)
        {
            customer = await _context.Users.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.Id == request.UserId &&
                item.GlobalRole == GlobalUserRole.Customer && item.IsActive && !item.IsDeleted);
            if (customer is null) return BadRequest(new { message = "Tài khoản khách hàng không hợp lệ." });
        }

        var pricing = await PublicPricing.Calculate(_context, room.RoomType, request.CheckInDate, request.CheckOutDate, 1, null);
        var averageNightlyPrice = AverageNightlyPrice(pricing, 1);
        if (request.ExpectedTotal != pricing.FinalTotal)
            return Conflict(new { code = "PRICE_CHANGED", message = "Giá hoặc ưu đãi đã thay đổi. Vui lòng kiểm tra báo giá mới.", currentTotal = pricing.FinalTotal });
        var reservation = new Reservation
        {
            TenantId = tenantId, Tenant = tenant, CustomerUserId = customer?.Id, CustomerUser = customer,
            BookingCode = await NewBookingCode("PMS"),
            GuestFullName = request.GuestFullName.Trim(), GuestEmail = request.GuestEmail?.Trim().ToLowerInvariant() ?? customer?.Email ?? string.Empty,
            GuestPhoneNumber = request.GuestPhoneNumber.Trim(), CheckInDate = request.CheckInDate, CheckOutDate = request.CheckOutDate,
            Status = ReservationStatus.Confirmed, TotalAmount = pricing.FinalTotal, DepositAmount = 0,
            AdultCount = requestedAdults, ChildCount = requestedChildren,
            PaymentMethodSnapshot = ParsePaymentMethod(request.PaymentMethod),
            SpecialRequests = Clean(request.SpecialRequests), ClientRequestKey = requestKey, ClientRequestFingerprint = requestFingerprint,
            IsRefundableSnapshot = room.RoomType.IsRefundable,
            FreeCancellationHoursSnapshot = room.RoomType.IsRefundable ? room.RoomType.FreeCancellationHours : 0,
            CancellationDeadlineUtc = room.RoomType.IsRefundable
                ? CancellationDeadlineUtc(request.CheckInDate, tenant.CheckInTime, room.RoomType.FreeCancellationHours) : null
        };
        var detail = new ReservationDetail
        {
            TenantId = tenantId, RoomTypeId = room.RoomTypeId, RoomType = room.RoomType, RoomId = room.Id, Room = room,
            NightlyPrice = averageNightlyPrice, NumberOfNights = pricing.Nights,
            SubTotal = averageNightlyPrice * pricing.Nights
        };
        reservation.Details.Add(detail);
        reservation.Folio = new Folio
        {
            TenantId = tenantId, FolioNumber = $"FOL-{reservation.BookingCode}", TotalCharges = pricing.FinalTotal,
            Items = { new FolioItem { TenantId = tenantId, ItemType = FolioItemType.RoomCharge,
                Description = $"Tiền phòng {room.RoomNumber} ({pricing.Nights} đêm)", UnitPrice = pricing.BaseSubtotal, Quantity = 1 } }
        };
        if (pricing.Discount > 0)
            reservation.Folio.Items.Add(new FolioItem { TenantId = tenantId, ItemType = FolioItemType.Discount,
                Description = $"Ưu đãi {pricing.Promotions[0].Code}", UnitPrice = -pricing.Discount, Quantity = 1 });
        AddTaxAndFeeItems(reservation.Folio, tenantId, pricing);
        _context.Reservations.Add(reservation);
        await _context.SaveChangesAsync();
        return Ok(ToOperationalDto(reservation));
    }

    [HttpGet("operational-quote")]
    [Authorize(Policy = "reservation.read")]
    public async Task<ActionResult<OperationalQuoteDto>> OperationalQuote([FromQuery] Guid roomId,
        [FromQuery] DateOnly checkIn, [FromQuery] DateOnly checkOut, [FromQuery] int adults = 1, [FromQuery] int children = 0)
    {
        if (!Guid.TryParse(User.FindFirstValue("tenant_id"), out var tenantId)) return Forbid();
        if (checkIn < DateOnly.FromDateTime(DateTime.UtcNow) || checkIn >= checkOut || adults < 1 || children < 0)
            return BadRequest(new { message = "Ngày lưu trú hoặc số khách không hợp lệ." });
        var room = await _context.Rooms.IgnoreQueryFilters().AsNoTracking().Include(item => item.RoomType)
            .FirstOrDefaultAsync(item => item.Id == roomId && item.TenantId == tenantId && item.IsActive && !item.IsDeleted);
        if (room?.RoomType is null || !room.RoomType.IsActive || room.Status == RoomStatus.OutOfService)
            return NotFound(new { message = "Phòng không còn hoạt động." });
        if (adults > room.RoomType.CapacityAdults || children > room.RoomType.CapacityChildren)
            return BadRequest(new { message = "Số người lớn hoặc trẻ em vượt quá sức chứa của phòng." });

        var pricing = await PublicPricing.Calculate(_context, room.RoomType, checkIn, checkOut, 1, null);
        var promotion = pricing.Promotions.FirstOrDefault();
        return Ok(new OperationalQuoteDto(room.Id, room.RoomNumber, room.RoomTypeId, room.RoomType.Name,
            AverageNightlyPrice(pricing, 1), pricing.Nights, pricing.BaseSubtotal, pricing.Discount, pricing.FinalTotal,
            "VND", promotion?.Code, promotion?.NameVi));
    }

    [HttpPost("book")]
    [AllowAnonymous]
    [EnableRateLimiting("booking-submit")]
    public async Task<ActionResult<CustomerBookingDto>> Book(
        [FromBody] CustomerBookingRequest request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey)
    {
        var requestKey = idempotencyKey?.Trim();
        if (requestKey is not { Length: >= 8 and <= 200 })
            return BadRequest(new { message = "Idempotency-Key phải có từ 8 đến 200 ký tự." });
        Guid? customerId = null;
        var principal = HttpContext?.User;
        if (principal?.Identity?.IsAuthenticated == true && principal.IsInRole(nameof(GlobalUserRole.Customer)) &&
            Guid.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var parsedCustomerId)) customerId = parsedCustomerId;
        var contactEmail = (principal?.FindFirstValue(ClaimTypes.Email) ?? request.Email)?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(contactEmail) || contactEmail.Length > 200 ||
            !MailAddress.TryCreate(contactEmail, out var parsedEmail) ||
            !string.Equals(parsedEmail.Address, contactEmail, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Email xác nhận không hợp lệ." });
        var requestFingerprint = CustomerFingerprint(request, customerId, contactEmail);
        if (requestKey != null)
        {
            var existing = await CustomerQuery().IgnoreQueryFilters()
                .FirstOrDefaultAsync(item => item.ClientRequestKey == requestKey);
            if (existing != null)
            {
                if (existing.CustomerUserId != customerId)
                    return Conflict(new { message = "Idempotency key đã được sử dụng cho yêu cầu khác." });
                var replayAdults = Math.Max(1, request.Adults ?? request.Guests);
                var replayChildren = Math.Max(0, request.Children ?? 0);
                var replayGuestName = $"{request.LastName?.Trim()} {request.FirstName?.Trim()}".Trim();
                var sameRequest = existing.CheckInDate == request.CheckInDate && existing.CheckOutDate == request.CheckOutDate &&
                    existing.AdultCount == replayAdults && existing.ChildCount == replayChildren &&
                    existing.GuestFullName == replayGuestName && existing.GuestPhoneNumber == request.Phone?.Trim() &&
                    existing.GuestEmail == contactEmail &&
                    existing.PaymentMethodSnapshot == ParsePaymentMethod(request.PaymentMethod) && existing.Details.Count == request.Quantity &&
                    existing.Details.All(detail => detail.RoomTypeId == request.RoomTypeId);
                var fingerprintMatches = existing.ClientRequestFingerprint is null ? sameRequest : existing.ClientRequestFingerprint == requestFingerprint;
                if (!fingerprintMatches) return Conflict(new { message = "Idempotency key đã được sử dụng cho yêu cầu khác." });
                if (string.IsNullOrWhiteSpace(existing.GuestAccessKey))
                {
                    existing.GuestAccessKey = NewGuestAccessKey();
                    await _context.SaveChangesAsync();
                }
                return Ok(ToCustomerDto(existing, guestAccessKey: existing.GuestAccessKey));
            }
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (request.CheckInDate < today || request.CheckInDate >= request.CheckOutDate)
            return BadRequest(new { message = "Ngày lưu trú không hợp lệ." });
        if (request.Quantity is < 1 or > 10 || request.Guests < 1)
            return BadRequest(new { message = "Số khách hoặc số phòng không hợp lệ." });
        if (string.IsNullOrWhiteSpace(request.FirstName) || string.IsNullOrWhiteSpace(request.LastName) || string.IsNullOrWhiteSpace(request.Phone))
            return BadRequest(new { message = "Vui lòng nhập đầy đủ thông tin khách lưu trú." });

        var roomType = await _context.RoomTypes.IgnoreQueryFilters().Include(type => type.Tenant).Include(type => type.Rooms)
            .FirstOrDefaultAsync(type => type.Id == request.RoomTypeId && type.IsActive && !type.IsDeleted);
        if (roomType?.Tenant?.Status != TenantStatus.Active)
            return NotFound(new { message = "Loại phòng không còn mở bán." });
        var requestedPaymentCode = PropertyPaymentOptionPolicy.NormalizeRequestedCode(request.PaymentMethod);
        if (requestedPaymentCode == null)
            return BadRequest(new { code = "PAYMENT_METHOD_INVALID", message = "Phương thức thanh toán không hợp lệ." });
        var paymentConfiguration = await _context.PropertyPaymentConfigurations.IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.TenantId == roomType.TenantId && !item.IsDeleted);
        var availablePaymentCodes = PropertyPaymentOptionPolicy.Available(paymentConfiguration)
            .Select(option => option.Code).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!availablePaymentCodes.Contains(requestedPaymentCode))
            return Conflict(new { code = "PAYMENT_METHOD_UNAVAILABLE", message = "Phương thức thanh toán đã bị tắt hoặc chưa sẵn sàng. Vui lòng chọn lại." });
        var requestedAdults = Math.Max(1, request.Adults ?? request.Guests);
        var requestedChildren = Math.Max(0, request.Children ?? 0);
        if (requestedAdults > roomType.CapacityAdults * request.Quantity ||
            requestedChildren > roomType.CapacityChildren * request.Quantity)
            return BadRequest(new { message = "Số khách vượt quá sức chứa của phương án phòng." });

        BookingHold? bookingHold = null;
        var normalizedCoupon = string.IsNullOrWhiteSpace(request.CouponCode) ? null : request.CouponCode.Trim().ToUpperInvariant();
        if (!string.IsNullOrWhiteSpace(request.HoldToken))
        {
            var holdToken = request.HoldToken.Trim();
            bookingHold = await _context.BookingHolds.IgnoreQueryFilters().FirstOrDefaultAsync(hold => hold.HoldToken == holdToken);
            if (bookingHold == null || bookingHold.IsReleased || bookingHold.IsConvertedToReservation ||
                bookingHold.ExpiresAtUtc <= DateTime.UtcNow || bookingHold.TenantId != roomType.TenantId ||
                bookingHold.RoomTypeId != roomType.Id || bookingHold.Quantity != request.Quantity ||
                bookingHold.CouponCode != normalizedCoupon ||
                DateOnly.FromDateTime(bookingHold.CheckInDate) != request.CheckInDate ||
                DateOnly.FromDateTime(bookingHold.CheckOutDate) != request.CheckOutDate)
                return Conflict(new { code = "BOOKING_HOLD_EXPIRED", message = "Phiên giữ phòng đã hết hạn hoặc không khớp. Vui lòng giữ lại phòng." });
        }

        var paymentExpiryCutoff = DateTime.UtcNow.AddMinutes(-15);
        var reserved = await _context.ReservationDetails.IgnoreQueryFilters().CountAsync(detail =>
            detail.TenantId == roomType.TenantId && detail.RoomTypeId == roomType.Id && detail.Reservation != null &&
            detail.Reservation.Status != ReservationStatus.Cancelled && detail.Reservation.Status != ReservationStatus.NoShow &&
            detail.Reservation.Status != ReservationStatus.CheckedOut &&
            (detail.Reservation.Status != ReservationStatus.PendingPayment || detail.Reservation.CreatedAtUtc > paymentExpiryCutoff) &&
            detail.Reservation.CheckInDate < request.CheckOutDate && detail.Reservation.CheckOutDate > request.CheckInDate);
        var held = await _context.BookingHolds.IgnoreQueryFilters().Where(hold =>
            hold.TenantId == roomType.TenantId && hold.RoomTypeId == roomType.Id && !hold.IsReleased &&
            !hold.IsConvertedToReservation && hold.ExpiresAtUtc > DateTime.UtcNow &&
            (bookingHold == null || hold.Id != bookingHold.Id) &&
            hold.CheckInDate < request.CheckOutDate.ToDateTime(TimeOnly.MinValue) &&
            hold.CheckOutDate > request.CheckInDate.ToDateTime(TimeOnly.MinValue)).SumAsync(hold => (int?)hold.Quantity) ?? 0;
        var inventory = roomType.Rooms.Count(room => room.IsActive && !room.IsDeleted && room.Status != RoomStatus.OutOfService);
        if (inventory - reserved - held < request.Quantity)
            return Conflict(new { message = "Số phòng vừa được khách khác đặt hết. Vui lòng chọn phương án khác." });

        PricingResult pricing;
        if (bookingHold?.PriceSnapshotUtc != null)
        {
            var lockedPromotion = string.IsNullOrWhiteSpace(bookingHold.PromotionCode)
                ? []
                : new List<AppliedPromotionDto>
                {
                    new(bookingHold.PromotionId ?? Guid.Empty, bookingHold.PromotionCode,
                        bookingHold.CouponCode == null ? "AUTOMATIC" : "COUPON",
                        bookingHold.PromotionTitle ?? bookingHold.PromotionCode, null, bookingHold.DiscountAmount)
                };
            pricing = new PricingResult(request.CheckOutDate.DayNumber - request.CheckInDate.DayNumber,
                bookingHold.BaseSubtotal, bookingHold.DiscountAmount, bookingHold.TaxAmount, bookingHold.FeeAmount,
                bookingHold.FinalTotal, lockedPromotion);
        }
        else
        {
            pricing = await PublicPricing.Calculate(_context, roomType, request.CheckInDate, request.CheckOutDate,
                request.Quantity, normalizedCoupon);
            if (normalizedCoupon != null && pricing.Promotions.Count == 0)
                return BadRequest(new { message = "Mã ưu đãi không hợp lệ hoặc đã hết hạn." });
        }
        var nights = pricing.Nights;
        var total = pricing.FinalTotal;
        var averageNightlyPrice = AverageNightlyPrice(pricing, request.Quantity);
        var onlinePayment = requestedPaymentCode != "PAY_AT_HOTEL";
        var reservation = new Reservation
        {
            TenantId = roomType.TenantId, CustomerUserId = customerId,
            BookingCode = await NewBookingCode("LXS"),
            GuestFullName = $"{request.LastName.Trim()} {request.FirstName.Trim()}".Trim(),
            GuestEmail = contactEmail,
            GuestPhoneNumber = request.Phone.Trim(), CheckInDate = request.CheckInDate, CheckOutDate = request.CheckOutDate,
            Status = onlinePayment ? ReservationStatus.PendingPayment : ReservationStatus.Confirmed,
            TotalAmount = total, DepositAmount = 0, AdultCount = requestedAdults, ChildCount = requestedChildren,
            PaymentMethodSnapshot = ParsePaymentMethod(request.PaymentMethod),
            SpecialRequests = request.SpecialRequests?.Trim(),
            ClientRequestKey = requestKey, ClientRequestFingerprint = requestFingerprint,
            GuestAccessKey = NewGuestAccessKey(),
            IsRefundableSnapshot = roomType.IsRefundable,
            FreeCancellationHoursSnapshot = roomType.IsRefundable ? roomType.FreeCancellationHours : 0,
            CancellationDeadlineUtc = roomType.IsRefundable ? CancellationDeadlineUtc(request.CheckInDate, roomType.Tenant.CheckInTime, roomType.FreeCancellationHours) : null
        };
        for (var index = 0; index < request.Quantity; index++)
            reservation.Details.Add(new ReservationDetail
            {
                TenantId = roomType.TenantId, RoomTypeId = roomType.Id,
                 NightlyPrice = averageNightlyPrice, NumberOfNights = nights,
                 SubTotal = averageNightlyPrice * nights
            });
        reservation.Folio = new Folio
        {
            TenantId = roomType.TenantId, FolioNumber = $"FOL-{reservation.BookingCode}",
            TotalCharges = total, TotalCredits = 0,
            Items =
            {
                new FolioItem
                {
                    TenantId = roomType.TenantId, ItemType = FolioItemType.RoomCharge,
                    Description = $"Tiền phòng ({nights} đêm)", UnitPrice = pricing.BaseSubtotal, Quantity = 1
                }
            }
        };
        if (pricing.Discount > 0)
            reservation.Folio.Items.Add(new FolioItem
            {
                TenantId = roomType.TenantId, ItemType = FolioItemType.Discount,
                Description = $"Ưu đãi {pricing.Promotions[0].Code}", UnitPrice = -pricing.Discount, Quantity = 1
            });
        AddTaxAndFeeItems(reservation.Folio, roomType.TenantId, pricing);
        if (bookingHold != null)
        {
            bookingHold.IsConvertedToReservation = true;
            await TransferRoomDateLocks(bookingHold.Id, reservation.Id);
        }
        _context.Reservations.Add(reservation);
        await _context.SaveChangesAsync();
        reservation.Tenant = roomType.Tenant;
        await DeliverConfirmationEmail(reservation);
        return Ok(ToCustomerDto(reservation, guestAccessKey: reservation.GuestAccessKey));
    }

    [HttpGet("my-bookings")]
    [Authorize(Roles = "Customer")]
    public async Task<ActionResult<List<CustomerBookingDto>>> MyBookings()
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var customerId)) return Forbid();
        var bookings = await CustomerQuery().IgnoreQueryFilters().Where(item => item.CustomerUserId == customerId)
            .OrderByDescending(item => item.CreatedAtUtc).ToListAsync();
        await ExpirePendingPayments(bookings);
        var reservationIds = bookings.Select(item => item.Id).ToList();
        var reviews = await _context.PropertyReviews.AsNoTracking().Where(item => reservationIds.Contains(item.ReservationId) && !item.IsDeleted).ToDictionaryAsync(item => item.ReservationId);
        return Ok(bookings.Select(item => ToCustomerDto(item, reviews.GetValueOrDefault(item.Id))).ToList());
    }

    [HttpGet("guest/{bookingCode}")]
    [AllowAnonymous]
    [EnableRateLimiting("guest-booking-access")]
    public async Task<ActionResult<CustomerBookingDto>> GuestBooking(string bookingCode,
        [FromHeader(Name = "Booking-Access-Key")] string? bookingAccessKey)
    {
        var normalizedCode = bookingCode.Trim().ToUpperInvariant();
        if (normalizedCode.Length is < 8 or > 50) return NotFound(new { message = "Không tìm thấy booking." });
        var reservation = await CustomerQuery().IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.BookingCode == normalizedCode);
        if (reservation == null || !GuestAccessMatches(reservation, bookingAccessKey))
            return NotFound(new { message = "Không tìm thấy booking." });
        await ExpirePendingPayments([reservation]);
        return Ok(ToCustomerDto(reservation));
    }

    [HttpPost("guest/access")]
    [AllowAnonymous]
    [EnableRateLimiting("guest-booking-recovery")]
    public async Task<ActionResult<CustomerBookingDto>> RecoverGuestBooking([FromBody] GuestBookingRecoveryRequest request)
    {
        var bookingCode = request.BookingCode?.Trim().ToUpperInvariant() ?? string.Empty;
        var email = request.Email?.Trim().ToLowerInvariant() ?? string.Empty;
        var phone = request.Phone?.Trim() ?? string.Empty;
        if (bookingCode.Length is < 8 or > 50 || email.Length is < 3 or > 200 || phone.Length is < 6 or > 30)
            return NotFound(new { message = "Không thể xác minh booking." });
        var reservation = await CustomerQuery().IgnoreQueryFilters().FirstOrDefaultAsync(item => item.BookingCode == bookingCode);
        if (reservation == null || reservation.CustomerUserId.HasValue || !RequestKeyMatches(reservation.GuestEmail, email) ||
            !RequestKeyMatches(reservation.GuestPhoneNumber, phone))
            return NotFound(new { message = "Không thể xác minh booking." });
        if (string.IsNullOrWhiteSpace(reservation.GuestAccessKey))
        {
            reservation.GuestAccessKey = NewGuestAccessKey();
            await _context.SaveChangesAsync();
        }
        await ExpirePendingPayments([reservation]);
        return Ok(ToCustomerDto(reservation, guestAccessKey: reservation.GuestAccessKey));
    }

    [HttpPost("guest/{bookingCode}/cancel")]
    [AllowAnonymous]
    [EnableRateLimiting("guest-booking-access")]
    public async Task<ActionResult<CustomerBookingDto>> CancelGuestBooking(string bookingCode,
        [FromBody] CustomerCancellationRequest request,
        [FromHeader(Name = "Booking-Access-Key")] string? bookingAccessKey,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey = null)
    {
        var normalizedCode = bookingCode.Trim().ToUpperInvariant();
        var reservation = normalizedCode.Length is < 8 or > 50 ? null : await CustomerQuery().IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.BookingCode == normalizedCode);
        if (reservation == null || !GuestAccessMatches(reservation, bookingAccessKey))
            return NotFound(new { message = "Không tìm thấy booking." });
        await ExpirePendingPayments([reservation]);
        return await CancelCustomerReservation(reservation, request, idempotencyKey);
    }

    [HttpPost("{reservationId:guid}/cancel")]
    [Authorize(Roles = "Customer")]
    public async Task<ActionResult<CustomerBookingDto>> CancelMine(Guid reservationId, [FromBody] CustomerCancellationRequest request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey = null)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var customerId)) return Forbid();
        var reservation = await CustomerQuery().IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.Id == reservationId && item.CustomerUserId == customerId);
        if (reservation == null) return NotFound(new { message = "Không tìm thấy booking thuộc tài khoản này." });
        return await CancelCustomerReservation(reservation, request, idempotencyKey);
    }

    [HttpPost("{reservationId:guid}/confirmation-email")]
    [Authorize(Roles = "Customer")]
    [EnableRateLimiting("confirmation-email")]
    public async Task<ActionResult<CustomerBookingDto>> ResendMineConfirmationEmail(Guid reservationId)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var customerId)) return Forbid();
        var reservation = await CustomerQuery().IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.Id == reservationId && item.CustomerUserId == customerId);
        if (reservation == null) return NotFound(new { message = "Không tìm thấy booking thuộc tài khoản này." });
        return await ResendConfirmationEmail(reservation);
    }

    [HttpPost("guest/{bookingCode}/confirmation-email")]
    [AllowAnonymous]
    [EnableRateLimiting("confirmation-email")]
    public async Task<ActionResult<CustomerBookingDto>> ResendGuestConfirmationEmail(string bookingCode,
        [FromHeader(Name = "Booking-Access-Key")] string? bookingAccessKey)
    {
        var normalizedCode = bookingCode.Trim().ToUpperInvariant();
        var reservation = normalizedCode.Length is < 8 or > 50 ? null : await CustomerQuery().IgnoreQueryFilters()
            .FirstOrDefaultAsync(item => item.BookingCode == normalizedCode);
        if (reservation == null || !GuestAccessMatches(reservation, bookingAccessKey))
            return NotFound(new { message = "Không tìm thấy booking." });
        return await ResendConfirmationEmail(reservation);
    }

    private async Task<ActionResult<CustomerBookingDto>> ResendConfirmationEmail(Reservation reservation)
    {
        if (reservation.ConfirmationEmailLastAttemptUtc > DateTime.UtcNow.AddMinutes(-1))
            return Conflict(new { code = "EMAIL_RETRY_TOO_SOON", message = "Vui lòng chờ một phút trước khi gửi lại email." });
        await DeliverConfirmationEmail(reservation);
        return Ok(ToCustomerDto(reservation));
    }

    private async Task<ActionResult<CustomerBookingDto>> CancelCustomerReservation(
        Reservation reservation, CustomerCancellationRequest request, string? idempotencyKey)
    {
        if (reservation.Status == ReservationStatus.Cancelled) return Ok(ToCustomerDto(reservation));
        if (reservation.Status is ReservationStatus.CheckedIn or ReservationStatus.CheckedOut or ReservationStatus.NoShow)
            return Conflict(new { message = "Booking đã vào giai đoạn lưu trú nên không thể tự hủy." });
        if (!reservation.IsRefundableSnapshot)
            return Conflict(new { code = "NON_REFUNDABLE", message = "Hạng phòng này không áp dụng hoàn hủy." });
        if (reservation.CancellationDeadlineUtc.HasValue && reservation.CancellationDeadlineUtc <= DateTime.UtcNow)
            return Conflict(new { code = "FREE_CANCELLATION_EXPIRED", message = "Đã quá thời hạn hủy miễn phí của booking." });
        if (string.IsNullOrWhiteSpace(request.ReasonCode))
            return BadRequest(new { message = "Vui lòng chọn lý do hủy." });
        if (string.Equals(request.ReasonCode, "OTHER", StringComparison.OrdinalIgnoreCase) && string.IsNullOrWhiteSpace(request.Reason))
            return BadRequest(new { message = "Vui lòng nhập lý do hủy cụ thể." });

        var completedPayment = reservation.Payments.OrderByDescending(payment => payment.PaidAtUtc)
            .FirstOrDefault(payment => payment.Status is PaymentStatus.Completed or PaymentStatus.Refunded);
        if (completedPayment != null)
        {
            var key = idempotencyKey?.Trim();
            if (key is not { Length: >= 8 and <= 200 })
                return BadRequest(new { message = "Idempotency-Key phải có từ 8 đến 200 ký tự khi hủy booking đã thanh toán." });
            var existingRefund = completedPayment.Refunds.FirstOrDefault(refund => refund.Status is not "FAILED" and not "CANCELLED");
            if (existingRefund == null)
            {
                var succeededAmount = completedPayment.Refunds.Where(refund => refund.Status == "SUCCEEDED").Sum(refund => refund.RequestedAmount);
                var refundableAmount = completedPayment.Amount - succeededAmount;
                if (refundableAmount > 0)
                {
                    var refund = new PropertyRefund
                    {
                        TenantId = reservation.TenantId,
                        PaymentId = completedPayment.Id,
                        RequestedByUserId = Guid.TryParse(HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier), out var requesterId) ? requesterId : null,
                        PublicId = $"RF-{Guid.NewGuid():N}".ToUpperInvariant(),
                        IdempotencyKey = $"CANCEL-{key}"[..Math.Min(200, key.Length + 7)],
                        RequestedAmount = refundableAmount,
                        Reason = $"Hủy booking {reservation.BookingCode}: {request.ReasonCode.Trim().ToUpperInvariant()}" +
                            (string.IsNullOrWhiteSpace(request.Reason) ? string.Empty : $" - {request.Reason.Trim()}"),
                        Status = "PENDING_APPROVAL",
                        Provider = completedPayment.Method == PaymentMethod.VNPay ? "VNPAY" : completedPayment.Method.ToString().ToUpperInvariant()
                    };
                    _context.PropertyRefunds.Add(refund);
                }
            }
        }

        reservation.Status = ReservationStatus.Cancelled;
        reservation.CancellationReasonCode = request.ReasonCode.Trim().ToUpperInvariant();
        reservation.CancellationReason = request.Reason?.Trim();
        reservation.CancelledAtUtc = DateTime.UtcNow;
        foreach (var payment in reservation.Payments.Where(payment => payment.Status == PaymentStatus.Pending))
            payment.Status = PaymentStatus.Failed;
        await ReleaseReservationDateLocks(reservation.Id);
        await _context.SaveChangesAsync();
        return Ok(ToCustomerDto(reservation));
    }

    [HttpGet]
    [Authorize(Policy = "reservation.read")]
    public async Task<ActionResult<List<OperationalReservationDto>>> GetReservations(
        [FromQuery] DateOnly? from = null, [FromQuery] DateOnly? to = null)
    {
        if (from.HasValue != to.HasValue)
            return BadRequest(new { code = "DATE_RANGE_INCOMPLETE", message = "Cần cung cấp cả ngày bắt đầu và ngày kết thúc." });
        if (from.HasValue && (to!.Value < from.Value || to.Value.DayNumber - from.Value.DayNumber >= 31))
            return BadRequest(new { code = "DATE_RANGE_INVALID", message = "Khoảng lịch phải từ 1 đến 31 ngày." });

        var query = OperationalQuery();
        if (from.HasValue)
            query = query.Where(item => item.CheckInDate <= to!.Value && item.CheckOutDate > from.Value);
        var reservations = await query.OrderByDescending(item => item.CreatedAtUtc).ToListAsync();
        await ExpirePendingPayments(reservations);
        return Ok(reservations.Select(ToOperationalDto).ToList());
    }

    [HttpGet("{reservationId:guid}")]
    [Authorize(Policy = "reservation.read")]
    public async Task<ActionResult<OperationalReservationDto>> GetReservation(Guid reservationId)
    {
        var reservation = await OperationalQuery().FirstOrDefaultAsync(item => item.Id == reservationId);
        if (reservation != null) await ExpirePendingPayments([reservation]);
        return reservation == null
            ? NotFound(new { message = "Không tìm thấy đơn đặt phòng." })
            : Ok(ToOperationalDto(reservation));
    }

    [HttpPut("{reservationId:guid}/status")]
    [Authorize(Policy = "reservation.update")]
    public async Task<ActionResult<OperationalReservationDto>> UpdateStatus(Guid reservationId, [FromQuery] string status)
    {
        if (!string.Equals(status, "CONFIRMED", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Chuyển trạng thái này phải dùng endpoint nghiệp vụ chuyên biệt." });
        var reservation = await OperationalQuery().FirstOrDefaultAsync(item => item.Id == reservationId);
        if (reservation == null) return NotFound(new { message = "Không tìm thấy đơn đặt phòng." });
        if (reservation.Status != ReservationStatus.PendingPayment)
            return Conflict(new { message = "Chỉ đơn chờ thanh toán mới có thể xác nhận." });
        if (!reservation.Payments.Any(payment => payment.Status == PaymentStatus.Completed && payment.Amount >= reservation.TotalAmount))
            return Conflict(new { message = "Chưa có giao dịch hoàn tất đủ giá trị đơn đặt phòng." });

        reservation.Status = ReservationStatus.Confirmed;
        reservation.DepositAmount = reservation.TotalAmount;
        await _context.SaveChangesAsync();
        return Ok(ToOperationalDto(reservation));
    }

    [HttpPost("{reservationId:guid}/check-in")]
    [Authorize(Policy = "reservation.checkin")]
    public async Task<ActionResult<OperationalReservationDto>> CheckIn(Guid reservationId)
    {
        var reservation = await OperationalQuery().FirstOrDefaultAsync(item => item.Id == reservationId);
        if (reservation == null) return NotFound(new { message = "Không tìm thấy đơn đặt phòng." });
        if (reservation.Status != ReservationStatus.Confirmed)
            return Conflict(new { message = "Chỉ đơn đã xác nhận mới có thể check-in." });
        if (reservation.CheckInDate > DateOnly.FromDateTime(DateTime.UtcNow))
            return Conflict(new { code = "CHECK_IN_TOO_EARLY", message = "Chưa đến ngày nhận phòng nên không thể check-in." });

        var conflictingRoomIds = (await ConflictingRoomIds(reservation)).ToHashSet();
        var lockedRoomIds = await LockedRoomIds(reservation.Id);
        var assignedRoomIds = reservation.Details.Where(detail => detail.RoomId.HasValue)
            .Select(detail => detail.RoomId!.Value).ToHashSet();
        if (assignedRoomIds.Overlaps(conflictingRoomIds))
            return Conflict(new { code = "ROOM_ASSIGNMENT_CONFLICT", message = "Phòng đã xếp hiện trùng với booking khác trong kỳ lưu trú. Vui lòng xếp lại phòng." });
        var candidates = await _context.Rooms.Where(room => room.IsActive && !room.IsDeleted &&
                room.Status == RoomStatus.Clean && !assignedRoomIds.Contains(room.Id) && !conflictingRoomIds.Contains(room.Id))
            .OrderBy(room => room.Floor).ThenBy(room => room.RoomNumber).ToListAsync();

        foreach (var detail in reservation.Details.Where(detail => !detail.RoomId.HasValue))
        {
            var room = candidates.FirstOrDefault(item => item.RoomTypeId == detail.RoomTypeId &&
                (lockedRoomIds.Count == 0 || lockedRoomIds.Contains(item.Id)));
            if (room == null)
                return Conflict(new { message = "Không còn đủ phòng sạch đúng hạng để check-in." });
            detail.RoomId = room.Id;
            detail.Room = room;
            room.Status = RoomStatus.Occupied;
            candidates.Remove(room);
        }
        foreach (var detail in reservation.Details.Where(detail => detail.Room != null))
        {
            if (detail.Room!.Status is not (RoomStatus.Clean or RoomStatus.Occupied))
                return Conflict(new { message = $"Phòng {detail.Room.RoomNumber} chưa sẵn sàng check-in." });
            detail.Room.Status = RoomStatus.Occupied;
        }

        reservation.Status = ReservationStatus.CheckedIn;
        reservation.ActualCheckInUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return Ok(ToOperationalDto(reservation));
    }

    [HttpPost("{reservationId:guid}/assign-rooms")]
    [Authorize(Policy = "reservation.assign")]
    public async Task<ActionResult<OperationalReservationDto>> AssignRooms(Guid reservationId)
    {
        var reservation = await OperationalQuery().FirstOrDefaultAsync(item => item.Id == reservationId);
        if (reservation == null) return NotFound(new { message = "Không tìm thấy đơn đặt phòng." });
        if (reservation.Status != ReservationStatus.Confirmed)
            return Conflict(new { code = "RESERVATION_NOT_CONFIRMED", message = "Chỉ booking đã xác nhận mới có thể xếp phòng." });
        var unassigned = reservation.Details.Where(detail => !detail.RoomId.HasValue).ToList();
        if (unassigned.Count == 0) return Ok(ToOperationalDto(reservation));

        var conflictingRoomIds = await ConflictingRoomIds(reservation);
        var lockedRoomIds = await LockedRoomIds(reservation.Id);
        var alreadyAssigned = reservation.Details.Where(detail => detail.RoomId.HasValue)
            .Select(detail => detail.RoomId!.Value).ToHashSet();
        var unavailableIds = conflictingRoomIds.Concat(alreadyAssigned).ToHashSet();
        var candidates = await _context.Rooms
            .Where(room => room.IsActive && !room.IsDeleted && room.Status != RoomStatus.OutOfService && !unavailableIds.Contains(room.Id))
            .OrderBy(room => room.Floor).ThenBy(room => room.RoomNumber)
            .ToListAsync();

        var assignments = new List<(ReservationDetail Detail, Room Room)>();
        foreach (var detail in unassigned)
        {
            var room = candidates.FirstOrDefault(item => item.RoomTypeId == detail.RoomTypeId &&
                (lockedRoomIds.Count == 0 || lockedRoomIds.Contains(item.Id)));
            if (room == null)
                return Conflict(new { code = "ROOM_ASSIGNMENT_UNAVAILABLE", message = "Không còn đủ phòng đúng hạng trống trong toàn bộ kỳ lưu trú." });
            assignments.Add((detail, room));
            candidates.Remove(room);
        }

        foreach (var (detail, room) in assignments)
        {
            detail.RoomId = room.Id;
            detail.Room = room;
            // Touch the room row so its rowversion rejects concurrent allocation of the same physical room.
            room.UpdatedAtUtc = DateTime.UtcNow;
        }

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(new { code = "ROOM_ASSIGNMENT_RACE", message = "Phòng vừa được xếp cho booking khác. Vui lòng thử lại." });
        }
        return Ok(ToOperationalDto(reservation));
    }

    private Task<List<Guid>> ConflictingRoomIds(Reservation reservation) => _context.ReservationDetails
        .Where(detail => detail.ReservationId != reservation.Id && detail.RoomId.HasValue &&
            detail.Reservation != null && !detail.Reservation.IsDeleted &&
            detail.Reservation.Status != ReservationStatus.Cancelled && detail.Reservation.Status != ReservationStatus.NoShow &&
            detail.Reservation.CheckInDate < reservation.CheckOutDate && detail.Reservation.CheckOutDate > reservation.CheckInDate)
        .Select(detail => detail.RoomId!.Value)
        .ToListAsync();

    private async Task<HashSet<Guid>> LockedRoomIds(Guid reservationId) =>
        (await _context.RoomDateLocks.IgnoreQueryFilters().AsNoTracking()
            .Where(item => item.ReservationId == reservationId)
            .Select(item => item.RoomId).Distinct().ToListAsync()).ToHashSet();

    [HttpPost("{reservationId:guid}/cancel-operational")]
    [Authorize(Policy = "reservation.cancel")]
    public async Task<ActionResult<OperationalReservationDto>> CancelOperational(Guid reservationId)
    {
        var reservation = await OperationalQuery().FirstOrDefaultAsync(item => item.Id == reservationId);
        if (reservation == null) return NotFound(new { message = "Không tìm thấy đơn đặt phòng." });
        if (reservation.Status is not (ReservationStatus.PendingPayment or ReservationStatus.Confirmed))
            return Conflict(new { message = "Trạng thái hiện tại không cho phép hủy vận hành." });
        if (reservation.Payments.Any(payment => payment.Status == PaymentStatus.Completed))
            return Conflict(new { message = "Đơn đã thu tiền cần đi qua quy trình hoàn tiền trước khi hủy." });

        reservation.Status = ReservationStatus.Cancelled;
        reservation.CancellationReason = "Hủy bởi nhân viên vận hành";
        await ReleaseReservationDateLocks(reservation.Id);
        await _context.SaveChangesAsync();
        return Ok(ToOperationalDto(reservation));
    }

    [HttpPost("{reservationId:guid}/no-show")]
    [Authorize(Policy = "reservation.no_show")]
    public async Task<ActionResult<OperationalReservationDto>> MarkNoShow(Guid reservationId)
    {
        var reservation = await OperationalQuery().FirstOrDefaultAsync(item => item.Id == reservationId);
        if (reservation == null) return NotFound(new { message = "Không tìm thấy đơn đặt phòng." });
        if (reservation.Status != ReservationStatus.Confirmed)
            return Conflict(new { message = "Chỉ đơn đã xác nhận mới có thể đánh dấu không đến." });
        if (reservation.CheckInDate > DateOnly.FromDateTime(DateTime.UtcNow))
            return Conflict(new { message = "Chưa đến ngày nhận phòng nên không thể đánh dấu không đến." });

        reservation.Status = ReservationStatus.NoShow;
        reservation.CancellationReason = "Khách không đến nhận phòng";
        await _context.SaveChangesAsync();
        return Ok(ToOperationalDto(reservation));
    }

    [HttpPost("hold")]
    [EnableRateLimiting("booking-hold")]
    public async Task<ActionResult<Result<BookingHoldResponseDto>>> CreateBookingHold([FromBody] CreateBookingHoldRequestDto request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey = null)
    {
        var requestKey = idempotencyKey?.Trim();
        if (requestKey is not { Length: >= 8 and <= 200 })
            return BadRequest(Result<BookingHoldResponseDto>.Failure("Idempotency-Key phải có từ 8 đến 200 ký tự."));
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (request.CheckInDate < today || request.CheckInDate >= request.CheckOutDate)
            return BadRequest(Result<BookingHoldResponseDto>.Failure("Ngày lưu trú không hợp lệ."));
        if (request.Quantity is < 1 or > 10)
            return BadRequest(Result<BookingHoldResponseDto>.Failure("Số lượng phòng phải từ 1 đến 10."));

        var roomType = await _context.RoomTypes
            .IgnoreQueryFilters()
            .Include(rt => rt.Tenant)
            .Include(rt => rt.Rooms)
            .FirstOrDefaultAsync(rt => rt.Id == request.RoomTypeId && rt.TenantId == request.TenantId && rt.IsActive && !rt.IsDeleted);

        if (roomType == null || roomType.Tenant?.Status != TenantStatus.Active)
            return NotFound(Result<BookingHoldResponseDto>.Failure("Không tìm thấy loại phòng đang mở bán."));

        var checkInDt = request.CheckInDate.ToDateTime(TimeOnly.MinValue);
        var checkOutDt = request.CheckOutDate.ToDateTime(TimeOnly.MinValue);
        var couponCode = string.IsNullOrWhiteSpace(request.CouponCode) ? null : request.CouponCode.Trim().ToUpperInvariant();
        var now = DateTime.UtcNow;
        var existing = await _context.BookingHolds.IgnoreQueryFilters()
            .FirstOrDefaultAsync(hold => hold.ClientRequestKey == requestKey);
        if (existing != null)
        {
            var sameRequest = existing.TenantId == request.TenantId && existing.RoomTypeId == request.RoomTypeId &&
                existing.CheckInDate == checkInDt && existing.CheckOutDate == checkOutDt && existing.Quantity == request.Quantity &&
                existing.CouponCode == couponCode;
            if (!sameRequest || existing.IsConvertedToReservation)
                return Conflict(Result<BookingHoldResponseDto>.Failure("Idempotency key đã được sử dụng cho phiên giữ phòng khác."));
            if (!existing.IsReleased && existing.ExpiresAtUtc > now)
                return Ok(Result<BookingHoldResponseDto>.Success(ToHoldDto(existing, roomType.BasePricePerNight), "Đã khôi phục phiên giữ chỗ hiện tại."));
        }
        var reservedRooms = await _context.ReservationDetails
            .IgnoreQueryFilters()
            .CountAsync(detail => detail.TenantId == request.TenantId &&
                                  detail.RoomTypeId == request.RoomTypeId &&
                                  detail.Reservation != null &&
                                  detail.Reservation.Status != ReservationStatus.Cancelled &&
                                  detail.Reservation.Status != ReservationStatus.NoShow &&
                                  detail.Reservation.Status != ReservationStatus.CheckedOut &&
                                  (detail.Reservation.Status != ReservationStatus.PendingPayment || detail.Reservation.CreatedAtUtc > now.AddMinutes(-15)) &&
                                  detail.Reservation.CheckInDate < request.CheckOutDate &&
                                  detail.Reservation.CheckOutDate > request.CheckInDate);
        var heldRooms = await _context.BookingHolds
            .IgnoreQueryFilters()
            .Where(hold => hold.TenantId == request.TenantId &&
                           hold.RoomTypeId == request.RoomTypeId &&
                           !hold.IsReleased && !hold.IsConvertedToReservation &&
                           hold.ExpiresAtUtc > now &&
                           hold.CheckInDate < checkOutDt && hold.CheckOutDate > checkInDt)
            .SumAsync(hold => (int?)hold.Quantity) ?? 0;
        var inventory = roomType.Rooms.Count(room => room.IsActive && !room.IsDeleted && room.Status != RoomStatus.OutOfService);
        var available = Math.Max(0, inventory - reservedRooms - heldRooms);
        if (request.Quantity > available)
            return Conflict(Result<BookingHoldResponseDto>.Failure($"Chỉ còn {available} phòng phù hợp cho thời gian đã chọn."));

        var stayDates = Enumerable.Range(0, request.CheckOutDate.DayNumber - request.CheckInDate.DayNumber)
            .Select(offset => request.CheckInDate.AddDays(offset)).ToList();
        var roomIds = roomType.Rooms.Where(room => room.IsActive && !room.IsDeleted && room.Status != RoomStatus.OutOfService)
            .Select(room => room.Id).ToList();
        var lockedRoomIds = await _context.RoomDateLocks.IgnoreQueryFilters().AsNoTracking()
            .Where(item => roomIds.Contains(item.RoomId) && stayDates.Contains(item.StayDate))
            .Select(item => item.RoomId).Distinct().ToListAsync();
        var selectedRoomIds = roomIds.Except(lockedRoomIds).Take(request.Quantity).ToList();
        if (selectedRoomIds.Count < request.Quantity)
            return Conflict(Result<BookingHoldResponseDto>.Failure("Phòng vừa được giữ bởi khách khác. Vui lòng thử lại."));

        var pricing = await PublicPricing.Calculate(_context, roomType, request.CheckInDate, request.CheckOutDate,
            request.Quantity, couponCode);
        if (couponCode != null && pricing.Promotions.Count == 0)
            return BadRequest(Result<BookingHoldResponseDto>.Failure("Mã ưu đãi không hợp lệ hoặc đã hết hạn."));

        var hold = existing ?? new BookingHold { ClientRequestKey = requestKey };
        hold.TenantId = request.TenantId;
        hold.RoomTypeId = request.RoomTypeId;
        hold.CheckInDate = checkInDt;
        hold.CheckOutDate = checkOutDt;
        hold.Quantity = request.Quantity;
        hold.CouponCode = couponCode;
        hold.BaseSubtotal = pricing.BaseSubtotal;
        hold.DiscountAmount = pricing.Discount;
        hold.TaxAmount = pricing.TaxAmount;
        hold.FeeAmount = pricing.FeeAmount;
        hold.FinalTotal = pricing.FinalTotal;
        hold.NightlyRateBreakdownJson = JsonSerializer.Serialize(pricing.NightlyRates ?? []);
        var promotion = pricing.Promotions.FirstOrDefault();
        hold.PromotionId = promotion?.CampaignId;
        hold.PromotionCode = promotion?.Code;
        hold.PromotionTitle = promotion?.NameVi;
        hold.PriceSnapshotUtc = now;
        hold.ExpiresAtUtc = now.AddMinutes(15);
        hold.IsReleased = false;
        if (existing == null) _context.BookingHolds.Add(hold);
        foreach (var roomId in selectedRoomIds)
            foreach (var stayDate in stayDates)
                _context.RoomDateLocks.Add(new RoomDateLock
                {
                    TenantId = request.TenantId,
                    RoomId = roomId,
                    StayDate = stayDate,
                    BookingHoldId = hold.Id,
                    ExpiresAtUtc = hold.ExpiresAtUtc
                });
        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException) when (existing == null)
        {
            _context.BookingHolds.Remove(hold);
            var concurrent = await _context.BookingHolds.IgnoreQueryFilters()
                .FirstOrDefaultAsync(item => item.ClientRequestKey == requestKey);
            if (concurrent == null)
                return Conflict(Result<BookingHoldResponseDto>.Failure("Phòng vừa được giữ bởi khách khác. Vui lòng chọn lại."));
            var sameRequest = concurrent.TenantId == request.TenantId && concurrent.RoomTypeId == request.RoomTypeId &&
                concurrent.CheckInDate == checkInDt && concurrent.CheckOutDate == checkOutDt && concurrent.Quantity == request.Quantity &&
                concurrent.CouponCode == couponCode;
            if (!sameRequest || concurrent.IsReleased || concurrent.IsConvertedToReservation || concurrent.ExpiresAtUtc <= now)
                return Conflict(Result<BookingHoldResponseDto>.Failure("Idempotency key đã được sử dụng cho phiên giữ phòng khác."));
            return Ok(Result<BookingHoldResponseDto>.Success(ToHoldDto(concurrent, roomType.BasePricePerNight), "Đã khôi phục phiên giữ chỗ hiện tại."));
        }

        return Ok(Result<BookingHoldResponseDto>.Success(ToHoldDto(hold, roomType.BasePricePerNight), "Đã khóa giữ chỗ 15 phút."));
    }

    [HttpPost("hold/{holdToken}/release")]
    [AllowAnonymous]
    [EnableRateLimiting("booking-hold")]
    public async Task<ActionResult<Result>> ReleaseBookingHold(string holdToken)
    {
        var token = holdToken?.Trim() ?? string.Empty;
        if (token.Length == 0) return NotFound(Result.Failure("Không tìm thấy phiên giữ phòng."));
        var hold = await _context.BookingHolds.IgnoreQueryFilters().FirstOrDefaultAsync(item => item.HoldToken == token);
        if (hold == null) return NotFound(Result.Failure("Không tìm thấy phiên giữ phòng."));
        if (hold.IsConvertedToReservation)
            return Conflict(Result.Failure("Phiên giữ phòng đã được chuyển thành reservation."));
        if (!hold.IsReleased)
        {
            hold.IsReleased = true;
            var locks = await _context.RoomDateLocks.IgnoreQueryFilters()
                .Where(item => item.BookingHoldId == hold.Id).ToListAsync();
            _context.RoomDateLocks.RemoveRange(locks);
            await _context.SaveChangesAsync();
        }
        return Ok(Result.Success("Đã giải phóng phiên giữ phòng."));
    }

    [HttpPost("confirm")]
    public async Task<ActionResult<Result<ReservationDto>>> ConfirmBooking([FromBody] ConfirmBookingRequestDto request)
    {
        var hold = await _context.BookingHolds
            .IgnoreQueryFilters()
            .Include(h => h.RoomType).ThenInclude(type => type!.Tenant)
            .FirstOrDefaultAsync(h => h.HoldToken == request.HoldToken);

        if (hold == null || hold.IsReleased || hold.IsConvertedToReservation || hold.ExpiresAtUtc < DateTime.UtcNow)
        {
            return BadRequest(Result<ReservationDto>.Failure("Phiên giữ chỗ không hợp lệ hoặc đã hết hạn 15 phút."));
        }

        if (string.IsNullOrWhiteSpace(request.GuestFullName) ||
            string.IsNullOrWhiteSpace(request.GuestEmail) ||
            string.IsNullOrWhiteSpace(request.GuestPhoneNumber))
            return BadRequest(Result<ReservationDto>.Failure("Vui lòng nhập đầy đủ thông tin khách lưu trú."));

        var checkInDate = DateOnly.FromDateTime(hold.CheckInDate);
        var checkOutDate = DateOnly.FromDateTime(hold.CheckOutDate);
        var nights = checkOutDate.DayNumber - checkInDate.DayNumber;
        // A hold is the pricing authority: never re-read the mutable base/rate table here.
        var totalAmount = hold.FinalTotal > 0
            ? hold.FinalTotal
            : hold.RoomType!.BasePricePerNight * nights * hold.Quantity;
        var snapshotRates = DeserializeNightlyRates(hold.NightlyRateBreakdownJson);
        var snapshotNightlyPrice = snapshotRates.Count > 0
            ? snapshotRates.Sum(item => item.TotalPrice) / Math.Max(1, nights * hold.Quantity)
            : hold.RoomType!.BasePricePerNight;
        var adultCount = Math.Max(1, request.Adults ?? hold.Quantity * 2);
        var childCount = Math.Max(0, request.Children ?? 0);
        if (adultCount > hold.RoomType!.CapacityAdults * hold.Quantity || childCount > hold.RoomType.CapacityChildren * hold.Quantity)
            return BadRequest(Result<ReservationDto>.Failure("Số khách vượt quá sức chứa của phương án phòng."));
        var bookingCode = await NewBookingCode("LXS");

        var reservation = new Reservation
        {
            TenantId = hold.TenantId,
            BookingCode = bookingCode,
            GuestFullName = request.GuestFullName.Trim(),
            GuestEmail = request.GuestEmail.Trim().ToLowerInvariant(),
            GuestPhoneNumber = request.GuestPhoneNumber.Trim(),
            GuestIdentityCard = request.GuestIdentityCard,
            CheckInDate = checkInDate,
            CheckOutDate = checkOutDate,
            Status = request.PaymentMethod == PaymentMethod.VNPay ? ReservationStatus.PendingPayment : ReservationStatus.Confirmed,
            TotalAmount = totalAmount,
            DepositAmount = 0,
            AdultCount = adultCount,
            ChildCount = childCount,
            PaymentMethodSnapshot = request.PaymentMethod,
            SpecialRequests = request.SpecialRequests,
            IsRefundableSnapshot = hold.RoomType.IsRefundable,
            FreeCancellationHoursSnapshot = hold.RoomType.IsRefundable ? hold.RoomType.FreeCancellationHours : 0,
            CancellationDeadlineUtc = hold.RoomType.IsRefundable
                ? CancellationDeadlineUtc(checkInDate, hold.RoomType.Tenant?.CheckInTime ?? "14:00", hold.RoomType.FreeCancellationHours) : null
        };

        for (int i = 0; i < hold.Quantity; i++)
        {
            reservation.Details.Add(new ReservationDetail
            {
                TenantId = hold.TenantId,
                RoomTypeId = hold.RoomTypeId,
                NightlyPrice = snapshotNightlyPrice,
                NumberOfNights = nights,
                SubTotal = snapshotNightlyPrice * nights
            });
        }

        var folio = new Folio
        {
            TenantId = hold.TenantId,
            FolioNumber = $"FOL-{bookingCode}",
            TotalCharges = totalAmount,
            TotalCredits = 0
        };

        folio.Items.Add(new FolioItem
        {
            TenantId = hold.TenantId,
            ItemType = FolioItemType.RoomCharge,
            Description = $"Tiền phòng ({nights} đêm)",
            UnitPrice = totalAmount,
            Quantity = 1
        });

        reservation.Folio = folio;
        _context.Reservations.Add(reservation);

        hold.IsConvertedToReservation = true;
        await TransferRoomDateLocks(hold.Id, reservation.Id);
        await _context.SaveChangesAsync();

        var dto = new ReservationDto(reservation.Id, reservation.TenantId, reservation.BookingCode, reservation.GuestFullName, reservation.GuestEmail, reservation.GuestPhoneNumber, reservation.CheckInDate, reservation.CheckOutDate, reservation.Status, reservation.TotalAmount, reservation.DepositAmount, hold.RoomType.Name, new List<string>());
        return Ok(Result<ReservationDto>.Success(dto, "Tạo đơn đặt phòng thành công!"));
    }

    private IQueryable<Reservation> OperationalQuery() => _context.Reservations
        .Include(item => item.Details).ThenInclude(detail => detail.Room)
        .Include(item => item.Payments).ThenInclude(payment => payment.Refunds)
        .Where(item => !item.IsDeleted);

    private async Task TransferRoomDateLocks(Guid holdId, Guid reservationId)
    {
        var locks = await _context.RoomDateLocks.IgnoreQueryFilters()
            .Where(item => item.BookingHoldId == holdId).ToListAsync();
        foreach (var item in locks)
        {
            item.BookingHoldId = null;
            item.ReservationId = reservationId;
            item.ExpiresAtUtc = null;
        }
    }

    private async Task ReleaseReservationDateLocks(Guid reservationId)
    {
        var locks = await _context.RoomDateLocks.IgnoreQueryFilters()
            .Where(item => item.ReservationId == reservationId).ToListAsync();
        _context.RoomDateLocks.RemoveRange(locks);
    }

    private IQueryable<Reservation> CustomerQuery() => _context.Reservations
        .Include(item => item.Tenant)
        .Include(item => item.Details).ThenInclude(detail => detail.Room)
        .Include(item => item.Payments).ThenInclude(payment => payment.Refunds)
        .Where(item => !item.IsDeleted);

    private static OperationalReservationDto ToOperationalDto(Reservation reservation)
    {
        var payment = reservation.Payments.OrderByDescending(item => item.CreatedAtUtc).FirstOrDefault();
        return new OperationalReservationDto(
            reservation.Id, reservation.BookingCode, reservation.CustomerUserId, reservation.GuestEmail, reservation.GuestFullName,
            reservation.CheckInDate, reservation.CheckOutDate,
            reservation.AdultCount + reservation.ChildCount, reservation.AdultCount, reservation.ChildCount,
            reservation.TotalAmount, StatusName(reservation.Status),
            PaymentMethodName(payment?.Method ?? reservation.PaymentMethodSnapshot), reservation.SpecialRequests,
            reservation.CancellationReason, reservation.Details.Select(detail => new OperationalReservationDetailDto(
                detail.Id, reservation.Id, detail.RoomTypeId, detail.RoomId, detail.Room?.RoomNumber, detail.NightlyPrice)).ToList(),
            payment == null ? null : new OperationalPaymentDto(
                "VNPAY", payment.Amount, "VND", PaymentStatusName(payment),
                payment.CreatedAtUtc.AddMinutes(15), payment.PaidAtUtc, false, null, payment.Id.ToString()),
            payment?.Refunds.OrderBy(item => item.CreatedAtUtc).Select(ToRefundSummary).ToList() ?? []);
    }

    private static string StatusName(ReservationStatus status) => status switch
    {
        ReservationStatus.PendingPayment => "PENDING_PAYMENT", ReservationStatus.Confirmed => "CONFIRMED",
        ReservationStatus.CheckedIn => "CHECKED_IN", ReservationStatus.CheckedOut => "CHECKED_OUT",
        ReservationStatus.Cancelled => "CANCELLED", ReservationStatus.NoShow => "NO_SHOW", _ => status.ToString().ToUpperInvariant()
    };

    private static string PaymentStatusName(Payment payment) => payment.Status switch
    {
        PaymentStatus.Completed => "SUCCEEDED", PaymentStatus.Failed => "FAILED",
        PaymentStatus.Expired => "EXPIRED",
        PaymentStatus.Pending when payment.CreatedAtUtc.AddMinutes(15) <= DateTime.UtcNow => "EXPIRED",
        _ => "PENDING"
    };

    private async Task ExpirePendingPayments(IEnumerable<Reservation> reservations)
    {
        var now = DateTime.UtcNow;
        var changed = false;
        foreach (var reservation in reservations)
            changed |= ReservationPaymentLifecycle.ExpireIfOverdue(reservation, now);
        if (changed) await _context.SaveChangesAsync();
    }

    private static DateTime CancellationDeadlineUtc(DateOnly checkInDate, string checkInTime, int freeCancellationHours)
    {
        var time = TimeOnly.TryParseExact(checkInTime, "HH:mm", out var parsed) ? parsed : new TimeOnly(14, 0);
        var localCheckIn = DateTime.SpecifyKind(checkInDate.ToDateTime(time), DateTimeKind.Unspecified);
        TimeZoneInfo timeZone;
        try { timeZone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Bangkok"); }
        catch (TimeZoneNotFoundException) { timeZone = TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time"); }
        return TimeZoneInfo.ConvertTimeToUtc(localCheckIn, timeZone).AddHours(-Math.Max(0, freeCancellationHours));
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private async Task DeliverConfirmationEmail(Reservation reservation)
    {
        reservation.ConfirmationEmailLastAttemptUtc = DateTime.UtcNow;
        if (_emailDelivery?.IsConfigured != true)
        {
            reservation.ConfirmationEmailStatus = "NOT_CONFIGURED";
            reservation.ConfirmationEmailFailureReason = null;
            await _context.SaveChangesAsync();
            return;
        }

        reservation.ConfirmationEmailStatus = "PENDING";
        reservation.ConfirmationEmailFailureReason = null;
        await _context.SaveChangesAsync();
        var propertyName = reservation.Tenant?.Name ?? "LuxeStay";
        var result = await _emailDelivery.SendAsync(reservation.GuestEmail,
            $"Xác nhận booking {reservation.BookingCode}",
            $"<h1>Booking {WebUtility.HtmlEncode(reservation.BookingCode)}</h1>" +
            $"<p>Xin chào {WebUtility.HtmlEncode(reservation.GuestFullName)},</p>" +
            $"<p>Đơn đặt phòng tại <strong>{WebUtility.HtmlEncode(propertyName)}</strong> đã được ghi nhận.</p>" +
            $"<p>Nhận phòng: {reservation.CheckInDate:dd/MM/yyyy}<br>Trả phòng: {reservation.CheckOutDate:dd/MM/yyyy}<br>" +
            $"Tổng tiền: {reservation.TotalAmount:N0} VND</p>");
        reservation.ConfirmationEmailStatus = result.Status;
        reservation.ConfirmationEmailSentAtUtc = result.Sent ? DateTime.UtcNow : null;
        reservation.ConfirmationEmailFailureReason = result.Error;
        await _context.SaveChangesAsync();
    }

    private static void AddTaxAndFeeItems(Folio folio, Guid tenantId, PricingResult pricing)
    {
        if (pricing.TaxAmount > 0)
            folio.Items.Add(new FolioItem { TenantId = tenantId, ItemType = FolioItemType.Tax,
                Description = "Thuế lưu trú", UnitPrice = pricing.TaxAmount, Quantity = 1 });
        if (pricing.FeeAmount > 0)
            folio.Items.Add(new FolioItem { TenantId = tenantId, ItemType = FolioItemType.ServiceCharge,
                Description = "Phí dịch vụ", UnitPrice = pricing.FeeAmount, Quantity = 1 });
    }

    private static CustomerBookingDto ToCustomerDto(Reservation reservation, PropertyReview? review = null, string? guestAccessKey = null)
    {
        var payment = reservation.Payments.OrderByDescending(item => item.CreatedAtUtc).FirstOrDefault();
        var cancellationBlockReason = CancellationBlockReason(reservation, payment);
        return new CustomerBookingDto(reservation.Id, reservation.BookingCode, reservation.CheckInDate, reservation.CheckOutDate,
            reservation.AdultCount + reservation.ChildCount, reservation.Details.Count, reservation.AdultCount, reservation.ChildCount,
            reservation.TotalAmount, StatusName(reservation.Status), PaymentMethodName(payment?.Method ?? reservation.PaymentMethodSnapshot),
            payment == null ? null : new OperationalPaymentDto("VNPAY", payment.Amount, "VND", PaymentStatusName(payment),
                payment.CreatedAtUtc.AddMinutes(15), payment.PaidAtUtc, false, null, payment.Id.ToString()),
            reservation.CancellationReasonCode, reservation.CancellationReason, reservation.CancelledAtUtc,
            reservation.Tenant == null ? null : new CustomerPropertyDto(reservation.TenantId, reservation.Tenant.Name,
                reservation.Tenant.Address, reservation.Tenant.PhoneNumber, reservation.Tenant.Email),
             reservation.Details.Select(detail => new OperationalReservationDetailDto(
                detail.Id, reservation.Id, detail.RoomTypeId, detail.RoomId, detail.Room?.RoomNumber, detail.NightlyPrice)).ToList(),
             review == null ? null : new CustomerReviewDto(review.Id, review.Score, review.Title, review.Comment, review.CreatedAtUtc),
             reservation.IsRefundableSnapshot, reservation.FreeCancellationHoursSnapshot, reservation.CancellationDeadlineUtc,
             cancellationBlockReason is null, cancellationBlockReason, guestAccessKey,
             reservation.ConfirmationEmailStatus, reservation.GuestEmail,
             reservation.ConfirmationEmailStatus == "SENT",
             payment?.Refunds.OrderBy(item => item.CreatedAtUtc).Select(ToRefundSummary).ToList() ?? []);
    }
    private static RefundSummaryDto ToRefundSummary(PropertyRefund refund) => new(
        refund.PublicId, refund.RequestedAmount, "VND", refund.Provider ?? "PENDING",
        refund.Status, refund.CreatedAtUtc, refund.CompletedAtUtc, refund.FailureCode);
    private static string? CancellationBlockReason(Reservation reservation, Payment? payment)
    {
        if (reservation.Status is ReservationStatus.Cancelled or ReservationStatus.CheckedIn or ReservationStatus.CheckedOut or ReservationStatus.NoShow)
            return "Booking không còn trong giai đoạn có thể tự hủy.";
        if (!reservation.IsRefundableSnapshot) return "Hạng phòng này không áp dụng hoàn hủy.";
        if (reservation.CancellationDeadlineUtc.HasValue && reservation.CancellationDeadlineUtc <= DateTime.UtcNow)
            return "Đã quá thời hạn hủy miễn phí.";
        return null;
    }

    private static PaymentMethod ParsePaymentMethod(string? value) => value?.Trim().ToUpperInvariant() switch
    {
        "BANK_TRANSFER" => PaymentMethod.BankTransfer,
        "MANUAL_TRANSFER" => PaymentMethod.BankTransfer,
        "QR_TRANSFER" => PaymentMethod.BankTransfer,
        "MOMO" => PaymentMethod.BankTransfer,
        "ZALOPAY" => PaymentMethod.BankTransfer,
        "CREDIT_CARD" => PaymentMethod.CreditCard,
        "CARD_TERMINAL" => PaymentMethod.CreditCard,
        "VNPAY" => PaymentMethod.VNPay,
        _ => PaymentMethod.Cash
    };

    private static string PaymentMethodName(PaymentMethod method) => method switch
    {
        PaymentMethod.BankTransfer => "BANK_TRANSFER",
        PaymentMethod.CreditCard => "CREDIT_CARD",
        PaymentMethod.VNPay => "VNPAY",
        _ => "CASH"
    };

    private async Task<string> NewBookingCode(string prefix)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var candidate = $"{prefix}-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString("N")[..10].ToUpperInvariant()}";
            if (!await _context.Reservations.IgnoreQueryFilters().AnyAsync(item => item.BookingCode == candidate)) return candidate;
        }
        throw new InvalidOperationException("Không thể cấp mã booking duy nhất sau nhiều lần thử.");
    }

    private static string OperationalFingerprint(CreateOperationalReservationRequest request, Guid tenantId) => Fingerprint(
        tenantId, request.RoomId, request.UserId, request.CheckInDate, request.CheckOutDate, request.Guests,
        request.Adults, request.Children, request.GuestFullName?.Trim(), request.GuestPhoneNumber?.Trim(),
        request.GuestEmail?.Trim().ToLowerInvariant(), request.PaymentMethod?.Trim().ToUpperInvariant(),
        request.SpecialRequests?.Trim(), request.ExpectedTotal);

    private static string CustomerFingerprint(CustomerBookingRequest request, Guid? customerId, string contactEmail) => Fingerprint(
        customerId, request.RoomTypeId, request.CheckInDate, request.CheckOutDate, request.Guests, request.Quantity,
        request.Adults, request.Children, request.FirstName?.Trim(), request.LastName?.Trim(), request.Phone?.Trim(), contactEmail,
        request.PaymentMethod?.Trim().ToUpperInvariant(), request.SpecialRequests?.Trim(), request.CouponCode?.Trim().ToUpperInvariant());

    private static string Fingerprint(params object?[] values)
    {
        var canonical = string.Join('\u001f', values.Select(value => value?.ToString() ?? "<null>"));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
    }

    private static bool RequestKeyMatches(string? expected, string? actual)
    {
        if (string.IsNullOrWhiteSpace(expected) || string.IsNullOrWhiteSpace(actual)) return false;
        var expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
        var actualHash = SHA256.HashData(Encoding.UTF8.GetBytes(actual.Trim()));
        return CryptographicOperations.FixedTimeEquals(expectedHash, actualHash);
    }

    private static bool GuestAccessMatches(Reservation reservation, string? actual) =>
        RequestKeyMatches(reservation.GuestAccessKey, actual) ||
        (string.IsNullOrWhiteSpace(reservation.GuestAccessKey) && RequestKeyMatches(reservation.ClientRequestKey, actual));

    private static BookingHoldResponseDto ToHoldDto(BookingHold hold, decimal nightlyPrice)
    {
        var checkIn = DateOnly.FromDateTime(hold.CheckInDate);
        var checkOut = DateOnly.FromDateTime(hold.CheckOutDate);
        var estimatedTotal = hold.FinalTotal > 0
            ? hold.FinalTotal
            : nightlyPrice * (checkOut.DayNumber - checkIn.DayNumber) * hold.Quantity;
        return new BookingHoldResponseDto(hold.HoldToken, hold.ExpiresAtUtc, hold.TenantId, hold.RoomTypeId,
            checkIn, checkOut, estimatedTotal, hold.BaseSubtotal, hold.DiscountAmount, hold.TaxAmount, hold.FeeAmount,
            hold.PromotionId, hold.PromotionCode, hold.PromotionTitle);
    }

    private static List<NightlyRateDto> DeserializeNightlyRates(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return JsonSerializer.Deserialize<List<NightlyRateDto>>(json) ?? []; }
        catch (JsonException) { return []; }
    }

    private static decimal AverageNightlyPrice(PricingResult pricing, int quantity) =>
        pricing.BaseSubtotal / Math.Max(1, pricing.Nights * quantity);

    private static string NewGuestAccessKey() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}

public record OperationalReservationDetailDto(Guid Id, Guid ReservationId, Guid RoomTypeId, Guid? RoomId, string? RoomNumber, decimal PriceAtBooking);
public record OperationalPaymentDto(string Provider, decimal Amount, string Currency, string Status,
    DateTime? ExpiresAt, DateTime? CompletedAt, bool ReconciliationRequired, string? FailureCode,
    string? PublicId = null);
public record RefundSummaryDto(string PublicId, decimal Amount, string Currency, string Provider,
    string Status, DateTime RequestedAt, DateTime? CompletedAt, string? FailureCode);
public record OperationalReservationDto(Guid Id, string BookingCode, Guid? UserId, string Username, string UserFullName,
    DateOnly CheckInDate, DateOnly CheckOutDate, int Guests, int Adults, int Children, decimal TotalAmount, string Status,
    string PaymentMethod, string? SpecialRequests, string? CancellationReason,
    List<OperationalReservationDetailDto> Details, OperationalPaymentDto? Payment, List<RefundSummaryDto>? Refunds = null);
public record CreateOperationalReservationRequest(Guid RoomId, Guid? UserId, DateOnly CheckInDate, DateOnly CheckOutDate,
    int Guests, string GuestFullName, string GuestPhoneNumber, string? GuestEmail, string? PaymentMethod, string? SpecialRequests,
    decimal ExpectedTotal, int? Adults = null, int? Children = null);
public record OperationalQuoteDto(Guid RoomId, string RoomNumber, Guid RoomTypeId, string RoomTypeName,
    decimal NightlyPrice, int Nights, decimal BaseSubtotal, decimal Discount, decimal FinalTotal,
    string Currency, string? PromotionCode, string? PromotionName);
public record CustomerBookingRequest(Guid RoomTypeId, DateOnly CheckInDate, DateOnly CheckOutDate, int Guests,
    string FirstName, string LastName, string Phone, string PaymentMethod, int Quantity = 1,
    int? Adults = null, int? Children = null, string? SpecialRequests = null, string? CouponCode = null, string? Email = null,
    string? HoldToken = null);
public record CustomerCancellationRequest(string ReasonCode, string? Reason);
public record GuestBookingRecoveryRequest(string BookingCode, string Email, string Phone);
public record CustomerPropertyDto(Guid Id, string Name, string Address, string? Phone, string? Email);
public record CustomerReviewDto(Guid Id, int Score, string? Title, string Comment, DateTime CreatedAt);
public record CustomerBookingDto(Guid Id, string BookingCode, DateOnly CheckInDate, DateOnly CheckOutDate, int Guests,
    int Quantity, int? Adults, int? Children, decimal TotalAmount, string Status, string PaymentMethod,
    OperationalPaymentDto? Payment, string? CancellationReasonCode, string? CancellationReason,
    DateTime? CancelledAt, CustomerPropertyDto? Property, List<OperationalReservationDetailDto> Details, CustomerReviewDto? Review,
    bool IsRefundable, int FreeCancellationHours, DateTime? CancellationDeadline, bool CanSelfCancel, string? CancellationBlockReason,
    string? GuestAccessKey = null, string ConfirmationEmailStatus = "NOT_CONFIGURED",
    string? ConfirmationEmailRecipient = null, bool ConfirmationEmailSent = false,
    List<RefundSummaryDto>? Refunds = null);
