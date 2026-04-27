param(
  [Parameter(Mandatory = $true)]
  [string]$SupabaseUrl,
  [Parameter(Mandatory = $true)]
  [string]$ServiceRoleKey,
  [Parameter(Mandatory = $true)]
  [string]$ClientEmail,
  [Parameter(Mandatory = $true)]
  [string]$ClientPassword,
  [Parameter(Mandatory = $true)]
  [string]$OwnerEmail,
  [Parameter(Mandatory = $true)]
  [string]$OwnerPassword,
  [Parameter(Mandatory = $true)]
  [string]$OtherEmail,
  [Parameter(Mandatory = $true)]
  [string]$OtherPassword
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-SupabaseAdmin {
  param(
    [string]$Path,
    [string]$Method,
    [hashtable]$Body
  )

  $headers = @{
    "Authorization" = "Bearer $ServiceRoleKey"
    "apikey"        = $ServiceRoleKey
    "Content-Type"  = "application/json"
  }

  $uri = "$SupabaseUrl$Path"
  $json = if ($Body) { $Body | ConvertTo-Json -Depth 6 } else { $null }
  return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -Body $json
}

function Create-User {
  param(
    [string]$Email,
    [string]$Password
  )

  $payload = @{
    email = $Email
    password = $Password
    email_confirm = $true
  }

  $result = Invoke-SupabaseAdmin -Path "/auth/v1/admin/users" -Method "POST" -Body $payload
  return $result.id
}

function Invoke-Sql {
  param(
    [string]$Sql
  )

  $payload = @{ query = $Sql }
  Invoke-SupabaseAdmin -Path "/rest/v1/rpc/exec_sql" -Method "POST" -Body $payload | Out-Null
}

function Load-SqlFile {
  param([string]$Path)
  return Get-Content -Raw -Path $Path
}

$schemaPath = Resolve-Path "docs/supabase_schema.sql"
$seedPath = Resolve-Path "docs/test_seed.sql"

Write-Host "Creating users..."
$clientId = Create-User -Email $ClientEmail -Password $ClientPassword
$ownerId = Create-User -Email $OwnerEmail -Password $OwnerPassword
$otherId = Create-User -Email $OtherEmail -Password $OtherPassword

Write-Host "Client user id: $clientId"
Write-Host "Owner user id: $ownerId"
Write-Host "Other user id: $otherId"

Write-Host "Applying schema..."
$schemaSql = Load-SqlFile -Path $schemaPath
Invoke-Sql -Sql $schemaSql

Write-Host "Applying seed..."
$seedSql = Load-SqlFile -Path $seedPath
$seedSql = $seedSql.Replace("CLIENT_USER_ID", $clientId)
$seedSql = $seedSql.Replace("OWNER_USER_ID", $ownerId)
$seedSql = $seedSql.Replace("OTHER_USER_ID", $otherId)
Invoke-Sql -Sql $seedSql

Write-Host "Done."
