$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
New-Item -ItemType Directory -Force -Path '.data/runtime' | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
function Start-HireLensService($Name, $Port, $Executable, $Arguments) {
    if (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue) {
        Write-Output "$Name already has a listener on port $Port; left running."
        return
    }
    $serviceProcess = Start-Process -FilePath $Executable -ArgumentList $Arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput ".data/runtime/$Name-$stamp.out.log" -RedirectStandardError ".data/runtime/$Name-$stamp.err.log" -PassThru
    $serviceProcess.Id | Set-Content ".data/runtime/$Name.pid"
    Write-Output "Started $Name (process $($serviceProcess.Id))."
}
$nodePath = (Get-Command node).Source
Start-HireLensService 'mongo' 27017 $nodePath 'node_modules/tsx/dist/cli.mjs scripts/local-db.ts'
if (Test-Path '.data/ollama/runtime/ollama.exe') {
    $env:OLLAMA_HOST = '127.0.0.1:11434'
    $env:OLLAMA_MODELS = Join-Path $projectRoot '.data/ollama/models'
    $env:OLLAMA_CONTEXT_LENGTH = '8192'
    $env:OLLAMA_NUM_PARALLEL = '1'
    Start-HireLensService 'ollama' 11434 (Join-Path $projectRoot '.data/ollama/runtime/ollama.exe') 'serve'
}
if (Test-Path '.data/speech/venv/Scripts/python.exe') {
    $env:HF_HOME = Join-Path $projectRoot '.data/speech/cache'
    $env:HF_HUB_DISABLE_SYMLINKS_WARNING = '1'
    Start-HireLensService 'speech' 8765 (Join-Path $projectRoot '.data/speech/venv/Scripts/python.exe') '-I scripts/speech-server.py'
    if (Test-Path '.data/diarization/models/nemo_en_titanet_small.onnx') {
        Start-HireLensService 'diarization' 8766 (Join-Path $projectRoot '.data/speech/venv/Scripts/python.exe') 'scripts/diarization-server.py'
    }
}
if (Test-Path '.data/turn/runtime/turnserver') {
    # The helper reads dotenv/environment precedence and skips managed providers,
    # even if an old TURN_LOCAL_DEV=true remains from an earlier local test.
    & $nodePath 'node_modules/tsx/dist/cli.mjs' 'scripts/local-turn.ts' '--if-enabled'
    if ($LASTEXITCODE -ne 0) { Write-Warning 'The local test relay did not start. The interview UI will still open; check Connection before testing video.' }
}
# Wait for Mongo without resetting or re-seeding the existing data.
$ready = $false
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    if (Get-NetTCPConnection -State Listen -LocalPort 27017 -ErrorAction SilentlyContinue) { $ready = $true; break }
    Start-Sleep -Milliseconds 1000
}
if (!$ready) { throw 'MongoDB did not start. Inspect .data/runtime/mongo-*.err.log.' }
Start-HireLensService 'api' 4000 $nodePath 'node_modules/tsx/dist/cli.mjs watch server/index.ts'
Start-HireLensService 'web' 5173 $nodePath 'node_modules/vite/bin/vite.js --host 127.0.0.1'
foreach ($servicePort in @(4000, 5173)) {
    $listening = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Get-NetTCPConnection -State Listen -LocalPort $servicePort -ErrorAction SilentlyContinue) { $listening = $true; break }
        Start-Sleep -Milliseconds 1000
    }
    if (!$listening) { throw "The service on port $servicePort did not become ready. Inspect .data/runtime logs." }
}
Write-Output 'Open http://localhost:5173/. Provider setup is documented in docs/LOCAL-AI.md.'
