$ErrorActionPreference = 'Stop'
$gmailProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $gmailProjectRoot
Write-Host 'HireLens Gmail sender setup'
Write-Host 'Use a Google App Password created for HireLens, not your normal Google password.'
Write-Host 'The password stays hidden and is sent only to Gmail for authentication, then saved in this project .env.'
Write-Host 'This command sends no emails and keeps delivery previews enabled.'
$gmailAddress = Read-Host 'Sender Gmail address'
$gmailSecurePassword = Read-Host '16-letter Google App Password (hidden)' -AsSecureString
$gmailPointer = [IntPtr]::Zero
$gmailPayload = $null
$gmailPlainPassword = $null
try {
    $gmailPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($gmailSecurePassword)
    $gmailPlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($gmailPointer)
    $gmailPayload = @{ email = $gmailAddress; appPassword = $gmailPlainPassword } | ConvertTo-Json -Compress
    # Credentials go through stdin, never command arguments or transcript output.
    $gmailPayload | & (Get-Command node).Source 'node_modules/tsx/dist/cli.mjs' 'scripts/setup-gmail.ts'
    $gmailExitCode = $LASTEXITCODE
} finally {
    if ($gmailPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($gmailPointer) }
    $gmailSecurePassword.Dispose()
    $gmailPlainPassword = $null
    $gmailPayload = $null
}
exit $gmailExitCode
