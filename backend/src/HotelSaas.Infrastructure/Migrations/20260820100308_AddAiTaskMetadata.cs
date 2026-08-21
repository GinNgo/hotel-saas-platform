using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HotelSaas.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAiTaskMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(name: "ToolName", table: "OperationalTasks", type: "nvarchar(120)", maxLength: 120, nullable: true);
            migrationBuilder.AddColumn<string>(name: "IdempotencyKey", table: "OperationalTasks", type: "nvarchar(100)", maxLength: 100, nullable: true);
            migrationBuilder.CreateIndex(name: "IX_OperationalTasks_IdempotencyKey", table: "OperationalTasks", column: "IdempotencyKey", unique: true, filter: "[IdempotencyKey] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "IX_OperationalTasks_IdempotencyKey", table: "OperationalTasks");
            migrationBuilder.DropColumn(name: "ToolName", table: "OperationalTasks");
            migrationBuilder.DropColumn(name: "IdempotencyKey", table: "OperationalTasks");
        }
    }
}
