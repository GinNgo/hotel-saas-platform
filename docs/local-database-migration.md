# Local Database Migration

The API uses the SQL Server database `HotelSaasCleanDb` from `appsettings.json`.

## Verify migration state

```powershell
dotnet ef migrations list `
  --project backend/src/HotelSaas.Infrastructure `
  --startup-project backend/src/HotelSaas.WebApi
```

The API expects the full migration chain to be applied. If startup fails with
`Invalid object name 'PermissionFunctions'`, the schema is behind the current
RBAC model. If `database update` fails because an object such as `Promotions`
already exists, the database has an old schema but no matching
`__EFMigrationsHistory` entries.

## Local-only reset

Only for a disposable local database, take a backup (or confirm there is no
data to keep), then drop/recreate `HotelSaasCleanDb` in SQL Server Management
Studio or Azure Data Studio. Apply the migrations afterward:

```powershell
dotnet ef database update `
  --project backend/src/HotelSaas.Infrastructure `
  --startup-project backend/src/HotelSaas.WebApi
```

Do not use a destructive reset against shared, staging, or production data.
For a database that must be preserved, reconcile the existing schema and
`__EFMigrationsHistory` manually before running the API.
