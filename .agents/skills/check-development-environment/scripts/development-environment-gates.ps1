#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [string[]]$Interfaces = @()
)

$ErrorActionPreference = "Stop"
# MSRV 的唯一事实来源见 docs/RUST_CLI_TEMPLATE.md；修改此值时必须同步更新 development-environment-gates.sh。
$MinimumRustMajor = 1
$MinimumRustMinor = 90
$ProbePath = if ($env:AFH_PREREQ_PATH) { $env:AFH_PREREQ_PATH } else { $env:PATH }
$RustChange = "existing"
$NodeChange = "existing"
$PnpmChange = "existing"
$MsvcChange = "existing"
$CargoBin = $null
$NodeBin = $null
$PnpmBin = $null
$NormalizedInterfaces = @($Interfaces | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().ToUpperInvariant() })
$FrontendRequired = @($NormalizedInterfaces | Where-Object { $_ -in @("GUI", "WEB") }).Count -gt 0
$TemporaryDirectories = [System.Collections.Generic.List[string]]::new()

# 使用稳定退出码结束门禁，调用方可以据此区分具体失败阶段。
function Stop-Gate {
    param([int]$Code, [string]$Message)
    [Console]::Error.WriteLine("ERROR: $Message")
    exit $Code
}

# 只在门禁探测路径中解析工具，便于隔离机器已有环境并验证缺失分支。
function Resolve-GateCommand {
    param([string]$Name)
    foreach ($directory in ($script:ProbePath -split [IO.Path]::PathSeparator)) {
        if ([string]::IsNullOrWhiteSpace($directory)) { continue }
        foreach ($candidateName in @($Name, "$Name.exe", "$Name.cmd", "$Name.bat")) {
            $candidate = Join-Path $directory $candidateName
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
        }
    }
    return $null
}

# 下载官方 HTTPS 制品；file URL 仅供显式开启的隔离测试镜像使用。
function Get-OfficialFile {
    param([string]$Uri, [string]$Destination)
    if ($Uri.StartsWith("https://", [StringComparison]::OrdinalIgnoreCase)) {
        Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $Destination
        return
    }
    if ($Uri.StartsWith("file://", [StringComparison]::OrdinalIgnoreCase) -and $env:AFH_ALLOW_FILE_URLS -eq "1") {
        Copy-Item -LiteralPath ([Uri]$Uri).LocalPath -Destination $Destination
        return
    }
    Stop-Gate 24 "unsupported download URL scheme: $Uri"
}

# 建立并登记本进程专用临时目录，finally 只清理这些已知目标。
function New-GateTemporaryDirectory {
    $directory = Join-Path ([IO.Path]::GetTempPath()) ("agent-first-gate-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $directory | Out-Null
    $script:TemporaryDirectories.Add($directory)
    return $directory
}

# 验证 Rust 为满足 MSRV 的稳定版本，不自动覆盖旧版或预发布工具链。
function Test-RustVersion {
    param([string]$RustcPath, [string]$CargoPath)
    $rustText = (& $RustcPath --version 2>$null)
    if ($LASTEXITCODE -ne 0) { Stop-Gate 21 "rustc probe failed" }
    $cargoText = (& $CargoPath --version 2>$null)
    if ($LASTEXITCODE -ne 0) { Stop-Gate 21 "cargo probe failed" }
    if ($rustText -notmatch '^rustc (\d+)\.(\d+)\.\d+(?:\s|$)') {
        Stop-Gate 21 "existing Rust toolchain is not a recognized stable release: $rustText"
    }
    $rustMajor = [int]$Matches[1]
    $rustMinor = [int]$Matches[2]
    if ($rustMajor -lt $MinimumRustMajor -or ($rustMajor -eq $MinimumRustMajor -and $rustMinor -lt $MinimumRustMinor)) {
        Stop-Gate 21 "existing Rust is below MSRV $MinimumRustMajor.$MinimumRustMinor.0`: $rustText"
    }
    $script:RustVersion = $rustText
    $script:CargoVersion = $cargoText
}

# 下载架构匹配的官方 rustup-init，核对 SHA-256 后安装缺失 stable 工具链。
function Install-MissingRust {
    $architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    $target = switch ($architecture) {
        "x64" { "x86_64-pc-windows-msvc" }
        "arm64" { "aarch64-pc-windows-msvc" }
        default { Stop-Gate 22 "unsupported Windows architecture for rustup: $architecture" }
    }
    $base = if ($env:AFH_RUSTUP_DIST_BASE) { $env:AFH_RUSTUP_DIST_BASE.TrimEnd('/') } else { "https://static.rust-lang.org/rustup/dist" }
    $temporary = New-GateTemporaryDirectory
    $installer = Join-Path $temporary "rustup-init.exe"
    $checksumFile = Join-Path $temporary "rustup-init.exe.sha256"
    $releaseBase = "$base/$target"
    [Console]::Error.WriteLine("Installing missing Rust stable from $releaseBase into the current user's rustup directories.")
    Get-OfficialFile "$releaseBase/rustup-init.exe" $installer
    Get-OfficialFile "$releaseBase/rustup-init.exe.sha256" $checksumFile
    $expected = ((Get-Content -LiteralPath $checksumFile -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { Stop-Gate 22 "rustup-init SHA-256 verification failed" }
    & $installer -y --profile minimal --default-toolchain stable
    if ($LASTEXITCODE -ne 0) { Stop-Gate 22 "Rust installation failed" }
    $cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $HOME ".cargo" }
    $script:CargoBin = Join-Path $cargoHome "bin"
    $script:ProbePath = "$CargoBin$([IO.Path]::PathSeparator)$ProbePath"
    $script:RustChange = "installed"
}

# 验证 Windows Rust 编译所需 MSVC C++ 工具是否可由当前环境定位。
function Test-MsvcPrerequisite {
    if (Resolve-GateCommand "cl") { return $true }
    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path -LiteralPath $vswhere -PathType Leaf) {
        $installation = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($LASTEXITCODE -eq 0 -and $installation) { return $true }
    }
    return $false
}

# 下载并运行微软签名的 Build Tools bootstrapper，再由调用方重新探测 C++ workload。
function Install-MissingMsvc {
    $temporary = New-GateTemporaryDirectory
    $installer = Join-Path $temporary "vs_BuildTools.exe"
    $source = if ($env:AFH_VS_BUILDTOOLS_URL) { $env:AFH_VS_BUILDTOOLS_URL } else { "https://aka.ms/vs/17/release/vs_BuildTools.exe" }
    [Console]::Error.WriteLine("Installing missing Microsoft Visual Studio Build Tools C++ workload from $source.")
    Get-OfficialFile $source $installer
    if ($env:AFH_SKIP_AUTHENTICODE -ne "1") {
        $signature = Get-AuthenticodeSignature -FilePath $installer
        if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch "Microsoft Corporation") {
            Stop-Gate 27 "Visual Studio Build Tools bootstrapper does not have a valid Microsoft signature"
        }
    }
    $arguments = @(
        "--quiet",
        "--wait",
        "--norestart",
        "--nocache",
        "--add", "Microsoft.VisualStudio.Workload.VCTools",
        "--includeRecommended"
    )
    $process = Start-Process -FilePath $installer -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) {
        Stop-Gate 27 "Visual Studio Build Tools installation failed with exit code $($process.ExitCode)"
    }
    $script:MsvcChange = "installed"
}

# 从官方索引选择受支持 LTS，校验 zip 后安装到当前用户目录并维护用户 PATH。
function Install-MissingNode {
    $architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    $nodeArchitecture = switch ($architecture) {
        "x64" { "x64" }
        "arm64" { "arm64" }
        default { Stop-Gate 26 "unsupported Windows architecture for Node.js: $architecture" }
    }
    $base = if ($env:AFH_NODE_DIST_BASE) { $env:AFH_NODE_DIST_BASE.TrimEnd('/') } else { "https://nodejs.org/dist" }
    $temporary = New-GateTemporaryDirectory
    $indexPath = Join-Path $temporary "index.json"
    Get-OfficialFile "$base/index.json" $indexPath
    $index = Get-Content -LiteralPath $indexPath -Raw | ConvertFrom-Json
    $release = @($index | Where-Object { $_.lts -and $_.lts -ne $false })[0]
    if (-not $release) { Stop-Gate 26 "Node.js release index contains no supported LTS" }
    $version = [string]$release.version
    $archiveName = "node-$version-win-$nodeArchitecture.zip"
    $releaseBase = "$base/$version"
    $archive = Join-Path $temporary $archiveName
    $checksums = Join-Path $temporary "SHASUMS256.txt"
    [Console]::Error.WriteLine("Installing missing Node.js $version LTS from $releaseBase into a user-level directory.")
    Get-OfficialFile "$releaseBase/$archiveName" $archive
    Get-OfficialFile "$releaseBase/SHASUMS256.txt" $checksums
    $escapedName = [Regex]::Escape($archiveName)
    $checksumLine = Get-Content -LiteralPath $checksums | Where-Object { $_ -match "^([0-9a-fA-F]{64})\s+$escapedName$" } | Select-Object -First 1
    if (-not $checksumLine) { Stop-Gate 26 "Node.js checksum list does not contain $archiveName" }
    $checksumLine -match '^([0-9a-fA-F]{64})' | Out-Null
    $expected = $Matches[1].ToLowerInvariant()
    $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { Stop-Gate 26 "Node.js SHA-256 verification failed" }
    $nodeHome = if ($env:AFH_NODE_HOME) { $env:AFH_NODE_HOME } else { Join-Path $env:LOCALAPPDATA "AgentFirstHarness\Node" }
    $installDirectory = Join-Path $nodeHome $version
    if (Test-Path -LiteralPath $installDirectory) {
        if (-not (Test-Path -LiteralPath (Join-Path $installDirectory "node.exe") -PathType Leaf)) {
            Stop-Gate 26 "Node.js target already exists but is not usable: $installDirectory"
        }
    } else {
        New-Item -ItemType Directory -Force -Path $nodeHome | Out-Null
        Expand-Archive -LiteralPath $archive -DestinationPath $temporary
        $extracted = Join-Path $temporary "node-$version-win-$nodeArchitecture"
        if (-not (Test-Path -LiteralPath (Join-Path $extracted "node.exe") -PathType Leaf)) {
            Stop-Gate 26 "Node.js archive does not contain the expected executable"
        }
        Move-Item -LiteralPath $extracted -Destination $installDirectory
    }
    $script:NodeBin = $installDirectory
    $script:ProbePath = "$NodeBin$([IO.Path]::PathSeparator)$ProbePath"
    $env:PATH = $script:ProbePath
    if ($env:AFH_SKIP_PERSIST_PATH -ne "1") {
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        $parts = @($userPath -split [IO.Path]::PathSeparator | Where-Object { $_ })
        if ($parts -notcontains $NodeBin) {
            $newUserPath = (@($NodeBin) + $parts) -join [IO.Path]::PathSeparator
            [Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
        }
    }
    $script:NodeChange = "installed"
}

# 仅为 GUI/WEB 项目通过 Node 自带 npm 安装官方 registry 的稳定 pnpm。
function Install-MissingPnpm {
    $npm = Resolve-GateCommand "npm"
    if (-not $npm) { Stop-Gate 28 "npm is required to install pnpm for GUI/WEB development" }
    $pnpmHome = if ($env:AFH_PNPM_HOME) { $env:AFH_PNPM_HOME } else { Join-Path $env:LOCALAPPDATA "AgentFirstHarness\Pnpm" }
    New-Item -ItemType Directory -Force -Path $pnpmHome | Out-Null
    [Console]::Error.WriteLine("Installing missing pnpm from the official npm registry into a user-level directory.")
    & $npm install --global --prefix $pnpmHome pnpm@latest
    if ($LASTEXITCODE -ne 0) { Stop-Gate 28 "pnpm installation failed" }
    $script:PnpmBin = $pnpmHome
    $script:ProbePath = "$PnpmBin$([IO.Path]::PathSeparator)$ProbePath"
    $env:PATH = $script:ProbePath
    $script:PnpmChange = "installed"
}

try {
    $rustc = Resolve-GateCommand "rustc"
    $cargo = Resolve-GateCommand "cargo"

    if ($rustc -and $cargo) {
        Test-RustVersion $rustc $cargo
        $rustMissing = $false
    } else {
        $RustVersion = "Missing"
        $CargoVersion = "Missing"
        $rustMissing = $true
    }
    if ($FrontendRequired) {
        $node = Resolve-GateCommand "node"
        $pnpm = Resolve-GateCommand "pnpm"
        if ($node) {
            $NodeVersion = (& $node --version 2>$null)
            if ($LASTEXITCODE -ne 0) { Stop-Gate 23 "Node.js probe failed" }
            $nodeMissing = $false
        } else {
            $NodeVersion = "Missing"
            $nodeMissing = $true
        }
        if ($pnpm) {
            $PnpmVersion = (& $pnpm --version 2>$null)
            if ($LASTEXITCODE -ne 0) { Stop-Gate 28 "pnpm probe failed" }
            $pnpmMissing = $false
        } else {
            $PnpmVersion = "Missing"
            $pnpmMissing = $true
        }
    } else {
        $NodeVersion = "Not-required"
        $PnpmVersion = "Not-required"
        $nodeMissing = $false
        $pnpmMissing = $false
    }
    $msvcMissing = -not (Test-MsvcPrerequisite)

    if ($CheckOnly) {
        "gate.rust.status=$(if ($rustMissing) { 'missing' } else { 'passed' })"
        "gate.rust.version=$RustVersion"
        "gate.node.status=$(if (-not $FrontendRequired) { 'not-required' } elseif ($nodeMissing) { 'missing' } else { 'passed' })"
        "gate.node.version=$NodeVersion"
        "gate.pnpm.status=$(if (-not $FrontendRequired) { 'not-required' } elseif ($pnpmMissing) { 'missing' } else { 'passed' })"
        "gate.pnpm.version=$PnpmVersion"
        "gate.msvc.status=$(if ($msvcMissing) { 'missing' } else { 'passed' })"
        if ($rustMissing -or $nodeMissing -or $pnpmMissing -or $msvcMissing) { exit 20 }
        exit 0
    }

    if ($rustMissing) {
        Install-MissingRust
        $rustc = Resolve-GateCommand "rustc"
        $cargo = Resolve-GateCommand "cargo"
        if (-not $rustc -or -not $cargo) { Stop-Gate 22 "Rust install completed without callable rustc and cargo" }
        Test-RustVersion $rustc $cargo
    }
    if ($msvcMissing) {
        Install-MissingMsvc
        if (-not (Test-MsvcPrerequisite)) {
            Stop-Gate 27 "Visual Studio Build Tools installation completed but the MSVC C++ workload is still unavailable"
        }
    }
    if ($nodeMissing) {
        Install-MissingNode
        $node = Resolve-GateCommand "node"
        if (-not $node) { Stop-Gate 26 "Node.js install completed without a callable node executable" }
        $NodeVersion = (& $node --version 2>$null)
        if ($LASTEXITCODE -ne 0) { Stop-Gate 26 "installed Node.js probe failed" }
    }
    if ($pnpmMissing) {
        Install-MissingPnpm
        $pnpm = Resolve-GateCommand "pnpm"
        if (-not $pnpm) { Stop-Gate 28 "pnpm install completed without a callable pnpm executable" }
        $PnpmVersion = (& $pnpm --version 2>$null)
        if ($LASTEXITCODE -ne 0) { Stop-Gate 28 "installed pnpm probe failed" }
    }

    $changed = if ($RustChange -eq "installed" -or $NodeChange -eq "installed" -or $PnpmChange -eq "installed" -or $MsvcChange -eq "installed") { "true" } else { "false" }
    "gate.rust.status=passed"
    "gate.rust.version=$RustVersion"
    "gate.rust.change=$RustChange"
    "gate.node.status=$(if ($FrontendRequired) { 'passed' } else { 'not-required' })"
    "gate.node.version=$NodeVersion"
    "gate.node.change=$NodeChange"
    "gate.pnpm.status=$(if ($FrontendRequired) { 'passed' } else { 'not-required' })"
    "gate.pnpm.version=$PnpmVersion"
    "gate.pnpm.change=$PnpmChange"
    "gate.msvc.status=passed"
    "gate.msvc.change=$MsvcChange"
    "gate.changed=$changed"
    $prepend = (@($PnpmBin, $NodeBin, $CargoBin) | Where-Object { $_ }) -join [IO.Path]::PathSeparator
    if ($prepend) { "gate.path.prepend=$prepend" }
} finally {
    foreach ($directory in $TemporaryDirectories) {
        if (Test-Path -LiteralPath $directory) { Remove-Item -LiteralPath $directory -Recurse -Force }
    }
}
