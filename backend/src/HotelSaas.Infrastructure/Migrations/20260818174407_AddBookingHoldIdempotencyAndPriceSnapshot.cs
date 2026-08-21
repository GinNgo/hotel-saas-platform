using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBookingHoldIdempotencyAndPriceSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "BaseSubtotal",
                table: "BookingHolds",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "ClientRequestKey",
                table: "BookingHolds",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CouponCode",
                table: "BookingHolds",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "DiscountAmount",
                table: "BookingHolds",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "FinalTotal",
                table: "BookingHolds",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTime>(
                name: "PriceSnapshotUtc",
                table: "BookingHolds",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PromotionCode",
                table: "BookingHolds",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PromotionId",
                table: "BookingHolds",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PromotionTitle",
                table: "BookingHolds",
                type: "nvarchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_BookingHolds_ClientRequestKey",
                table: "BookingHolds",
                column: "ClientRequestKey",
                unique: true,
                filter: "[ClientRequestKey] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_BookingHolds_ClientRequestKey",
                table: "BookingHolds");

            migrationBuilder.DropColumn(
                name: "BaseSubtotal",
                table: "BookingHolds");

            migrationBuilder.DropColumn(
                name: "ClientRequestKey",
                table: "BookingHolds");

            migrationBuilder.DropColumn(
                name: "CouponCode",
                table: "BookingHolds");

            migrationBuilder.DropColumn(
                name: "DiscountAmount",
                table: "BookingHolds");

            migrationBuilder.DropColumn(
                name: "FinalTotal",
                table: "BookingHolds");

            migrationBuilder.DropColumn(
                name: "PriceSnapshotUtc",
                table: "BookingHolds");

            migrationBuilder.DropColumn(
                name: "PromotionCode",
                table: "BookingHolds");

            migrationBuilder.DropColumn(
                name: "PromotionId",
                table: "BookingHolds");

            migrationBuilder.DropColumn(
                name: "PromotionTitle",
                table: "BookingHolds");
        }
    }
}
