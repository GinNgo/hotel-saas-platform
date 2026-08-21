using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SnapshotReservationCancellationPolicy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CancellationDeadlineUtc",
                table: "Reservations",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FreeCancellationHoursSnapshot",
                table: "Reservations",
                type: "int",
                nullable: false,
                defaultValue: 24);

            migrationBuilder.AddColumn<bool>(
                name: "IsRefundableSnapshot",
                table: "Reservations",
                type: "bit",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CancellationDeadlineUtc",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "FreeCancellationHoursSnapshot",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "IsRefundableSnapshot",
                table: "Reservations");
        }
    }
}
