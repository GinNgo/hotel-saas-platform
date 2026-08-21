using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPropertyStayPolicies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CancellationPolicy",
                table: "Tenants",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CheckInTime",
                table: "Tenants",
                type: "nvarchar(5)",
                maxLength: 5,
                nullable: false,
                defaultValue: "14:00");

            migrationBuilder.AddColumn<string>(
                name: "CheckOutTime",
                table: "Tenants",
                type: "nvarchar(5)",
                maxLength: 5,
                nullable: false,
                defaultValue: "12:00");

            migrationBuilder.AddColumn<string>(
                name: "ChildrenPolicy",
                table: "Tenants",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HouseRules",
                table: "Tenants",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PetPolicy",
                table: "Tenants",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CancellationPolicy",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "CheckInTime",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "CheckOutTime",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "ChildrenPolicy",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "HouseRules",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "PetPolicy",
                table: "Tenants");
        }
    }
}
