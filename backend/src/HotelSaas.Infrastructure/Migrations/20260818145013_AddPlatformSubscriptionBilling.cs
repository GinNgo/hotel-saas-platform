using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPlatformSubscriptionBilling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ActiveSubscriptionPlanId",
                table: "Tenants",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SubscriptionEffectiveFromUtc",
                table: "Tenants",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SubscriptionEffectiveUntilUtc",
                table: "Tenants",
                type: "datetime2",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PlatformSubscriptionHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderPublicId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    ActionType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PreviousStateJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    NewStateJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ActorType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ActorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformSubscriptionHistories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PlatformSubscriptionOrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PublicId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    OrderCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OwnerUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TenantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SubscriptionPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Operation = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PlanVersion = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PlanCode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PlanName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Price = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BillingPeriod = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DurationValue = table.Column<int>(type: "int", nullable: false),
                    DurationUnit = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FeatureSnapshotJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    AppliedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IdempotencyKey = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformSubscriptionOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlatformSubscriptionOrders_SubscriptionPlans_SubscriptionPlanId",
                        column: x => x.SubscriptionPlanId,
                        principalTable: "SubscriptionPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PlatformPaymentAttempts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PlatformSubscriptionOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PublicId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Provider = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Method = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Environment = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ExpectedAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ProviderOrderReference = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CompletedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IdempotencyKey = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlatformPaymentAttempts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlatformPaymentAttempts_PlatformSubscriptionOrders_PlatformSubscriptionOrderId",
                        column: x => x.PlatformSubscriptionOrderId,
                        principalTable: "PlatformSubscriptionOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Tenants_ActiveSubscriptionPlanId",
                table: "Tenants",
                column: "ActiveSubscriptionPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_PlatformPaymentAttempts_PlatformSubscriptionOrderId_IdempotencyKey",
                table: "PlatformPaymentAttempts",
                columns: new[] { "PlatformSubscriptionOrderId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlatformPaymentAttempts_PublicId",
                table: "PlatformPaymentAttempts",
                column: "PublicId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlatformSubscriptionHistories_OrderPublicId",
                table: "PlatformSubscriptionHistories",
                column: "OrderPublicId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlatformSubscriptionOrders_OwnerUserId_IdempotencyKey",
                table: "PlatformSubscriptionOrders",
                columns: new[] { "OwnerUserId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlatformSubscriptionOrders_PublicId",
                table: "PlatformSubscriptionOrders",
                column: "PublicId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PlatformSubscriptionOrders_SubscriptionPlanId",
                table: "PlatformSubscriptionOrders",
                column: "SubscriptionPlanId");

            migrationBuilder.AddForeignKey(
                name: "FK_Tenants_SubscriptionPlans_ActiveSubscriptionPlanId",
                table: "Tenants",
                column: "ActiveSubscriptionPlanId",
                principalTable: "SubscriptionPlans",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Tenants_SubscriptionPlans_ActiveSubscriptionPlanId",
                table: "Tenants");

            migrationBuilder.DropTable(
                name: "PlatformPaymentAttempts");

            migrationBuilder.DropTable(
                name: "PlatformSubscriptionHistories");

            migrationBuilder.DropTable(
                name: "PlatformSubscriptionOrders");

            migrationBuilder.DropIndex(
                name: "IX_Tenants_ActiveSubscriptionPlanId",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "ActiveSubscriptionPlanId",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "SubscriptionEffectiveFromUtc",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "SubscriptionEffectiveUntilUtc",
                table: "Tenants");
        }
    }
}
