$headers = @{
    "Content-Type" = "application/json"
    "apikey" = "ik_e27a4d9a33a311562c1a5776e51c4368"
}

# The database is at yegakpm9.us-east.database.insforge.app
# Try API at similar patterns
$urls = @(
    "https://yegakpm9.us-east.api.insforge.app",
    "https://yegakpm9.us-east.functions.insforge.app",
    "https://yegakpm9.us-east.auth.insforge.app",
    "https://yegakpm9.us-east.storage.insforge.app",
    "https://yegakpm9.us-east.gateway.insforge.app"
)

foreach ($url in $urls) {
    try {
        $response = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -TimeoutSec 5
        Write-Host "$url -> $($response.StatusCode) [$($response.Headers['Content-Type'])]"
        Write-Host "  Body: $($response.Content.Substring(0, [Math]::Min(200, $response.Content.Length)))"
    } catch {
        $code = $_.Exception.Response.StatusCode.Value__
        Write-Host "$url -> $code"
    }
}
