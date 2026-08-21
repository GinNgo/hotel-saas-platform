using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPropertyPaymentConfiguration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AccountName",
                table: "PropertyPaymentAttempts",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AccountNumberMasked",
                table: "PropertyPaymentAttempts",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BankCode",
                table: "PropertyPaymentAttempts",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BankName",
                table: "PropertyPaymentAttempts",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InstructionsEn",
                table: "PropertyPaymentAttempts",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InstructionsVi",
                table: "PropertyPaymentAttempts",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QrProvider",
                table: "PropertyPaymentAttempts",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PropertyPaymentConfigurations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Enabled = table.Column<bool>(type: "bit", nullable: false),
                    Environment = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BankName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    BankCode = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AccountName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AccountNumber = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    DepositPolicyType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DepositValue = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    PaymentExpiryMinutes = table.Column<int>(type: "int", nullable: false),
                    TransferTemplate = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    QrProvider = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    InstructionsVi = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    InstructionsEn = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    MethodsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PropertyPaymentConfigurations", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PropertyPaymentConfigurations_TenantId",
                table: "PropertyPaymentConfigurations",
                column: "TenantId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PropertyPaymentConfigurations");

            migrationBuilder.DropColumn(
                name: "AccountName",
                table: "PropertyPaymentAttempts");

            migrationBuilder.DropColumn(
                name: "AccountNumberMasked",
                table: "PropertyPaymentAttempts");

            migrationBuilder.DropColumn(
                name: "BankCode",
                table: "PropertyPaymentAttempts");

            migrationBuilder.DropColumn(
                name: "BankName",
                table: "PropertyPaymentAttempts");

            migrationBuilder.DropColumn(
                name: "InstructionsEn",
                table: "PropertyPaymentAttempts");

            migrationBuilder.DropColumn(
                name: "InstructionsVi",
                table: "PropertyPaymentAttempts");

            migrationBuilder.DropColumn(
                name: "QrProvider",
                table: "PropertyPaymentAttempts");
        }
    }
}
