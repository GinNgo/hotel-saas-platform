using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddOpenHousekeepingTaskUniqueness : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_HousekeepingTasks_RoomId",
                table: "HousekeepingTasks");

            migrationBuilder.AlterColumn<string>(
                name: "TaskType",
                table: "HousekeepingTasks",
                type: "nvarchar(450)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_HousekeepingTasks_RoomId_TaskType",
                table: "HousekeepingTasks",
                columns: new[] { "RoomId", "TaskType" },
                unique: true,
                filter: "[IsDeleted] = 0 AND [Status] <> 3");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_HousekeepingTasks_RoomId_TaskType",
                table: "HousekeepingTasks");

            migrationBuilder.AlterColumn<string>(
                name: "TaskType",
                table: "HousekeepingTasks",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(450)",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_HousekeepingTasks_RoomId",
                table: "HousekeepingTasks",
                column: "RoomId");
        }
    }
}
