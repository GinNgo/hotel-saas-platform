using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantStaffAccessRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TenantStaffs_TenantId",
                table: "TenantStaffs");

            migrationBuilder.AddColumn<Guid>(
                name: "AccessRoleId",
                table: "TenantStaffs",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TenantStaffs_AccessRoleId",
                table: "TenantStaffs",
                column: "AccessRoleId");

            migrationBuilder.CreateIndex(
                name: "IX_TenantStaffs_TenantId_AccessRoleId",
                table: "TenantStaffs",
                columns: new[] { "TenantId", "AccessRoleId" });

            migrationBuilder.AddForeignKey(
                name: "FK_TenantStaffs_AccessRoles_AccessRoleId",
                table: "TenantStaffs",
                column: "AccessRoleId",
                principalTable: "AccessRoles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TenantStaffs_AccessRoles_AccessRoleId",
                table: "TenantStaffs");

            migrationBuilder.DropIndex(
                name: "IX_TenantStaffs_AccessRoleId",
                table: "TenantStaffs");

            migrationBuilder.DropIndex(
                name: "IX_TenantStaffs_TenantId_AccessRoleId",
                table: "TenantStaffs");

            migrationBuilder.DropColumn(
                name: "AccessRoleId",
                table: "TenantStaffs");

            migrationBuilder.CreateIndex(
                name: "IX_TenantStaffs_TenantId",
                table: "TenantStaffs",
                column: "TenantId");
        }
    }
}
