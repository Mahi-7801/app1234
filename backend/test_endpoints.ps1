$headers = @{
    "Content-Type" = "application/json"
    "apikey" = "ik_e27a4d9a33a311562c1a5776e51c4368"
}
$body = '{"email":"test12345@test.com","password":"test123"}'

$urls = @(
    "https://yegakpm9.us-east.insforge.app/auth/v1/signup",
    "https://yegakpm9.us-east.insforge.app/auth/signup",
    "https://yegakpm9.us-east.insforge.app/api/auth/signup",
    "https://yegakpm9.us-east.insforge.app/signup",
    "https://yegakpm9.us-east.insforge.app/rest/v1/auth/signup",
    "https://yegakpm9.us-east.insforge.app/"
)

foreach ($url in $urls) {
    try {
        $response = Invoke-WebRequest -Uri $url -Method POST -Headers $headers -Body $body -UseBasicParsing -TimeoutSec 5
        Write-Host "$url -> $($response.StatusCode)"
        Write-Host "  Body: $($response.Content.Substring(0, [Math]::Min(200, $response.Content.Length)))"
    } catch {
        $code = $_.Exception.Response.StatusCode.Value__
        Write-Host "$url -> $code"
    }
}

# Also try GET on base URL to see what's there
try {
    $response = Invoke-WebRequest -Uri "https://yegakpm9.us-east.insforge.app/" -Method GET -UseBasicParsing -TimeoutSec 5
    Write-Host "`nBase URL GET: $($response.StatusCode)"
    Write-Host "  Content-Type: $($response.Headers['Content-Type'])"
    Write-Host "  Body: $($response.Content.Substring(0, [Math]::Min(300, $response.Content.Length)))"
} catch {
    Write-Host "Base URL: $($_.Exception.Response.StatusCode.Value__)"
}
