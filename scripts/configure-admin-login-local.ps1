# Hidden local entry only. Uses existing Redis; no new database, server or provider switch.
$ErrorActionPreference = 'Stop'
$loginSetupRoot = Split-Path -Parent $PSScriptRoot
$loginSetupPrior = @{}
function Read-HodPrivateValue([string]$Prompt) {
    $privateValue = Read-Host -Prompt $Prompt -AsSecureString
    $privatePointer = [IntPtr]::Zero
    try {
        $privatePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($privateValue)
        $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($privatePointer)
        if ([string]::IsNullOrWhiteSpace($plainValue) -or $plainValue -match '[\r\n''$]') { throw 'Private input format rejected' }
        return $plainValue
    } finally {
        if ($privatePointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($privatePointer) }
        $privateValue.Dispose()
    }
}
Push-Location -LiteralPath $loginSetupRoot
try {
    foreach ($loginSetupName in @('HOD_SETUP_KEYCLOAK_SECRET','HOD_SETUP_REDIS_URL')) {
        $loginSetupPrior[$loginSetupName] = [Environment]::GetEnvironmentVariable($loginSetupName, 'Process')
    }
    Write-Host 'Paste existing private values here only. They will be hidden.'
    [Environment]::SetEnvironmentVariable('HOD_SETUP_KEYCLOAK_SECRET', (Read-HodPrivateValue 'hod-admin client secret'), 'Process')
    [Environment]::SetEnvironmentVariable('HOD_SETUP_REDIS_URL', (Read-HodPrivateValue 'Existing complete rediss:// Redis URL (without REDIS_URL=)'), 'Process')
    & node scripts/configure-admin-login-local.mjs
    if ($LASTEXITCODE -ne 0) { Write-Host 'Setup did not pass. Return only the safe JSON result above.' }
} catch {
    Write-Host 'Private input/setup stopped. No provider was activated. Do not send secret values to chat.'
} finally {
    foreach ($loginSetupName in $loginSetupPrior.Keys) {
        if ($null -eq $loginSetupPrior[$loginSetupName]) {
            [Environment]::SetEnvironmentVariable($loginSetupName, [System.Management.Automation.Language.NullString]::Value, 'Process')
        } else {
            [Environment]::SetEnvironmentVariable($loginSetupName, $loginSetupPrior[$loginSetupName], 'Process')
        }
    }
    Pop-Location
}
