param(
  [string]$Ogr2OgrPath = "C:\Program Files\QGIS 3.44.8\bin\ogr2ogr.exe",
  [switch]$Append
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$envPath = Join-Path $repoRoot "backend\.env"
$dataDir = Join-Path $repoRoot "Data\processed\osm_scoring"

if (-not (Test-Path -LiteralPath $Ogr2OgrPath)) {
  throw "ogr2ogr.exe was not found at '$Ogr2OgrPath'. Pass -Ogr2OgrPath with your QGIS ogr2ogr.exe path."
}

if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Could not find backend\.env at '$envPath'."
}

function Get-DotEnvValue {
  param(
    [string]$Path,
    [string]$Key
  )

  $line = Get-Content -LiteralPath $Path |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=" } |
    Select-Object -First 1

  if (-not $line) {
    return $null
  }

  $value = $line -replace "^\s*$([regex]::Escape($Key))\s*=\s*", ""
  return $value.Trim().Trim('"').Trim("'")
}

function Convert-DatabaseUrlToOgrPg {
  param([string]$DatabaseUrl)

  $uri = [System.Uri]$DatabaseUrl
  $userInfo = $uri.UserInfo.Split(":", 2)
  $user = [System.Uri]::UnescapeDataString($userInfo[0])
  $password = if ($userInfo.Count -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { "" }
  $dbname = $uri.AbsolutePath.TrimStart("/")
  $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
  $sslMode = "require"

  if ($uri.Query) {
    $queryText = $uri.Query.TrimStart("?")
    foreach ($pair in $queryText.Split("&")) {
      $parts = $pair.Split("=", 2)
      if ($parts.Count -eq 2 -and $parts[0] -eq "sslmode") {
        $sslMode = [System.Uri]::UnescapeDataString($parts[1])
      }
    }
  }

  if ($sslMode -eq "no-verify") {
    $sslMode = "require"
  }

  return "PG:host=$($uri.Host) port=$port dbname=$dbname user=$user password=$password sslmode=$sslMode"
}

$databaseUrl = Get-DotEnvValue -Path $envPath -Key "DATABASE_URL"
if (-not $databaseUrl) {
  throw "DATABASE_URL is missing from backend\.env."
}

$pgConnection = Convert-DatabaseUrlToOgrPg -DatabaseUrl $databaseUrl
$modeFlag = if ($Append) { "-append" } else { "-overwrite" }

$imports = @(
  @{
    File = "osm_activity_scoring.geojson"
    Table = "public.osm_activity_scoring"
    GeometryType = "POINT"
  },
  @{
    File = "osm_noise_scoring.geojson"
    Table = "public.osm_noise_scoring"
    GeometryType = "LINESTRING"
  },
  @{
    File = "osm_transport_comfort_scoring.geojson"
    Table = "public.osm_transport_comfort_scoring"
    GeometryType = "POINT"
  }
)

foreach ($item in $imports) {
  $inputFile = Join-Path $dataDir $item.File
  if (-not (Test-Path -LiteralPath $inputFile)) {
    throw "Missing processed file: '$inputFile'. Run prepare_osm_scoring_data.js first."
  }

  Write-Host "Importing $($item.File) -> $($item.Table)"

  & $Ogr2OgrPath `
    -f "PostgreSQL" `
    $pgConnection `
    $inputFile `
    $modeFlag `
    -nln $item.Table `
    -nlt $item.GeometryType `
    -lco GEOMETRY_NAME=geom `
    -lco FID=id `
    -lco SPATIAL_INDEX=GIST `
    -a_srs EPSG:4326

  if ($LASTEXITCODE -ne 0) {
    throw "ogr2ogr failed while importing $($item.File) with exit code $LASTEXITCODE."
  }
}

Write-Host "Done. Imported OSM scoring tables into PostGIS."
