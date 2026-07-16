$headers = @{
    "Content-Type" = "application/json"
    "apikey" = "ik_e27a4d9a33a311562c1a5776e51c4368"
}

# Try different URL patterns
$urls = @(
    "https://yegakpm9.us-east.insforge.app",
    "https://app.insforge.dev/api/yegakpm9",
    "https://api.insforge.dev/yegakpm9",
    "https://yegakpm9.insforge.app",
    "https://insforge.app/api/yegakpm9"
)

foreach ($url in $urls) {
    try {
        $response = Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -TimeoutSec 5
        Write-Host "$url -> $($response.StatusCode) [$($response.Headers['Content-Type'])]"
    } catch {
        $code = $_.Exception.Response.StatusCode.Value__
        Write-Host "$url -> $code"
    }
}
