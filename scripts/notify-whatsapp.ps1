# Full flow: check WiFi -> start dev server + Cloudflare tunnel -> WhatsApp the link
# to the "tim mtn unlimit" chat. Run automatically at the start of every session
# (see CLAUDE.md Session Start Rule).
#
# Two phases, meant to be driven by Claude (not run blind end-to-end):
#   -Phase Open   : WiFi check, start dev server + tunnel, launch/focus WhatsApp,
#                   search "tim mtn unlimit", open the chat, screenshot, STOP.
#                   Prints the tunnel URL as the last line of output.
#   -Phase Send    : click the message box, type the link, send, screenshot.
#                   Requires -TunnelUrl.
# Claude must read the screenshot from Phase Open and visually confirm the chat
# header reads "Tim mtn New Unlimit" before calling Phase Send. This caught a real
# mis-send to a different contact during a cold WhatsApp launch - never skip it.

param(
    [ValidateSet('Open', 'Send')]
    [string]$Phase = 'Open',
    [string]$TunnelUrl
)

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
$ProjectRoot = Split-Path -Parent $ScriptDir
$LogDir = Join-Path $ProjectRoot '.tunnel-logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$RunLog = Join-Path $LogDir 'notify-whatsapp.log'
$VerifyOpenPath = Join-Path $LogDir 'wa-verify-open.png'
$VerifySentPath = Join-Path $LogDir 'wa-verify-sent.png'

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$Phase] $msg"
    Add-Content -Path $RunLog -Value $line
    Write-Output $msg
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WaWin32 {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern IntPtr PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Auto)] public static extern IntPtr LoadKeyboardLayout(string pwszKLID, uint Flags);
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
[WaWin32]::SetProcessDPIAware() | Out-Null

function Get-WaProcess {
    # WhatsApp Desktop is a UWP shell (WhatsApp.Root, an invisible frame window titled
    # "WhatsApp") hosting the real, visible, clickable content in msedgewebview2
    # (titled "(1) WhatsApp" / "WhatsApp"). Must target msedgewebview2 specifically -
    # matching on title alone is ambiguous and can silently grab the invisible frame.
    return Get-Process -Name msedgewebview2 -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -like "*WhatsApp*" } | Select-Object -First 1
}

function Set-EnglishInput($waProc) {
    # User keeps a Chinese IME active on this machine, which can intercept/garble
    # SendKeys keystrokes before they reach the target field (confirmed 2026-09-01 and
    # again 2026-09-08 - it swallowed a WhatsApp search and opened the wrong chat).
    # WM_INPUTLANGCHANGEREQUEST forces the target window's thread to plain English
    # (US) input regardless of whatever IME/layout the taskbar currently shows -
    # more reliable than guessing the user's configured IME toggle hotkey.
    $hkl = [WaWin32]::LoadKeyboardLayout("00000409", 0)
    [WaWin32]::PostMessage($waProc.MainWindowHandle, 0x0050, [IntPtr]::Zero, $hkl) | Out-Null
    Start-Sleep -Milliseconds 300
}

function Click-At($x, $y) {
    [WaWin32]::SetCursorPos($x, $y) | Out-Null
    Start-Sleep -Milliseconds 150
    [WaWin32]::mouse_event(0x0002, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 100
    [WaWin32]::mouse_event(0x0004, 0, 0, 0, 0)
    Start-Sleep -Milliseconds 250
}

function Save-FullScreenshot($path) {
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

function Get-FocusedWaRect($waProc) {
    [WaWin32]::ShowWindow($waProc.MainWindowHandle, 9) | Out-Null
    # Windows blocks SetForegroundWindow from a process that doesn't currently own
    # the foreground (this PowerShell process is freshly spawned each run, so it
    # never does) - the calls below silently no-op in that case, which is why the
    # window sometimes never came to front even though every subsequent click
    # coordinate was correct. A synthetic ALT tap resets that lockout (documented
    # Windows behavior), and a real mouse click is never subject to it at all -
    # do both as belt-and-braces instead of trusting SetForegroundWindow alone.
    [WaWin32]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero) # ALT down
    [WaWin32]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero) # ALT up (KEYEVENTF_KEYUP)
    [WaWin32]::SetForegroundWindow($waProc.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 500
    $rect = New-Object WaWin32+RECT
    [WaWin32]::GetWindowRect($waProc.MainWindowHandle, [ref]$rect) | Out-Null
    if ([WaWin32]::GetForegroundWindow() -ne $waProc.MainWindowHandle) {
        # Still not foreground - a real mouse click on the window is never subject
        # to the foreground-lock restriction, so use one on its title bar as a
        # guaranteed fallback.
        [WaWin32]::SetCursorPos($rect.Left + 150, $rect.Top + 10) | Out-Null
        Start-Sleep -Milliseconds 150
        [WaWin32]::mouse_event(0x0002, 0, 0, 0, 0)
        Start-Sleep -Milliseconds 100
        [WaWin32]::mouse_event(0x0004, 0, 0, 0, 0)
        Start-Sleep -Milliseconds 500
    }
    return $rect
}

if ($Phase -eq 'Open') {
    # ---------- WiFi check ----------
    try {
        $online = Test-Connection -ComputerName 1.1.1.1 -Count 1 -Quiet -ErrorAction Stop
    } catch {
        $online = $false
    }
    if (-not $online) {
        Log "WiFi offline - skipping dev server, tunnel, and WhatsApp notification."
        exit 0
    }
    Log "WiFi online."

    # ---------- dev server + cloudflared tunnel ----------
    $tunnelUrl = & (Join-Path $ScriptDir 'start-dev-tunnel.ps1')
    $tunnelUrl = ($tunnelUrl | Select-Object -Last 1).Trim()
    if ($tunnelUrl -notmatch '^https://.*\.trycloudflare\.com$') {
        Log "Failed to start dev server / tunnel (got: $tunnelUrl). Aborting."
        exit 1
    }
    Log "Tunnel ready: $tunnelUrl"

    # ---------- launch/focus WhatsApp ----------
    $waProc = Get-WaProcess
    $coldLaunch = $false
    if (-not $waProc) {
        $coldLaunch = $true
        Log "Launching WhatsApp Desktop (cold launch)..."
        $pkg = Get-AppxPackage -Name "5319275A.WhatsAppDesktop" -ErrorAction SilentlyContinue
        if (-not $pkg) {
            Log "WhatsApp Desktop app not found. Aborting."
            exit 1
        }
        $manifest = Get-AppxPackageManifest -Package $pkg.PackageFullName
        $appId = $manifest.Package.Applications.Application.Id
        explorer.exe "shell:AppsFolder\$($pkg.PackageFamilyName)!$appId"
        $waited = 0
        while ($waited -lt 20 -and -not $waProc) {
            Start-Sleep -Seconds 1
            $waited++
            $waProc = Get-WaProcess
        }
        if (-not $waProc) {
            Log "WhatsApp window did not appear. Aborting."
            exit 1
        }
        # Cold launch needs real time to finish rendering/becoming interactive -
        # this is exactly what caused a mis-send to the wrong chat previously.
        Log "Window appeared, waiting for cold-launch stabilization..."
        Start-Sleep -Seconds 6
    }

    Get-FocusedWaRect $waProc | Out-Null
    Set-EnglishInput $waProc

    # Keyboard-driven instead of coordinate-clicking the search box: Ctrl+F reliably
    # focuses WhatsApp's search regardless of window geometry (mouse clicks depend on
    # measuring the window rect correctly, which broke when WhatsApp was already open
    # in a different state - two blind clicks on the search box landed on nothing and
    # every subsequent step silently no-op'd). Down+Enter then selects the top search
    # result instead of clicking a "Recent searches" position, which assumed the target
    # chat was always pinned at slot 1.
    [System.Windows.Forms.SendKeys]::SendWait("^f")
    Start-Sleep -Milliseconds ($(if ($coldLaunch) { 800 } else { 400 }))
    [System.Windows.Forms.SendKeys]::SendWait("tim mtn unlimit")
    Start-Sleep -Milliseconds ($(if ($coldLaunch) { 1200 } else { 700 }))
    [System.Windows.Forms.SendKeys]::SendWait("{DOWN}")
    Start-Sleep -Milliseconds 200
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Milliseconds ($(if ($coldLaunch) { 2000 } else { 1200 }))

    Save-FullScreenshot $VerifyOpenPath
    Log "Chat search/open done. Screenshot: $VerifyOpenPath. Claude must confirm the open chat header before Phase Send."
    Write-Output $tunnelUrl
    exit 0
}

if ($Phase -eq 'Send') {
    if (-not $TunnelUrl) {
        Log "Phase Send requires -TunnelUrl. Aborting."
        exit 1
    }
    $waProc = Get-WaProcess
    if (-not $waProc) {
        Log "WhatsApp window not found for Phase Send. Aborting."
        exit 1
    }
    $rect = Get-FocusedWaRect $waProc
    $winW = $rect.Right - $rect.Left
    $winH = $rect.Bottom - $rect.Top
    Set-EnglishInput $waProc

    # Click message box, clear it, type the link, send
    Click-At ($rect.Left + [int]($winW * 0.702)) ($rect.Top + [int]($winH * 0.946))
    Start-Sleep -Milliseconds 400
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 150
    [System.Windows.Forms.SendKeys]::SendWait("{DEL}")
    Start-Sleep -Milliseconds 150
    $msg = "Localhost tunnel: $TunnelUrl"
    [System.Windows.Forms.SendKeys]::SendWait($msg)
    Start-Sleep -Milliseconds 500
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Milliseconds 800

    try { Save-FullScreenshot $VerifySentPath } catch {}
    Log "Sent tunnel link to WhatsApp: $TunnelUrl"
    exit 0
}
