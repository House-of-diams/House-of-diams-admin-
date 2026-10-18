# User-run private password entry. Existing tunnel only; no service starts.
# Tests READ ONLY first and saves only four admin DB settings after success.
$ErrorActionPreference = 'Stop'
$adminRdsRoot = Split-Path -Parent $PSScriptRoot
$adminRdsEnvPath = Join-Path $adminRdsRoot '.env.local'
$adminRdsCa = 'C:/Users/user/AppData/Local/HOD/rds-certs/us-east-1-bundle.pem'
$adminRdsExpectedHost = 'database-1.cqngaqgio3hj.us-east-1.rds.amazonaws.com'
$adminRdsEnvNames = @('ADMIN_DATABASE_URL','ADMIN_DB_LOGIN_ROLE','ADMIN_DB_TLS_CA_FILE','ADMIN_DB_TLS_EXPECTED_HOST')
$adminRdsPrior = @{}
$adminRdsPasswordPointer = [IntPtr]::Zero
$adminRdsTemp = $null
$adminRdsFailure = $false

Push-Location -LiteralPath $adminRdsRoot
try {
    if (-not (Test-Path -LiteralPath $adminRdsCa -PathType Leaf)) {
        throw 'The existing RDS CA file is unavailable. Nothing saved; do not disable TLS verification.'
    }
    $adminRdsListener = @(Get-NetTCPConnection -LocalPort 15432 -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalAddress -eq '127.0.0.1' })
    if ($adminRdsListener.Count -eq 0) {
        throw 'The existing approved local database route is unavailable. Nothing saved; no tunnel or server was started.'
    }
    if (-not (Test-Path -LiteralPath $adminRdsEnvPath -PathType Leaf)) {
        throw 'The existing admin .env.local is missing. Stop rather than replace unknown project configuration.'
    }
    & git check-ignore --quiet -- .env.local
    if ($LASTEXITCODE -ne 0) { throw 'The admin environment file must be Git-ignored before saving credentials.' }
    $adminRdsNode = (Get-Command node -ErrorAction Stop).Source
    foreach ($adminRdsName in $adminRdsEnvNames) {
        $adminRdsPrior[$adminRdsName] = [Environment]::GetEnvironmentVariable($adminRdsName, 'Process')
    }

    Write-Host 'Enter the password you just saved for hod_admin_login_uat. It will be hidden.'
    $adminRdsSecurePassword = Read-Host -Prompt 'New admin database password' -AsSecureString
    $adminRdsPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminRdsSecurePassword)
    $adminRdsPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminRdsPasswordPointer)
    if ([string]::IsNullOrEmpty($adminRdsPassword)) { throw 'Empty password. Nothing saved.' }
    $adminRdsEncodedPassword = [Uri]::EscapeDataString($adminRdsPassword)
    $adminRdsSettings = [ordered]@{
        ADMIN_DATABASE_URL = ('postgresql://hod_admin_login_uat:' + $adminRdsEncodedPassword + '@127.0.0.1:15432/hod_staging')
        ADMIN_DB_LOGIN_ROLE = 'hod_admin_login_uat'
        ADMIN_DB_TLS_CA_FILE = $adminRdsCa
        ADMIN_DB_TLS_EXPECTED_HOST = $adminRdsExpectedHost
    }
    foreach ($adminRdsName in $adminRdsEnvNames) {
        [Environment]::SetEnvironmentVariable($adminRdsName, $adminRdsSettings[$adminRdsName], 'Process')
    }

    Write-Host 'Checking verified TLS and the isolated admin role using a read-only transaction...'
    $adminRdsOutput = & $adminRdsNode scripts/check-admin-rds-connection.mjs
    $adminRdsExit = $LASTEXITCODE
    $adminRdsOutput | ForEach-Object { Write-Host $_ }
    if ($adminRdsExit -ne 0) { throw 'Read-only connection proof did not pass. No environment file changes were saved.' }
    $adminRdsProof = ($adminRdsOutput -join "`n") | ConvertFrom-Json
    if ($adminRdsProof.ok -ne $true -or $adminRdsProof.database -ne 'hod_staging' -or
        $adminRdsProof.login_role -ne 'hod_admin_login_uat' -or
        $adminRdsProof.capability -ne 'hod_admin_app' -or
        $adminRdsProof.read_only -ne 'on' -or $adminRdsProof.tls -ne $true) {
        throw 'Unexpected connection result. Nothing saved.'
    }

    $adminRdsText = [IO.File]::ReadAllText($adminRdsEnvPath)
    foreach ($adminRdsName in $adminRdsEnvNames) {
        $adminRdsPattern = '(?m)^[\t ]*(?:export[\t ]+)?' + [regex]::Escape($adminRdsName) + '[\t ]*=.*(?:\r?\n|$)'
        $adminRdsText = [regex]::Replace($adminRdsText, $adminRdsPattern, '')
    }
    $adminRdsText = $adminRdsText.TrimEnd([char[]]"`r`n") + "`r`n"
    foreach ($adminRdsName in $adminRdsEnvNames) {
        $adminRdsText += $adminRdsName + '=' + $adminRdsSettings[$adminRdsName] + "`r`n"
    }
    $adminRdsTemp = $adminRdsEnvPath + '.hod-rds-' + [Guid]::NewGuid().ToString('N') + '.tmp'
    & git check-ignore --quiet -- ([IO.Path]::GetFileName($adminRdsTemp))
    if ($LASTEXITCODE -ne 0) { throw 'Temporary credential file would not be Git-ignored. Nothing saved.' }
    [IO.File]::WriteAllText($adminRdsTemp, $adminRdsText, [Text.UTF8Encoding]::new($false))
    # Windows PowerShell binds $null to an empty string for this .NET String
    # argument. Pass a real null to request replacement without a backup path.
    [IO.File]::Replace($adminRdsTemp, $adminRdsEnvPath, [System.Management.Automation.Language.NullString]::Value)
    $adminRdsTemp = $null
    Write-Host 'SUCCESS: real admin RDS connection verified; four private DB settings saved.'
    Write-Host 'No business rows were read or written. Application providers were not switched; no server was started.'
}
catch {
    # Only literal/sanitized failures emitted by this script are shown. Do not dump
    # exception records, command arguments, URL variables or environment contents.
    $adminRdsFailure = $true
    $adminRdsMessage = $_.Exception.Message
    if ($adminRdsMessage -match 'password|postgres(?:ql)?://|ADMIN_DATABASE_URL' -and
        $adminRdsMessage -notin @('Empty password. Nothing saved.')) {
        Write-Host 'Setup stopped. Configuration/connection could not be saved. No secret values are displayed.'
    } else {
        Write-Host ('Setup stopped: ' + $adminRdsMessage)
    }
}
finally {
    foreach ($adminRdsName in $adminRdsPrior.Keys) {
        if ($null -eq $adminRdsPrior[$adminRdsName]) {
            [Environment]::SetEnvironmentVariable($adminRdsName, [System.Management.Automation.Language.NullString]::Value, 'Process')
        } else {
            [Environment]::SetEnvironmentVariable($adminRdsName, $adminRdsPrior[$adminRdsName], 'Process')
        }
    }
    if ($adminRdsPasswordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminRdsPasswordPointer)
    }
    if ($adminRdsTemp -and (Test-Path -LiteralPath $adminRdsTemp)) {
        # Only our verified, single, nonrecursive temporary file in the admin root.
        Remove-Item -LiteralPath $adminRdsTemp -Force
    }
    $adminRdsPassword = $null
    $adminRdsEncodedPassword = $null
    $adminRdsSettings = $null
    $adminRdsText = $null
    if ($adminRdsSecurePassword) { $adminRdsSecurePassword.Dispose() }
    Pop-Location
}
if ($adminRdsFailure) { Write-Host 'Return only the nonsecret result/error text to the central chat.' }
