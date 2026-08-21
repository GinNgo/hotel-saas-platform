using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddReservationCustomerLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CancellationReasonCode",
                table: "Reservations",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CancelledAtUtc",
                table: "Reservations",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ClientRequestKey",
                table: "Reservations",
                type: "nvarchar(450)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Reservations_ClientRequestKey",
                table: "Reservations",
                column: "ClientRequestKey",
                unique: true,
                filter: "[ClientRequestKey] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Reservations_ClientRequestKey",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "CancellationReasonCode",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "CancelledAtUtc",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "ClientRequestKey",
                table: "Reservations");
        }
    }
}
