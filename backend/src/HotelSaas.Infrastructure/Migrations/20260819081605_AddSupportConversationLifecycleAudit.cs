using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSupportConversationLifecycleAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "AssignedAtUtc",
                table: "SupportConversations",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ClosedAtUtc",
                table: "SupportConversations",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ClosedByUserId",
                table: "SupportConversations",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReopenedAtUtc",
                table: "SupportConversations",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReopenedByUserId",
                table: "SupportConversations",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "SupportConversations",
                type: "int",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AssignedAtUtc",
                table: "SupportConversations");

            migrationBuilder.DropColumn(
                name: "ClosedAtUtc",
                table: "SupportConversations");

            migrationBuilder.DropColumn(
                name: "ClosedByUserId",
                table: "SupportConversations");

            migrationBuilder.DropColumn(
                name: "ReopenedAtUtc",
                table: "SupportConversations");

            migrationBuilder.DropColumn(
                name: "ReopenedByUserId",
                table: "SupportConversations");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "SupportConversations");
        }
    }
}
