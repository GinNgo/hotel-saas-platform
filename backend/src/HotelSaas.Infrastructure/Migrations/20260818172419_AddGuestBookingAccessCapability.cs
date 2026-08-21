using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGuestBookingAccessCapability : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GuestAccessKey",
                table: "Reservations",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Reservations_GuestAccessKey",
                table: "Reservations",
                column: "GuestAccessKey",
                unique: true,
                filter: "[GuestAccessKey] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Reservations_GuestAccessKey",
                table: "Reservations");

            migrationBuilder.DropColumn(
                name: "GuestAccessKey",
                table: "Reservations");
        }
    }
}
