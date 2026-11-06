param([switch]$Sensor)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
$portableNode = Join-Path $projectRoot '.tools\node-v22.14.0-win-x64\node.exe'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $portableNode }
$vitePath = Join-Path $projectRoot 'frontend\node_modules\vite\bin\vite.js'
$logDirectory = Join-Path $projectRoot '.tools'

if (!(Test-Path -LiteralPath $pythonPath)) { throw 'Create the Python virtual environment and install backend requirements first. See README.md.' }
if (!(Test-Path -LiteralPath $nodePath)) { throw 'Install Node.js 22.12+ first. See README.md.' }
if (!(Test-Path -LiteralPath $vitePath)) { throw 'Run npm install in the frontend directory first. See README.md.' }
foreach ($port in @(8000, 5173)) {
    $portProbe = New-Object System.Net.Sockets.TcpClient
    $portInUse = $false
    try {
        $portProbe.Connect('127.0.0.1', $port)
        $portInUse = $true
    } catch [System.Net.Sockets.SocketException] {
        # Connection refused means the local port is available.
    } finally {
        $portProbe.Dispose()
    }
    if ($portInUse) {
        throw "Port $port is already in use. Stop the existing server before launching ATLS."
    }
}
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$previousSimulation = $env:ATLS_SIMULATION
$backendProcess = $null
$frontendProcess = $null
try {
    $env:ATLS_SIMULATION = if ($Sensor) { 'false' } else { 'true' }
    $backendProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8000') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'backend.log') -RedirectStandardError (Join-Path $logDirectory 'backend-error.log')
    $frontendProcess = Start-Process -FilePath $nodePath -ArgumentList @(('"{0}"' -f $vitePath), '--configLoader', 'native', '--host', '127.0.0.1', '--port', '5173', '--strictPort') -WorkingDirectory (Join-Path $projectRoot 'frontend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory 'frontend.log') -RedirectStandardError (Join-Path $logDirectory 'frontend-error.log')
    Write-Host 'ATLS dashboard: http://127.0.0.1:5173' -ForegroundColor Green
    Write-Host 'API documentation: http://127.0.0.1:8000/docs'
    Write-Host 'Keep this terminal open. Press Ctrl+C to stop both servers.'
    while (!$backendProcess.HasExited -and !$frontendProcess.HasExited) {
        Start-Sleep -Seconds 1
        $backendProcess.Refresh()
        $frontendProcess.Refresh()
    }
    throw 'A server stopped. Check the .tools log files for details.'
} finally {
    if ($frontendProcess -and !$frontendProcess.HasExited) { Stop-Process -Id $frontendProcess.Id -ErrorAction SilentlyContinue }
    if ($backendProcess -and !$backendProcess.HasExited) { Stop-Process -Id $backendProcess.Id -ErrorAction SilentlyContinue }
    $env:ATLS_SIMULATION = $previousSimulation
}
