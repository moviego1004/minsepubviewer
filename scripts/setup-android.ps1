param([switch]$AcceptSdkLicenses)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$toolsRoot = Join-Path $env:LOCALAPPDATA 'MinsAndroid'
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
$jdkRoot = Join-Path $toolsRoot 'jdk-21'
$downloads = Join-Path $toolsRoot 'downloads'
New-Item -ItemType Directory -Force -Path $downloads, $sdkRoot | Out-Null

function Assert-ChildPath([string]$Target, [string]$Root) {
    $resolved = [IO.Path]::GetFullPath($Target)
    $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside installation directory: $resolved"
    }
}

function Download-Verified([string]$Url, [string]$Destination, [string]$Checksum) {
    if ((Test-Path -LiteralPath $Destination) -and (Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -eq $Checksum) { return }
    & curl.exe --fail --location --retry 2 --silent --show-error --output $Destination $Url
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $Url" }
    if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ne $Checksum) {
        throw "Checksum mismatch: $Destination"
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $jdkRoot 'bin/java.exe'))) {
    Write-Output 'Downloading and verifying Eclipse Temurin JDK 21...'
    $assets = Invoke-RestMethod 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
    $package = $assets[0].binary.package
    $jdkArchive = Join-Path $downloads $package.name
    Download-Verified $package.link $jdkArchive $package.checksum
    $stage = Join-Path $toolsRoot ('jdk-stage-' + [guid]::NewGuid().ToString('N'))
    Expand-Archive -LiteralPath $jdkArchive -DestinationPath $stage
    $unpacked = @(Get-ChildItem -LiteralPath $stage -Directory)
    if ($unpacked.Count -ne 1) { throw 'Unexpected JDK archive structure' }
    Assert-ChildPath $unpacked[0].FullName $toolsRoot
    Assert-ChildPath $jdkRoot $toolsRoot
    if (Test-Path -LiteralPath $jdkRoot) { throw "Existing incomplete JDK installation: $jdkRoot" }
    Move-Item -LiteralPath $unpacked[0].FullName -Destination $jdkRoot
    Write-Output "JDK installed: $jdkRoot"
}

$cliRoot = Join-Path $sdkRoot 'cmdline-tools/22.0'
$sdkManager = Join-Path $cliRoot 'bin/sdkmanager.bat'
if (-not (Test-Path -LiteralPath $sdkManager)) {
    Write-Output 'Downloading and verifying Android command-line tools 22.0...'
    $cliArchive = Join-Path $downloads 'commandlinetools-win-15859902_latest.zip'
    Download-Verified 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' $cliArchive '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
    $stage = Join-Path $sdkRoot ('cli-stage-' + [guid]::NewGuid().ToString('N'))
    Expand-Archive -LiteralPath $cliArchive -DestinationPath $stage
    $unpacked = Join-Path $stage 'cmdline-tools'
    Assert-ChildPath $unpacked $sdkRoot
    Assert-ChildPath $cliRoot $sdkRoot
    New-Item -ItemType Directory -Force -Path (Split-Path $cliRoot) | Out-Null
    if (Test-Path -LiteralPath $cliRoot) { throw "Existing incomplete SDK tools installation: $cliRoot" }
    Move-Item -LiteralPath $unpacked -Destination $cliRoot
}

$env:JAVA_HOME = $jdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:Path = "$jdkRoot\bin;$sdkRoot\platform-tools;$env:Path"
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdkRoot, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdkRoot, 'User')
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$entries = @($userPath -split ';' | Where-Object { $_ })
foreach ($entry in @("$jdkRoot\bin", "$sdkRoot\platform-tools", "$cliRoot\bin")) {
    if ($entries -notcontains $entry) { $entries += $entry }
}
[Environment]::SetEnvironmentVariable('Path', ($entries -join ';'), 'User')

Write-Output 'Installing SDK Platform 36, Build Tools and ADB...'
$installLog = Join-Path $toolsRoot 'sdk-install.log'
$packages = @('platform-tools', 'platforms;android-36', 'build-tools;35.0.0', 'build-tools;36.0.0')
if ($AcceptSdkLicenses) {
    # Only the licenses requested by these selected packages are accepted.
    1..10 | ForEach-Object { 'y' } | & $sdkManager "--sdk_root=$sdkRoot" --install @packages *> $installLog
} else {
    & $sdkManager "--sdk_root=$sdkRoot" --install @packages
}
if ($LASTEXITCODE -ne 0) {
    if (Test-Path -LiteralPath $installLog) { Get-Content -LiteralPath $installLog -Tail 20 }
    throw 'Android SDK installation failed'
}
foreach ($file in @('platform-tools/adb.exe', 'platforms/android-36/android.jar', 'build-tools/35.0.0/aapt2.exe', 'build-tools/36.0.0/apksigner.bat')) {
    if (-not (Test-Path -LiteralPath (Join-Path $sdkRoot $file))) { throw "Missing SDK component: $file" }
}
& (Join-Path $jdkRoot 'bin/java.exe') -version
& (Join-Path $sdkRoot 'platform-tools/adb.exe') version
Write-Output "Android toolchain ready. JAVA_HOME=$jdkRoot ANDROID_HOME=$sdkRoot"
