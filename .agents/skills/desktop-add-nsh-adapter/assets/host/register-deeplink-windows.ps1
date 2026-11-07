# Registers this packaged host for the current Windows user. Run from the extracted package directory.
$ErrorActionPreference = 'Stop'
$scheme = '__SCHEME__'
$hostPath = Join-Path $PSScriptRoot '__HOST_EXE__.exe'
if (-not (Test-Path -LiteralPath $hostPath -PathType Leaf)) { throw 'The packaged NSH host executable is missing.' }
$key = "HKCU:\Software\Classes\$scheme"
New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-Item -LiteralPath $key -Value "URL:$scheme"
New-ItemProperty -LiteralPath $key -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
Set-Item -LiteralPath "$key\shell\open\command" -Value ('"' + $hostPath + '" "%1"')
Write-Output "Registered $scheme for the current user."
