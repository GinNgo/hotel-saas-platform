using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddHousekeepingReservationSource : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ReservationId",
                table: "HousekeepingTasks",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_HousekeepingTasks_ReservationId",
                table: "HousekeepingTasks",
                column: "ReservationId");

            migrationBuilder.AddForeignKey(
                name: "FK_HousekeepingTasks_Reservations_ReservationId",
                table: "HousekeepingTasks",
                column: "ReservationId",
                principalTable: "Reservations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_HousekeepingTasks_Reservations_ReservationId",
                table: "HousekeepingTasks");

            migrationBuilder.DropIndex(
                name: "IX_HousekeepingTasks_ReservationId",
                table: "HousekeepingTasks");

            migrationBuilder.DropColumn(
                name: "ReservationId",
                table: "HousekeepingTasks");
        }
    }
}
