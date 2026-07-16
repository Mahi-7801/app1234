$body = '{"email":"test12345@test.com","password":"test123"}'
$headers = @{
    "Content-Type" = "application/json"
    "apikey" = "ik_e27a4d9a33a311562c1a5776e51c4368"
}
try {
    $response = Invoke-WebRequest -Uri "https://yegakpm9.us-east.insforge.app/auth/v1/signup" -Method POST -Headers $headers -Body $body -UseBasicParsing
    Write-Host "Status: $($response.StatusCode)"
    Write-Host "Response: $($response.Content.Substring(0, [Math]::Min(500, $response.Content.Length)))"
} catch {
    Write-Host "Status: $($_.Exception.Response.StatusCode.Value__)"
    try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $content = $reader.ReadToEnd()
        Write-Host "Response: $($content.Substring(0, [Math]::Min(500, $content.Length)))"
    } catch {
        Write-Host "Error: $($_.Exception.Message)"
    }
}
