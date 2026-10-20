$ErrorActionPreference = 'Stop'
$providerProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $providerProjectRoot
Write-Host 'HireLens provider setup (preparation only)'
Write-Host 'Have the provider account/server ready first. This prompt does not create accounts or enable delivery.'
Write-Host 'Secrets are hidden and staged in ignored .data/provider-setup; the live .env and Gmail stay unchanged.'
Write-Host '1 Judge0 | 2 Public Coturn | 3 Twilio TURN | 4 Twilio SMS | 5 Twilio SMS + TURN | 6 Cashfree CIN'
$providerChoice = Read-Host 'Choose 1-6, or Enter to cancel'
$providerService = switch ($providerChoice) {
    '1' { 'judge0' }
    '2' { 'turn-hmac' }
    '3' { 'twilio-turn' }
    '4' { 'twilio-sms' }
    '5' { 'twilio-both' }
    '6' { 'cashfree' }
    default { $null }
}
if (-not $providerService) { Write-Host 'Cancelled. Nothing changed.'; exit 0 }

function Read-ProviderSecret([string]$Prompt) {
    $providerSecure = Read-Host $Prompt -AsSecureString
    $providerPointer = [IntPtr]::Zero
    try {
        $providerPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($providerSecure)
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($providerPointer)
    } finally {
        if ($providerPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($providerPointer) }
        $providerSecure.Dispose()
    }
}

$providerInput = @{ service = $providerService }
$providerPayload = $null
try {
    if ($providerService -eq 'judge0') {
        $providerInput.JUDGE0_URL = Read-Host 'Private Judge0 HTTPS base URL (no key in URL)'
        $providerInput.JUDGE0_API_KEY = Read-ProviderSecret 'Judge0 API key (hidden)'
        $providerInput.JUDGE0_AUTH_HEADER = Read-Host 'Auth header: Enter for X-Auth-Token, or X-RapidAPI-Key'
        if ($providerInput.JUDGE0_AUTH_HEADER -eq 'X-RapidAPI-Key') {
            $providerInput.JUDGE0_RAPIDAPI_HOST = Read-Host 'RapidAPI host from provider dashboard (no https://)'
        }
    } elseif ($providerService -eq 'turn-hmac') {
        $providerInput.TURN_URL = Read-Host 'Public turn:/turns: URLs with ports, separated by commas'
        $providerInput.TURN_SECRET = Read-ProviderSecret 'Coturn static-auth-secret (hidden, at least 32 characters)'
    } elseif ($providerService.StartsWith('twilio-')) {
        Write-Host 'Use a Twilio API key with access to the selected service. The SMS and TURN connectors share these credentials.'
        $providerInput.TWILIO_ACCOUNT_SID = Read-Host 'Twilio Account SID (AC...)'
        $providerInput.TWILIO_API_KEY_SID = Read-Host 'Twilio API Key SID (SK...)'
        $providerInput.TWILIO_API_KEY_SECRET = Read-ProviderSecret 'Twilio API Key secret (hidden)'
        if ($providerService -ne 'twilio-turn') {
            $providerInput.TWILIO_MESSAGING_SERVICE_SID = Read-Host 'Messaging Service SID (MG...), or Enter to use a sender'
            if (-not $providerInput.TWILIO_MESSAGING_SERVICE_SID) {
                $providerInput.TWILIO_FROM = Read-Host 'Authorized SMS sender (international +number or registered sender)'
            }
        }
    } else {
        Write-Host 'Cashfree Secure ID supports active Indian companies with a CIN. Sandbox cannot verify a real company.'
        $providerInput.CASHFREE_ENVIRONMENT = Read-Host 'Environment: production or sandbox'
        $providerInput.CASHFREE_CLIENT_ID = Read-ProviderSecret 'Cashfree client ID (hidden)'
        $providerInput.CASHFREE_CLIENT_SECRET = Read-ProviderSecret 'Cashfree client secret (hidden)'
        $providerPublicKeyPath = Read-Host 'Downloaded RSA public PEM file path, or Enter if server IPv4 is allowlisted'
        if ($providerPublicKeyPath) {
            $providerKeyFile = Get-Item -LiteralPath $providerPublicKeyPath
            if ($providerKeyFile.PSIsContainer -or $providerKeyFile.Length -gt 16384) { throw 'Choose the downloaded RSA public PEM file.' }
            $providerInput.CASHFREE_PUBLIC_KEY = (Get-Content -LiteralPath $providerPublicKeyPath -Raw).Trim() -replace '\r?\n', '\n'
        } else {
            $providerInput.CASHFREE_IP_ALLOWLIST_CONFIRMED = Read-Host 'Is the API server outbound IPv4 allowlisted in Cashfree? Type yes'
        }
    }
    $providerPayload = $providerInput | ConvertTo-Json -Compress
    # Credentials travel over stdin only; never put them into process arguments or print the payload.
    $providerPayload | & (Get-Command node).Source 'node_modules/tsx/dist/cli.mjs' 'scripts/setup-providers.ts'
    $providerExitCode = $LASTEXITCODE
} catch {
    Write-Host 'Setup stopped. Check the chosen file and input; live settings were not changed.'
    $providerExitCode = 1
} finally {
    $providerInput.Clear()
    $providerPayload = $null
}
exit $providerExitCode
