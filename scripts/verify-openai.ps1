$baseUrl = if ($env:API_BASE_URL) { $env:API_BASE_URL } else { 'http://localhost:3000' }
$apiKey = if ($env:API_KEY) { $env:API_KEY } elseif ($env:BUN_AI_API_KEY) { $env:BUN_AI_API_KEY } else { $env:OPENAI_API_KEY }
$timeoutSeconds = if ($env:API_TIMEOUT_SECONDS) { [int]$env:API_TIMEOUT_SECONDS } else { 60 }

if (-not $apiKey) {
  Write-Error 'API_KEY or OPENAI_API_KEY is required to run the verification script.'
  exit 1
}

$model = 'mi-modelo-chat'
if ($env:MODELS) {
  $model = $env:MODELS.Split(',')[0].Trim()
}

function WriteUtf8NoBom([string]$path, [string]$content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

Write-Host "GET $baseUrl/v1/models"
curl.exe -s --max-time $timeoutSeconds -H "Authorization: Bearer $apiKey" "$baseUrl/v1/models"
Write-Host "`n"

$body = @"
{
  "model": "$model",
  "messages": [
    { "role": "user", "content": "Hola, responde con una frase corta." }
  ]
}
"@

$tempDir = [System.IO.Path]::GetTempPath()
$bodyPath = Join-Path $tempDir 'bun-ai-api-chat.json'
WriteUtf8NoBom $bodyPath $body

Write-Host "POST $baseUrl/v1/chat/completions"
curl.exe -s --max-time $timeoutSeconds -H "Authorization: Bearer $apiKey" -H "Content-Type: application/json" --data-binary "@$bodyPath" "$baseUrl/v1/chat/completions"
Write-Host "`n"

$bodyStream = @"
{
  "model": "$model",
  "messages": [
    { "role": "user", "content": "Hola, responde con una frase corta." }
  ],
  "stream": true
}
"@

$bodyStreamPath = Join-Path $tempDir 'bun-ai-api-chat-stream.json'
WriteUtf8NoBom $bodyStreamPath $bodyStream

Write-Host "POST $baseUrl/v1/chat/completions (stream)"
curl.exe -N --max-time $timeoutSeconds -H "Authorization: Bearer $apiKey" -H "Content-Type: application/json" --data-binary "@$bodyStreamPath" "$baseUrl/v1/chat/completions"
Write-Host "`n"

Remove-Item $bodyPath, $bodyStreamPath -ErrorAction SilentlyContinue
