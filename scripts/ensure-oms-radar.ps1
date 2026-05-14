$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonRoot = if ($env:SHOPHUYVAN_PYTHON_AUTOMATION_DIR) { $env:SHOPHUYVAN_PYTHON_AUTOMATION_DIR } else { "E:\shophuyvan-python-automation" }
$runtimeRoot = if ($env:SHOPHUYVAN_RUNTIME_DIR) { $env:SHOPHUYVAN_RUNTIME_DIR } else { "E:\shophuyvan-runtime" }
$helperScript = Join-Path $pythonRoot "oms_python\features\local_helper\server.py"
$radarScript = Join-Path $pythonRoot "oms_python\features\radar\start_autostart.py"
$radarDir = Split-Path -Parent $radarScript
$logDir = Join-Path $runtimeRoot "logs"
$helperOutLog = Join-Path $logDir "bot-radar-helper-out.log"
$helperErrLog = Join-Path $logDir "bot-radar-helper-err.log"
$outLog = Join-Path $logDir "bot-radar-out.log"
$errLog = Join-Path $logDir "bot-radar-err.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (!(Test-Path -LiteralPath $radarScript)) {
  throw "Cannot find Radar script: $radarScript"
}

$python = (Get-Command python -ErrorAction Stop).Source

function Get-PythonScriptProcess($scriptName) {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -like "python*" -and
      $_.CommandLine -and
      $_.CommandLine -like "*$scriptName*"
    }
}

function Start-PythonScriptHidden($scriptPath, $workingDir, $stdoutLog, $stderrLog) {
  Start-Process -FilePath $python `
    -ArgumentList @("`"$scriptPath`"") `
    -WorkingDirectory $workingDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog
}

if (Test-Path -LiteralPath $helperScript) {
  $helperRunning = Get-PythonScriptProcess "features\local_helper\server.py"
  if (!$helperRunning) {
    Start-PythonScriptHidden $helperScript $pythonRoot $helperOutLog $helperErrLog
    Start-Sleep -Seconds 1
  }
}

$running = Get-PythonScriptProcess "features\radar\start_autostart.py"

if ($running) {
  $running | Select-Object ProcessId, CommandLine
  return
}

Start-PythonScriptHidden $radarScript $radarDir $outLog $errLog

Start-Sleep -Seconds 3
Get-PythonScriptProcess "features\radar\start_autostart.py" |
  Select-Object ProcessId, CommandLine
