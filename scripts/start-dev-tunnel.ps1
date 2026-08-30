# Starts the Vite dev server (if not already running) and a Cloudflare quick tunnel,
# then prints the public tunnel URL. Used by scripts/notify-whatsapp.ps1.

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DevPort = 3000
$LogDir = Join-Path $ProjectRoot '.tunnel-logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$CloudflaredOut = Join-Path $LogDir 'cloudflared.out.log'
$CloudflaredErr = Join-Path $LogDir 'cloudflared.err.log'
$DevLog = Join-Path $LogDir 'vite.log'

function Test-WifiOnline {
    try {
        return Test-Connection -ComputerName 1.1.1.1 -Count 1 -Quiet -ErrorAction Stop
    } catch {
        return $false
    }
}

if (-not (Test-WifiOnline)) {
    Write-Output "OFFLINE"
    exit 1
}

# Start dev server if the port isn't already listening
$portInUse = Get-NetTCPConnection -LocalPort $DevPort -State Listen -ErrorAction SilentlyContinue
if (-not $portInUse) {
    Remove-Item $DevLog -ErrorAction SilentlyContinue
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"$ProjectRoot`" && npm run dev > `"$DevLog`" 2>&1" -WindowStyle Hidden
    $waited = 0
    while ($waited -lt 30) {
        Start-Sleep -Seconds 1
        $waited++
        $portInUse = Get-NetTCPConnection -LocalPort $DevPort -State Listen -ErrorAction SilentlyContinue
        if ($portInUse) { break }
    }
    if (-not $portInUse) {
        Write-Output "DEVSERVER_FAILED"
        exit 1
    }
}

# Start a fresh cloudflared quick tunnel (always new, so we always get a URL to report)
Remove-Item $CloudflaredOut, $CloudflaredErr -ErrorAction SilentlyContinue
Start-Process -FilePath "C:\Program Files (x86)\cloudflared\cloudflared.exe" `
    -ArgumentList "tunnel --url http://localhost:$DevPort" `
    -WindowStyle Hidden `
    -RedirectStandardOutput $CloudflaredOut `
    -RedirectStandardError $CloudflaredErr

$tunnelUrl = $null
$waited = 0
while ($waited -lt 30 -and -not $tunnelUrl) {
    Start-Sleep -Seconds 1
    $waited++
    foreach ($f in @($CloudflaredErr, $CloudflaredOut)) {
        if (-not $tunnelUrl -and (Test-Path $f)) {
            $content = Get-Content $f -Raw -ErrorAction SilentlyContinue
            if ($content -match 'https://[a-zA-Z0-9\-]+\.trycloudflare\.com') {
                $tunnelUrl = $matches[0]
            }
        }
    }
}

if ($tunnelUrl) {
    Write-Output $tunnelUrl
} else {
    Write-Output "TUNNEL_FAILED"
    exit 1
}
