$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$statePath = Join-Path $projectRoot '.data/private-preview/state.json'
$statusPath = Join-Path $projectRoot '.data/private-preview/awake-state.json'
$initial = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$expiry = [DateTimeOffset]::Parse($initial.expiresAt)
if (!$initial.running -or $expiry -le [DateTimeOffset]::UtcNow -or $expiry -gt [DateTimeOffset]::UtcNow.AddDays(31)) {
    throw 'An active, bounded preview is required before keeping this laptop awake.'
}

# A process-scoped Windows power request; no power-plan or startup settings change.
# Keep the display free to turn off and allow normal sleep on battery power.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HireLensPreviewPower {
    [StructLayout(LayoutKind.Sequential)]
    public struct PowerStatus {
        public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag;
        public uint BatteryLifeTime, BatteryFullLifeTime;
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetSystemPowerStatus(out PowerStatus status);
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint flags);
}
'@
$mutex = New-Object System.Threading.Mutex($false, 'Local\HireLensScopedPreviewAwake')
$ownsMutex = $false
$active = $false
try {
    $ownsMutex = $mutex.WaitOne(0)
    if (!$ownsMutex) { throw 'A preview keep-awake helper is already running.' }
    while ([DateTimeOffset]::UtcNow -lt $expiry) {
        $current = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        if (!$current.running -or $current.pid -ne $initial.pid -or $current.url -ne $initial.url -or $current.expiresAt -ne $initial.expiresAt) { break }
        if (!(Get-Process -Id $initial.pid -ErrorAction SilentlyContinue)) { break }
        $power = New-Object HireLensPreviewPower+PowerStatus
        if (![HireLensPreviewPower]::GetSystemPowerStatus([ref]$power)) { throw 'Windows power status is unavailable.' }
        $onMains = $power.ACLineStatus -eq 1
        $flags = [uint32]2147483648 # ES_CONTINUOUS clears any earlier request.
        if ($onMains) { $flags = [uint32]2147483649 } # Plus ES_SYSTEM_REQUIRED.
        if ([HireLensPreviewPower]::SetThreadExecutionState($flags) -eq 0) { throw 'Windows rejected the temporary keep-awake request.' }
        $active = $onMains
        @{ running = $true; pid = $PID; previewPid = $initial.pid; url = $initial.url; activeOnMains = $active; expiresAt = $initial.expiresAt; checkedAt = [DateTimeOffset]::UtcNow.ToString('o') } |
            ConvertTo-Json | Set-Content -LiteralPath $statusPath
        Start-Sleep -Seconds 20
    }
} finally {
    if ($ownsMutex) {
        [void][HireLensPreviewPower]::SetThreadExecutionState([uint32]2147483648)
        @{ running = $false; pid = $PID; activeOnMains = $false; expiresAt = $initial.expiresAt; stoppedAt = [DateTimeOffset]::UtcNow.ToString('o') } |
            ConvertTo-Json | Set-Content -LiteralPath $statusPath
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}
