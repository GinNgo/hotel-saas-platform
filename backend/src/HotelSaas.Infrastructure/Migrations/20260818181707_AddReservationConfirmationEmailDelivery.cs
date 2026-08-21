using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddReservationConfirmationEmailDelivery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ConfirmationEmailFailureReason",
                table: "Reservations",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ConfirmationEmailLastAttemptUtc",
                table: "Reservations",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ConfirmationEmailSentAtUtc",
                table: "Reservations",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ConfirmationEmailStatus",
                table: "Reservations",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "NOT_CONFIGURED");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ConfirmationEmailFailureReason",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "ConfirmationEmailLastAttemptUtc",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "ConfirmationEmailSentAtUtc",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "ConfirmationEmailStatus",
                table: "Reservations");
        }
    }
}
