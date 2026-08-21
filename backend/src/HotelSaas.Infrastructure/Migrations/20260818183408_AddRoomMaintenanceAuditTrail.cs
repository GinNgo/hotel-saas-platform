using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRoomMaintenanceAuditTrail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "MaintenanceCompletedAtUtc",
                table: "Rooms",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "MaintenanceCompletedByUserId",
                table: "Rooms",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MaintenanceReason",
                table: "Rooms",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "MaintenanceStartedAtUtc",
                table: "Rooms",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "MaintenanceStartedByUserId",
                table: "Rooms",
                type: "uniqueidentifier",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MaintenanceCompletedAtUtc",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "MaintenanceCompletedByUserId",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "MaintenanceReason",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "MaintenanceStartedAtUtc",
                table: "Rooms");

            migrationBuilder.DropColumn(
                name: "MaintenanceStartedByUserId",
                table: "Rooms");
        }
    }
}
