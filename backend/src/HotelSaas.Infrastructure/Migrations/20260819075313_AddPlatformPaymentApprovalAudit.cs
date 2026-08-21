using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformPaymentApprovalAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ProductionApprovedAtUtc",
                table: "PlatformPaymentConfigurations",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProductionApprovedByUserId",
                table: "PlatformPaymentConfigurations",
                type: "uniqueidentifier",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ProductionApprovedAtUtc",
                table: "PlatformPaymentConfigurations");

            migrationBuilder.DropColumn(
                name: "ProductionApprovedByUserId",
                table: "PlatformPaymentConfigurations");
        }
    }
}
