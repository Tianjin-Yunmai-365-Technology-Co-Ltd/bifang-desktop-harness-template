#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [string[]]$Interfaces = @()
)

$ErrorActionPreference = "Stop"
# MSRV 的唯一事实来源见 docs/RUST_CLI_TEMPLATE.md；修改此值时必须同步更新 development-environment-gates.sh。
$MinimumRustMajor = 1
$MinimumRustMinor = 95
$NodeRequirement = "^24.15.0 || >=26.0.0"
$PnpmRequirement = ">=11.24.0"
$PnpmInstallRequirement = "pnpm@>=11.24.0"
$GitRequirement = ">=2.0.0"
$ProbePath = if ($env:AFH_PREREQ_PATH) { $env:AFH_PREREQ_PATH } else { $env:PATH }
$RustChange = "existing"
$GitChange = "existing"
$NodeChange = "existing"
$PnpmChange = "existing"
$MsvcChange = "existing"
$CargoBin = $null
$GitBin = $null
$NodeBin = $null
$PnpmBin = $null
$NormalizedInterfaces = @($Interfaces | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().ToUpperInvariant() })
$UnsupportedInterfaces = @($NormalizedInterfaces | Where-Object { $_ -and $_ -notin @("CLI", "TUI", "MCP", "GUI") })
if ($UnsupportedInterfaces.Count -gt 0) {
    [Console]::Error.WriteLine("不支持的接口：$($UnsupportedInterfaces -join ',')")
    exit 2
}
$FrontendRequired = $NormalizedInterfaces -contains "GUI"
$TemporaryDirectories = [System.Collections.Generic.List[string]]::new()

# 使用稳定退出码结束门禁，调用方可以据此区分具体失败阶段。
function Stop-Gate {
    param([int]$Code, [string]$Message)
    [Console]::Error.WriteLine("错误：$Message")
    exit $Code
}

# 只在门禁探测路径中解析工具，便于隔离机器已有环境并验证缺失分支。
function Resolve-GateCommand {
    param([string]$Name)
    foreach ($directory in ($script:ProbePath -split [IO.Path]::PathSeparator)) {
        if ([string]::IsNullOrWhiteSpace($directory)) { continue }
        # npm/pnpm 同时发布 POSIX 无扩展名 shim 与 Windows 包装器；Windows 只解析本机可执行形态。
        foreach ($candidateName in @("$Name.exe", "$Name.cmd", "$Name.bat")) {
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
    Stop-Gate 24 "不支持的下载 URL 协议：$Uri"
}

# 建立并登记本进程专用临时目录，finally 只清理这些已知目标。
function New-GateTemporaryDirectory {
    $directory = Join-Path ([IO.Path]::GetTempPath()) ("agent-first-gate-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $directory | Out-Null
    $script:TemporaryDirectories.Add($directory)
    return $directory
}

# 验证 Rust 为满足 MSRV 的稳定版本；明确低于下界时返回待升级状态。
function Test-RustVersion {
    param([string]$RustcPath, [string]$CargoPath)
    $rustText = (& $RustcPath --version 2>$null)
    if ($LASTEXITCODE -ne 0) { Stop-Gate 21 "rustc 探测失败" }
    $cargoText = (& $CargoPath --version 2>$null)
    if ($LASTEXITCODE -ne 0) { Stop-Gate 21 "cargo 探测失败" }
    if ($rustText -notmatch '^rustc (\d+)\.(\d+)\.\d+(?:\s|$)') {
        Stop-Gate 21 "现有 Rust 工具链不是可识别的稳定发布版：$rustText"
    }
    $rustMajor = [int]$Matches[1]
    $rustMinor = [int]$Matches[2]
    $script:RustVersion = $rustText
    $script:CargoVersion = $cargoText
    if ($rustMajor -lt $MinimumRustMajor -or ($rustMajor -eq $MinimumRustMajor -and $rustMinor -lt $MinimumRustMinor)) {
        return "upgrade-required"
    }
    return "passed"
}

# 使用 .NET 计算 SHA-256，避免最小 PowerShell 环境尚未自动加载 Get-FileHash 模块。
function Get-Sha256File {
    param([string]$Path)
    $stream = [IO.File]::OpenRead($Path)
    try {
        $algorithm = [Security.Cryptography.SHA256]::Create()
        try {
            return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
        } finally {
            $algorithm.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

# 验证 Node 安装目录包含官方可执行文件；cmd 仅供显式 file URL 隔离夹具使用。
function Test-NodeExecutableInDirectory {
    param([string]$Directory)
    if (Test-Path -LiteralPath (Join-Path $Directory "node.exe") -PathType Leaf) { return $true }
    if ($env:AFH_ALLOW_FILE_URLS -eq "1" -and (Test-Path -LiteralPath (Join-Path $Directory "node.cmd") -PathType Leaf)) {
        return $true
    }
    return $false
}

# 验证 Node.js 落在 Vite 基线范围内；低版本或 25.x 返回待升级状态。
function Test-NodeVersion {
    param([string]$NodePath)
    $nodeText = (& $NodePath --version 2>$null)
    if ($LASTEXITCODE -ne 0) { Stop-Gate 23 "Node.js 探测失败" }
    if ($nodeText -notmatch '^v(\d+)\.(\d+)\.(\d+)$') {
        Stop-Gate 23 "现有 Node.js 不是可识别的稳定发布版：$nodeText"
    }
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    $patch = [int]$Matches[3]
    $compatible = ($major -eq 24 -and ($minor -gt 15 -or ($minor -eq 15 -and $patch -ge 0))) -or
        ($major -ge 26)
    $script:NodeVersion = $nodeText
    if (-not $compatible) { return "upgrade-required" }
    return "passed"
}

# 验证 pnpm 满足最低版本；明确低于下界时返回待升级状态。
function Test-PnpmVersion {
    param([string]$PnpmPath)
    $pnpmText = (& $PnpmPath --version 2>$null)
    if ($LASTEXITCODE -ne 0) { Stop-Gate 28 "pnpm 探测失败" }
    if ($pnpmText -notmatch '^(\d+)\.(\d+)\.(\d+)$') {
        Stop-Gate 28 "现有 pnpm 不是可识别的稳定发布版：$pnpmText"
    }
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    $script:PnpmVersion = $pnpmText
    if ($major -lt 11 -or ($major -eq 11 -and $minor -lt 24)) {
        return "upgrade-required"
    }
    return "passed"
}

# Git 是所有初始化路径的基础工具；明确低于下界时返回待升级状态。
function Test-GitVersion {
    param([string]$GitPath)
    $gitText = (& $GitPath --version 2>$null)
    if ($LASTEXITCODE -ne 0) { Stop-Gate 29 "Git 探测失败" }
    if ($gitText -notmatch '^git version (\d+)\.(\d+)\.(\d+)(?:\.windows\.\d+)?(?:\s.*)?$') {
        Stop-Gate 29 "现有 Git 不是可识别的稳定发布版：$gitText"
    }
    $script:GitVersion = $gitText
    if ([int]$Matches[1] -lt 2) { return "upgrade-required" }
    return "passed"
}

# Windows 只通过既有 winget 安装或升级 Git.Git，并在当前进程刷新常见 Git 路径。
function Install-MissingGit {
    param([ValidateSet("installed", "upgraded")][string]$Change)
    $winget = Resolve-GateCommand "winget"
    if (-not $winget) { Stop-Gate 29 "Windows 安装 Git 需要既有 winget" }
    $action = if ($Change -eq "upgraded") { "升级" } else { "安装" }
    [Console]::Error.WriteLine("正在通过既有 winget $action Git.Git。")
    $arguments = @("install", "--id", "Git.Git", "--exact", "--silent", "--disable-interactivity", "--accept-package-agreements", "--accept-source-agreements")
    if ($Change -eq "upgraded") { $arguments += "--force" }
    & $winget @arguments
    if ($LASTEXITCODE -ne 0) { Stop-Gate 29 "winget $action Git.Git 失败" }
    $candidateBins = if ($env:AFH_PREREQ_PATH) {
        @()
    } else {
        @(
            (Join-Path $env:ProgramFiles "Git\cmd"),
            (Join-Path $env:LOCALAPPDATA "Programs\Git\cmd")
        )
    }
    foreach ($candidateBin in $candidateBins) {
        if (Test-Path -LiteralPath (Join-Path $candidateBin "git.exe") -PathType Leaf) {
            $script:GitBin = $candidateBin
            $script:ProbePath = "$GitBin$([IO.Path]::PathSeparator)$ProbePath"
            $env:PATH = $script:ProbePath
            break
        }
    }
    $script:GitChange = $Change
}

# 使用既有 rustup 或已校验的官方 rustup-init 安装/升级 stable 工具链。
function Install-MissingRust {
    param([ValidateSet("installed", "upgraded")][string]$Change)
    $rustup = Resolve-GateCommand "rustup"
    if ($Change -eq "upgraded" -and $rustup) {
        [Console]::Error.WriteLine("正在通过既有 rustup 把 Rust 升级到当前 stable 工具链。")
        & $rustup toolchain install stable --profile minimal | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-Gate 22 "Rust stable 工具链升级失败" }
        & $rustup default stable | Out-Null
        if ($LASTEXITCODE -ne 0) { Stop-Gate 22 "Rust stable 默认工具链切换失败" }
        $cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path ([Environment]::GetFolderPath("UserProfile")) ".cargo" }
        $candidateBin = Join-Path $cargoHome "bin"
        if (Test-Path -LiteralPath $candidateBin -PathType Container) {
            $script:CargoBin = $candidateBin
            $script:ProbePath = "$CargoBin$([IO.Path]::PathSeparator)$ProbePath"
            $env:PATH = $script:ProbePath
        }
        $script:RustChange = "upgraded"
        return
    }
    $architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    $target = switch ($architecture) {
        "x64" { "x86_64-pc-windows-msvc" }
        "arm64" { "aarch64-pc-windows-msvc" }
        default { Stop-Gate 22 "rustup 不支持此 Windows 架构：$architecture" }
    }
    $base = if ($env:AFH_RUSTUP_DIST_BASE) { $env:AFH_RUSTUP_DIST_BASE.TrimEnd('/') } else { "https://static.rust-lang.org/rustup/dist" }
    $temporary = New-GateTemporaryDirectory
    $installer = Join-Path $temporary "rustup-init.exe"
    $checksumFile = Join-Path $temporary "rustup-init.exe.sha256"
    $releaseBase = "$base/$target"
    $action = if ($Change -eq "upgraded") { "升级" } else { "安装" }
    [Console]::Error.WriteLine("正在从 $releaseBase $action Rust stable 到当前用户的 rustup 目录。")
    Get-OfficialFile "$releaseBase/rustup-init.exe" $installer
    Get-OfficialFile "$releaseBase/rustup-init.exe.sha256" $checksumFile
    $expected = ((Get-Content -LiteralPath $checksumFile -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    $actual = Get-Sha256File $installer
    if ($actual -ne $expected) { Stop-Gate 22 "rustup-init SHA-256 校验失败" }
    & $installer -y --profile minimal --default-toolchain stable
    if ($LASTEXITCODE -ne 0) { Stop-Gate 22 "Rust 安装失败" }
    $cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path ([Environment]::GetFolderPath("UserProfile")) ".cargo" }
    $script:CargoBin = Join-Path $cargoHome "bin"
    $script:ProbePath = "$CargoBin$([IO.Path]::PathSeparator)$ProbePath"
    $script:RustChange = $Change
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

# 下载并运行微软签名的 Build Tools 引导程序，再由调用方重新探测 C++ 工作负载。
function Install-MissingMsvc {
    $temporary = New-GateTemporaryDirectory
    $installer = Join-Path $temporary "vs_BuildTools.exe"
    $source = if ($env:AFH_VS_BUILDTOOLS_URL) { $env:AFH_VS_BUILDTOOLS_URL } else { "https://aka.ms/vs/17/release/vs_BuildTools.exe" }
    [Console]::Error.WriteLine("正在从 $source 安装缺失的 Microsoft Visual Studio Build Tools C++ 工作负载。")
    Get-OfficialFile $source $installer
    if ($env:AFH_SKIP_AUTHENTICODE -ne "1") {
        $signature = Get-AuthenticodeSignature -FilePath $installer
        if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch "Microsoft Corporation") {
            Stop-Gate 27 "Visual Studio Build Tools 引导程序没有有效的 Microsoft 签名"
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
        Stop-Gate 27 "Visual Studio Build Tools 安装失败，退出码为 $($process.ExitCode)"
    }
    $script:MsvcChange = "installed"
}

# 从官方倒序索引选择当前最新合格稳定版，校验 zip 后安装/升级当前用户环境。
function Install-MissingNode {
    param([ValidateSet("installed", "upgraded")][string]$Change)
    $architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    $nodeArchitecture = switch ($architecture) {
        "x64" { "x64" }
        "arm64" { "arm64" }
        default { Stop-Gate 26 "Node.js 不支持此 Windows 架构：$architecture" }
    }
    $base = if ($env:AFH_NODE_DIST_BASE) { $env:AFH_NODE_DIST_BASE.TrimEnd('/') } else { "https://nodejs.org/dist" }
    $temporary = New-GateTemporaryDirectory
    $indexPath = Join-Path $temporary "index.json"
    Get-OfficialFile "$base/index.json" $indexPath
    $index = Get-Content -LiteralPath $indexPath -Raw | ConvertFrom-Json
    $release = @($index | Where-Object {
        $candidate = [string]$_.version
        $compatible = $false
        if ($candidate -match '^v(\d+)\.(\d+)\.(\d+)$') {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            $patch = [int]$Matches[3]
            $compatible = ($major -eq 24 -and ($minor -gt 15 -or ($minor -eq 15 -and $patch -ge 0))) -or ($major -ge 26)
        }
        $compatible
    }) | Select-Object -First 1
    if (-not $release) { Stop-Gate 26 "Node.js 发布版本索引中没有满足 $NodeRequirement 的稳定版" }
    $version = [string]$release.version
    $archiveName = "node-$version-win-$nodeArchitecture.zip"
    $releaseBase = "$base/$version"
    $archive = Join-Path $temporary $archiveName
    $checksums = Join-Path $temporary "SHASUMS256.txt"
    $action = if ($Change -eq "upgraded") { "升级" } else { "安装" }
    [Console]::Error.WriteLine("正在从 $releaseBase $action 当前最新合格稳定 Node.js $version 到用户级目录。")
    Get-OfficialFile "$releaseBase/$archiveName" $archive
    Get-OfficialFile "$releaseBase/SHASUMS256.txt" $checksums
    $escapedName = [Regex]::Escape($archiveName)
    $checksumLine = Get-Content -LiteralPath $checksums | Where-Object { $_ -match "^([0-9a-fA-F]{64})\s+$escapedName$" } | Select-Object -First 1
    if (-not $checksumLine) { Stop-Gate 26 "Node.js 校验和列表不包含 $archiveName" }
    $checksumLine -match '^([0-9a-fA-F]{64})' | Out-Null
    $expected = $Matches[1].ToLowerInvariant()
    $actual = Get-Sha256File $archive
    if ($actual -ne $expected) { Stop-Gate 26 "Node.js SHA-256 校验失败" }
    $nodeHome = if ($env:AFH_NODE_HOME) { $env:AFH_NODE_HOME } else { Join-Path $env:LOCALAPPDATA "AgentFirstHarness\Node" }
    $installDirectory = Join-Path $nodeHome $version
    if (Test-Path -LiteralPath $installDirectory) {
        if (-not (Test-NodeExecutableInDirectory $installDirectory)) {
            Stop-Gate 26 "Node.js 目标已存在但不可用：$installDirectory"
        }
    } else {
        New-Item -ItemType Directory -Force -Path $nodeHome | Out-Null
        Expand-Archive -LiteralPath $archive -DestinationPath $temporary
        $extracted = Join-Path $temporary "node-$version-win-$nodeArchitecture"
        if (-not (Test-NodeExecutableInDirectory $extracted)) {
            Stop-Gate 26 "Node.js 归档不包含预期可执行文件"
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
    $script:NodeChange = $Change
}

# 仅为 GUI 项目通过 Node 自带 npm 安装或升级满足最低要求的 pnpm。
function Install-MissingPnpm {
    param([ValidateSet("installed", "upgraded")][string]$Change)
    $npm = Resolve-GateCommand "npm"
    if (-not $npm) { Stop-Gate 28 "为 GUI 开发安装 pnpm 需要 npm" }
    $pnpmHome = if ($env:AFH_PNPM_HOME) { $env:AFH_PNPM_HOME } else { Join-Path $env:LOCALAPPDATA "AgentFirstHarness\Pnpm" }
    New-Item -ItemType Directory -Force -Path $pnpmHome | Out-Null
    $action = if ($Change -eq "upgraded") { "升级" } else { "安装" }
    [Console]::Error.WriteLine("正在从官方 npm 软件包仓库把 $PnpmInstallRequirement $action 到用户级目录。")
    if ([IO.Path]::GetExtension($npm) -in @(".cmd", ".bat")) {
        # PowerShell 5.1 调用批处理包装器时不会自动保护 `>`；显式保留引号，避免版本范围被 cmd.exe 当作重定向。
        & $npm install --global --prefix $pnpmHome ('"' + $PnpmInstallRequirement + '"')
    } else {
        & $npm install --global --prefix $pnpmHome $PnpmInstallRequirement
    }
    if ($LASTEXITCODE -ne 0) { Stop-Gate 28 "pnpm 安装失败" }
    $script:PnpmBin = $pnpmHome
    $script:ProbePath = "$PnpmBin$([IO.Path]::PathSeparator)$ProbePath"
    $env:PATH = $script:ProbePath
    $script:PnpmChange = $Change
}

try {
    $git = Resolve-GateCommand "git"
    $rustc = Resolve-GateCommand "rustc"
    $cargo = Resolve-GateCommand "cargo"

    if ($git) {
        $gitState = Test-GitVersion $git
    } else {
        $GitVersion = "Missing"
        $gitState = "missing"
    }

    if ($rustc -and $cargo) {
        $rustState = Test-RustVersion $rustc $cargo
    } else {
        $RustVersion = "Missing"
        $CargoVersion = "Missing"
        $rustState = "missing"
    }
    if ($FrontendRequired) {
        $node = Resolve-GateCommand "node"
        $pnpm = Resolve-GateCommand "pnpm"
        if ($node) {
            $nodeState = Test-NodeVersion $node
        } else {
            $NodeVersion = "Missing"
            $nodeState = "missing"
        }
        if ($pnpm) {
            $pnpmState = Test-PnpmVersion $pnpm
        } else {
            $PnpmVersion = "Missing"
            $pnpmState = "missing"
        }
    } else {
        $NodeVersion = "Not-required"
        $PnpmVersion = "Not-required"
        $nodeState = "not-required"
        $pnpmState = "not-required"
    }
    $msvcMissing = -not (Test-MsvcPrerequisite)

    if ($CheckOnly) {
        "gate.git.status=$gitState"
        "gate.git.requirement=$GitRequirement"
        "gate.git.version=$GitVersion"
        "gate.rust.status=$rustState"
        "gate.rust.version=$RustVersion"
        "gate.node.status=$nodeState"
        "gate.node.requirement=$NodeRequirement"
        "gate.node.version=$NodeVersion"
        "gate.pnpm.status=$pnpmState"
        "gate.pnpm.requirement=$PnpmRequirement"
        "gate.pnpm.version=$PnpmVersion"
        "gate.msvc.status=$(if ($msvcMissing) { 'missing' } else { 'passed' })"
        if ($gitState -ne "passed" -or $rustState -ne "passed" -or ($FrontendRequired -and ($nodeState -ne "passed" -or $pnpmState -ne "passed")) -or $msvcMissing) { exit 20 }
        exit 0
    }

    if ($gitState -ne "passed") {
        $change = if ($gitState -eq "missing") { "installed" } else { "upgraded" }
        Install-MissingGit $change
        $git = Resolve-GateCommand "git"
        if (-not $git) { Stop-Gate 29 "Git 安装完成后仍无法调用 git 可执行文件" }
        $gitState = Test-GitVersion $git
        if ($gitState -ne "passed") { Stop-Gate 29 "Git 安装或升级后仍不满足 $GitRequirement" }
    }
    if ($rustState -ne "passed") {
        $change = if ($rustState -eq "missing") { "installed" } else { "upgraded" }
        Install-MissingRust $change
        $rustc = Resolve-GateCommand "rustc"
        $cargo = Resolve-GateCommand "cargo"
        if (-not $rustc -or -not $cargo) { Stop-Gate 22 "Rust 安装完成后仍无法调用 rustc 和 cargo" }
        $rustState = Test-RustVersion $rustc $cargo
        if ($rustState -ne "passed") { Stop-Gate 22 "Rust 安装或升级后仍低于 MSRV $MinimumRustMajor.$MinimumRustMinor.0" }
    }
    if ($msvcMissing) {
        Install-MissingMsvc
        if (-not (Test-MsvcPrerequisite)) {
            Stop-Gate 27 "Visual Studio Build Tools 安装完成后 MSVC C++ 工作负载仍不可用"
        }
    }
    if ($nodeState -ne "passed" -and $nodeState -ne "not-required") {
        $change = if ($nodeState -eq "missing") { "installed" } else { "upgraded" }
        Install-MissingNode $change
        $node = Resolve-GateCommand "node"
        if (-not $node) { Stop-Gate 26 "Node.js 安装完成后仍无法调用 node 可执行文件" }
        $nodeState = Test-NodeVersion $node
        if ($nodeState -ne "passed") { Stop-Gate 26 "Node.js 安装或升级后仍不满足 $NodeRequirement" }
    }
    if ($pnpmState -ne "passed" -and $pnpmState -ne "not-required") {
        $change = if ($pnpmState -eq "missing") { "installed" } else { "upgraded" }
        Install-MissingPnpm $change
        $pnpm = Resolve-GateCommand "pnpm"
        if (-not $pnpm) { Stop-Gate 28 "pnpm 安装完成后仍无法调用 pnpm 可执行文件" }
        $pnpmState = Test-PnpmVersion $pnpm
        if ($pnpmState -ne "passed") { Stop-Gate 28 "pnpm 安装或升级后仍不满足 $PnpmRequirement" }
    }

    $changed = if (@($GitChange, $RustChange, $NodeChange, $PnpmChange, $MsvcChange) | Where-Object { $_ -in @("installed", "upgraded") }) { "true" } else { "false" }
    "gate.git.status=passed"
    "gate.git.requirement=$GitRequirement"
    "gate.git.version=$GitVersion"
    "gate.git.change=$GitChange"
    "gate.rust.status=passed"
    "gate.rust.version=$RustVersion"
    "gate.rust.change=$RustChange"
    "gate.node.status=$(if ($FrontendRequired) { 'passed' } else { 'not-required' })"
    "gate.node.requirement=$NodeRequirement"
    "gate.node.version=$NodeVersion"
    "gate.node.change=$NodeChange"
    "gate.pnpm.status=$(if ($FrontendRequired) { 'passed' } else { 'not-required' })"
    "gate.pnpm.requirement=$PnpmRequirement"
    "gate.pnpm.version=$PnpmVersion"
    "gate.pnpm.change=$PnpmChange"
    "gate.msvc.status=passed"
    "gate.msvc.change=$MsvcChange"
    "gate.changed=$changed"
    $prepend = (@($PnpmBin, $NodeBin, $CargoBin, $GitBin) | Where-Object { $_ }) -join [IO.Path]::PathSeparator
    if ($prepend) { "gate.path.prepend=$prepend" }
} finally {
    foreach ($directory in $TemporaryDirectories) {
        if (Test-Path -LiteralPath $directory) { Remove-Item -LiteralPath $directory -Recurse -Force }
    }
}
