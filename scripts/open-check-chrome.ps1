param(
  [string]$Url = "https://shophuyvan-analytics.nghiemchihuy.workers.dev/pages/profit-dashboard.html",
  [int]$Port = 9333,
  [switch]$Headless
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$profileDir = Join-Path $repoRoot ".codex-chrome-profile"
$chromeCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)

$chrome = $chromeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $chrome) {
  throw "Không tìm thấy Chrome/Edge trên máy này."
}

New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$args = @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$profileDir",
  "--profile-directory=CodexCheck",
  "--window-size=1440,1000",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-popup-blocking"
)

if ($Headless) {
  $args += "--headless=new"
  $args += "--disable-gpu"
}

$args += $Url

Start-Process -FilePath $chrome -ArgumentList $args -WindowStyle Hidden | Out-Null

[pscustomobject]@{
  chrome = $chrome
  profile = $profileDir
  port = $Port
  url = $Url
  devtools = "http://127.0.0.1:$Port/json/list"
}
