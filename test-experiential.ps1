$envFile = Get-Content -LiteralPath '.env.local'
foreach ($line in $envFile) {
    if ($line -match '^([^#][^=]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim())
    }
}

if ([string]::IsNullOrWhiteSpace($env:EXPLABS_API_KEY)) {
    throw 'EXPLABS_API_KEY is not set in .env.local'
}

$body = @{
    model = 'gpt-6-astra'
    messages = @(
        @{ role = 'user'; content = 'Reply with exactly: Experiential gateway test passed.' }
    )
    stream = $false
} | ConvertTo-Json -Depth 5

$response = $null
try {
    $response = Invoke-RestMethod `
        -Method Post `
        -Uri 'https://api.experientiallabs.ai/v1/chat/completions' `
        -Headers @{ Authorization = "Bearer $env:EXPLABS_API_KEY"; 'Content-Type' = 'application/json' } `
        -Body $body
}
catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $errorBody = $reader.ReadToEnd()
    throw "Experiential request failed with HTTP ${statusCode}: $errorBody"
}

[ordered]@{
    reply = $response.choices[0].message.content
    usage = $response.usage
} | ConvertTo-Json -Depth 5
