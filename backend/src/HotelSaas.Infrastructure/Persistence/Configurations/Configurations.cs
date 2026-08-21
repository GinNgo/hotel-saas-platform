using HotelSaas.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HotelSaas.Infrastructure.Persistence.Configurations;

public class TenantConfiguration : IEntityTypeConfiguration<Tenant>
{
    public void Configure(EntityTypeBuilder<Tenant> builder)
    {
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Name).HasMaxLength(200).IsRequired();
        builder.Property(t => t.Code).HasMaxLength(50).IsRequired();
        builder.HasIndex(t => t.Code).IsUnique();
        builder.HasIndex(t => t.Slug).IsUnique();
    }
}

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Username).HasMaxLength(100).IsRequired();
        builder.Property(u => u.Email).HasMaxLength(200).IsRequired();
        builder.HasIndex(u => u.Username).IsUnique();
        builder.HasIndex(u => u.Email).IsUnique();
    }
}

public class RoomConfiguration : IEntityTypeConfiguration<Room>
{
    public void Configure(EntityTypeBuilder<Room> builder)
    {
        builder.HasKey(r => r.Id);
        builder.Property(r => r.RoomNumber).HasMaxLength(20).IsRequired();
        builder.Property(r => r.MaintenanceReason).HasMaxLength(500);
        builder.Property(r => r.RowVersion).IsRowVersion();
    }
}

public class ReservationConfiguration : IEntityTypeConfiguration<Reservation>
{
    public void Configure(EntityTypeBuilder<Reservation> builder)
    {
        builder.HasKey(r => r.Id);
        builder.Property(r => r.BookingCode).HasMaxLength(50).IsRequired();
        builder.HasIndex(r => r.BookingCode).IsUnique();
        builder.Property(r => r.TotalAmount).HasPrecision(18, 2);
        builder.Property(r => r.DepositAmount).HasPrecision(18, 2);
        builder.Property(r => r.ClientRequestFingerprint).HasMaxLength(64);
        builder.Property(r => r.GuestAccessKey).HasMaxLength(64);
        builder.Property(r => r.ConfirmationEmailStatus).HasMaxLength(30);
        builder.Property(r => r.ConfirmationEmailFailureReason).HasMaxLength(500);
    }
}

public class TenantFinancialConfiguration : IEntityTypeConfiguration<Tenant>
{
    public void Configure(EntityTypeBuilder<Tenant> builder)
    {
        builder.Property(item => item.TaxRatePercent).HasPrecision(5, 2);
        builder.Property(item => item.ServiceFeeRatePercent).HasPrecision(5, 2);
    }
}

public class BookingHoldFinancialConfiguration : IEntityTypeConfiguration<BookingHold>
{
    public void Configure(EntityTypeBuilder<BookingHold> builder)
    {
        builder.Property(item => item.TaxAmount).HasPrecision(18, 2);
        builder.Property(item => item.FeeAmount).HasPrecision(18, 2);
    }
}

public class PrecisionConfigurations :
    IEntityTypeConfiguration<RoomType>,
    IEntityTypeConfiguration<ReservationDetail>,
    IEntityTypeConfiguration<Folio>,
    IEntityTypeConfiguration<FolioItem>,
    IEntityTypeConfiguration<Payment>,
    IEntityTypeConfiguration<Promotion>
{
    public void Configure(EntityTypeBuilder<RoomType> builder) => builder.Property(rt => rt.BasePricePerNight).HasPrecision(18, 2);
    public void Configure(EntityTypeBuilder<ReservationDetail> builder)
    {
        builder.Property(rd => rd.NightlyPrice).HasPrecision(18, 2);
        builder.Property(rd => rd.SubTotal).HasPrecision(18, 2);
    }
    public void Configure(EntityTypeBuilder<Folio> builder)
    {
        builder.Property(f => f.TotalCharges).HasPrecision(18, 2);
        builder.Property(f => f.TotalCredits).HasPrecision(18, 2);
    }
    public void Configure(EntityTypeBuilder<FolioItem> builder) => builder.Property(fi => fi.UnitPrice).HasPrecision(18, 2);
    public void Configure(EntityTypeBuilder<Payment> builder)
    {
        builder.Property(p => p.Amount).HasPrecision(18, 2);
        builder.Property(p => p.ClientRequestKey).HasMaxLength(200);
    }
    public void Configure(EntityTypeBuilder<Promotion> builder)
    {
        builder.Property(p => p.ApplicationType).HasMaxLength(20).HasDefaultValue("AUTOMATIC");
        builder.HasIndex(p => new { p.TenantId, p.Code }).IsUnique().HasFilter("[IsDeleted] = 0");
        builder.Property(p => p.DiscountPercent).HasPrecision(5, 2);
        builder.Property(p => p.MaxDiscountAmount).HasPrecision(18, 2);
        builder.Property(p => p.MinBookingAmount).HasPrecision(18, 2);
    }
}
