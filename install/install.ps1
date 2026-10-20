# karmenbot installer for Windows 10 / 11 (Windows PowerShell 5.1 or PowerShell 7).
#   irm __BASE_URL__/install.ps1 | iex
# From CMD use install.cmd, which runs this for one session only.
# Installs into %USERPROFILE%\.karmenbot and adds its bin folder to the user PATH.
# Every download is checked against a SHA-256 before use. No administrator rights needed.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$Base = if ($env:KARMENBOT_DIST_URL) { $env:KARMENBOT_DIST_URL.TrimEnd("/") } else { "__BASE_URL__" }
$KbHome = if ($env:KARMENBOT_HOME) { $env:KARMENBOT_HOME } else { Join-Path $env:USERPROFILE ".karmenbot" }
$BinDir = Join-Path $KbHome "bin"
$NodeMirror = if ($env:KARMENBOT_NODE_MIRROR) { $env:KARMENBOT_NODE_MIRROR.TrimEnd("/") } else { "https://nodejs.org/dist" }
$NodeVersion = "__NODE_VERSION__"
$Started = Get-Date

__PS_BANNER__

# The website palette when the console understands colour escapes (Windows Terminal, recent conhost).
$Vt = [bool]($env:WT_SESSION) -or [bool]($Host.UI.psobject.Properties["SupportsVirtualTerminal"] -and $Host.UI.SupportsVirtualTerminal)
$E = [char]27
function Paint($rgb, $text) { if ($Vt) { "$E[38;2;${rgb}m$text$E[0m" } else { $text } }
$Ice = "201;216;232"; $Blue = "124;166;255"; $Steel = "143;160;190"; $Faint = "88;100;128"; $Ok = "76;194;131"; $Bad = "242;148;140"
$Check = if ($env:WT_SESSION) { "✓" } else { "√" }
$script:Step = 0

function Step($label) {
  $script:Step += 1
  $script:Label = $label
  Write-Host -NoNewline ("  " + (Paint $Faint "|") + " " + (Paint $Blue "...") + " $($script:Step)  $label")
}
function Done($detail) {
  Write-Host ("`r  " + (Paint $Faint "|") + " " + (Paint $Ok $Check) + " $($script:Step)  $($script:Label)   " + (Paint $Steel $detail) + "      ")
}
# `irm | iex` runs inside the user's own window, so never `exit` (it would
# close that window): failures throw and the outer handler reports them.
function Fail($zh, $en) {
  Write-Host ""
  Write-Host ""
  Write-Host (Paint $Bad "  karmenbot 安装失败：$zh")
  Write-Host (Paint $Faint "  Install failed: $en")
  throw "KARMENBOT_INSTALL_FAILED"
}
function Fetch($url, $file) { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $file }

$Os = [Environment]::OSVersion.Version
if ($Os.Major -lt 10) {
  Write-Host "karmenbot 需要 Windows 10 或 11。Windows 7 / 8 / XP 无法运行 Node.js 22，也不支持现在网站用的加密连接。"
  Write-Host "可以把 karmenbot 装在一台较新的电脑上，再通过飞书或微信在这台电脑上使唤它。"
  Write-Host "karmenbot needs Windows 10 or 11."
  return
}

Write-Host ""
$Width = try { $Host.UI.RawUI.WindowSize.Width } catch { 80 }
if ($Vt) { if ($Width -ge 90) { Write-Host $BannerColorWide } else { Write-Host $BannerColorNarrow } } else { Write-Host $BannerPlain }
$Quips = @("正在把一束光折进你的电脑……", "泡杯茶吧，水还没开我就装好了。", "每个文件都要对一遍指纹，连一个比特都不放过。", "安装不需要管理员权限，也不会动你的系统设置。")
Write-Host ""
Write-Host ("  " + (Paint $Steel ($Quips | Get-Random)))
Write-Host ""
Write-Host ("  " + (Paint $Faint "+-") + " " + (Paint $Ice "安装 karmenbot") + " " + (Paint $Faint "---------------------------------------------"))

$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("karmenbot-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $Tmp | Out-Null
try {
  Step "检查系统"
  $Arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64" -or $env:PROCESSOR_ARCHITEW6432 -eq "ARM64") { "arm64" } else { "x64" }
  $Name_ = if ($Os.Build -ge 22000) { "Windows 11" } else { "Windows 10" }
  $Tar = Join-Path $env:SystemRoot "System32\tar.exe"
  if (-not (Test-Path $Tar)) { Fail "缺少 tar.exe，请先把 Windows 10 更新到 1803 或更新的版本" "tar.exe is missing; update Windows 10 to 1803 or later" }
  Done "$Name_ (build $($Os.Build)) · $Arch"

  Step "准备 Node.js"
  $Node = $null
  $System = Get-Command node -ErrorAction SilentlyContinue
  if ($System -and $env:KARMENBOT_FORCE_RUNTIME -ne "1") {
    $Major = [int](& $System.Source -p "process.versions.node.split('.')[0]")
    if ($Major -ge 22) { $Node = $System.Source }
  }
  if ($Node) {
    Done ("系统自带 " + (& $Node -v))
  } else {
    $Name = "node-$NodeVersion-win-$Arch"
    $Runtime = Join-Path $KbHome "runtime\$Name"
    if (-not (Test-Path (Join-Path $Runtime "node.exe"))) {
      try {
        Fetch "$NodeMirror/$NodeVersion/SHASUMS256.txt" "$Tmp\SHASUMS256.txt"
        Fetch "$NodeMirror/$NodeVersion/$Name.zip" "$Tmp\node.zip"
      } catch { Fail "无法下载 Node.js（网络慢可设置 KARMENBOT_NODE_MIRROR）" "cannot download Node.js" }
      $Want = ((Select-String -Path "$Tmp\SHASUMS256.txt" -Pattern " $Name.zip$").Line -split "\s+")[0]
      $Have = (Get-FileHash "$Tmp\node.zip" -Algorithm SHA256).Hash.ToLower()
      if (-not $Want -or $Want -ne $Have) { Fail "Node.js 校验不一致，已停止" "Node.js checksum mismatch; stopped" }
      Expand-Archive "$Tmp\node.zip" -DestinationPath $Tmp
      New-Item -ItemType Directory -Force -Path (Join-Path $KbHome "runtime") | Out-Null
      if (Test-Path $Runtime) { Remove-Item -Recurse -Force $Runtime }
      Move-Item (Join-Path $Tmp $Name) $Runtime
    }
    $Node = Join-Path $Runtime "node.exe"
    Done ("私用 " + (& $Node -v) + " · 已校验")
  }

  Step "获取发布信息"
  try { Fetch "$Base/latest.json" "$Tmp\latest.json" } catch { Fail "无法连接发布地址 $Base" "cannot reach $Base" }
  $Manifest = Get-Content "$Tmp\latest.json" -Raw | ConvertFrom-Json
  if ($Manifest.version -notmatch '^[0-9A-Za-z.+-]+$' -or $Manifest.file -notmatch '^[0-9A-Za-z._-]+\.tar\.gz$') { Fail "发布信息无效" "invalid release manifest" }
  if (-not $Manifest.kernel -or $Manifest.kernel.file -notmatch '^[0-9A-Za-z._-]+\.tar\.gz$') { Fail "发布信息无效（缺内核包）" "invalid release manifest (no kernel)" }
  Done "karmenbot $($Manifest.version)"

  Step "下载安装包"
  try { Fetch "$Base/$($Manifest.file)" "$Tmp\$($Manifest.file)" } catch { Fail "无法下载 $($Manifest.file)" "cannot download the archive" }
  $Have = (Get-FileHash "$Tmp\$($Manifest.file)" -Algorithm SHA256).Hash.ToLower()
  if ($Have -ne $Manifest.sha256) { Fail "安装包校验不一致，已停止，没有安装任何东西" "archive checksum mismatch; nothing was installed" }
  $KFile = $Manifest.kernel.file
  try { Fetch "$Base/$KFile" "$Tmp\$KFile" } catch { Fail "无法下载 $KFile" "cannot download the kernel" }
  $KHave = (Get-FileHash "$Tmp\$KFile" -Algorithm SHA256).Hash.ToLower()
  if ($KHave -ne $Manifest.kernel.sha256) { Fail "内核包校验不一致，已停止，没有安装任何东西" "kernel checksum mismatch; nothing was installed" }
  $Kb = [math]::Round((Get-Item "$Tmp\$($Manifest.file)").Length / 1KB)
  $KKb = [math]::Round((Get-Item "$Tmp\$KFile").Length / 1KB)
  Done "$Kb KB + 内核 $KKb KB · SHA-256 已校验"

  Step "安装"
  $App = Join-Path $KbHome "app\$($Manifest.version)"
  New-Item -ItemType Directory -Force -Path "$Tmp\unpack", (Join-Path $KbHome "app") | Out-Null
  & $Tar -xzf "$Tmp\$($Manifest.file)" -C "$Tmp\unpack"
  if ($LASTEXITCODE -ne 0) { Fail "解压失败" "could not unpack the archive" }
  & $Tar -xzf "$Tmp\$KFile" -C "$Tmp\unpack"
  if ($LASTEXITCODE -ne 0) { Fail "内核解压失败" "could not unpack the kernel" }
  $KDir = "$Tmp\unpack\karmenbot-kernel-$($Manifest.version)"
  Move-Item "$KDir\vendor" "$Tmp\unpack\karmenbot-$($Manifest.version)\vendor"
  Move-Item "$KDir\KERNEL-LICENSE.md" "$Tmp\unpack\karmenbot-$($Manifest.version)\KERNEL-LICENSE.md"
  if (Test-Path $App) { Remove-Item -Recurse -Force $App }
  Move-Item "$Tmp\unpack\karmenbot-$($Manifest.version)" $App
  $SiteFile = Join-Path $App "site.json"
  @"
{
  "site": "https://karmenloop.com",
  "bot": "https://karmenloop.com/karmen-bot.html",
  "download": "https://karmenloop.com/download.html",
  "updates": "https://karmenloop.com/updates.html",
  "github": "https://github.com/KarmenLoop/karmenbot",
  "email": "info@karmenloop.com",
  "distUrl": "$($Base -replace '\\','\\')"
}
"@ | Set-Content -Path $SiteFile -Encoding utf8
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $Launcher = Join-Path $BinDir "karmenbot.cmd"
  Set-Content -Path $Launcher -Encoding ASCII -Value "@echo off`r`nsetlocal`r`nset `"KB_NODE=$Node`"`r`nif not exist `"%KB_NODE%`" set `"KB_NODE=node`"`r`n`"%KB_NODE%`" `"$App\bin\karmenbot.mjs`" %*"
  & $Launcher --version | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "安装后无法启动 karmenbot" "karmenbot does not start after install" }
  Done $Launcher

  Step "加入 PATH"
  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not $UserPath) { $UserPath = "" }
  if ($env:KARMENBOT_NO_MODIFY_PATH -eq "1") {
    Done "PATH unchanged; use $BinDir\karmenbot.cmd"
  } elseif ($UserPath -split ";" | Where-Object { $_ -eq $BinDir }) {
    Done "已在 PATH 里"
  } else {
    [Environment]::SetEnvironmentVariable("Path", (($BinDir, $UserPath) -join ";").TrimEnd(";"), "User")
    Done "用户 PATH"
  }
  $env:Path = "$BinDir;$env:Path"

  $Seconds = [math]::Round(((Get-Date) - $Started).TotalSeconds)
  Write-Host ("  " + (Paint $Faint "+-") + " " + (Paint $Ok "完成 · 用时 $Seconds 秒"))
  Write-Host ""
  Write-Host (Paint $Ok "  $Check karmenbot $($Manifest.version) 安装完成 / installed")
  Write-Host ""
  Write-Host ("  1. 关掉这个窗口，新开一个 PowerShell 或 CMD   2. 设置：" + (Paint $Ice "karmenbot settings") + "   3. 开始：" + (Paint $Ice "karmenbot") + "   4. 教程：" + (Paint $Ice "karmenbot 教程"))
  Write-Host (Paint $Steel "  （装好了。接下来的活儿，交给我。）")
  if ([Environment]::UserInteractive -and -not $env:KARMENBOT_NO_SETUP -and -not (Test-Path (Join-Path $KbHome "config.json"))) {
    Write-Host ""
    & $Launcher settings
  }
} catch {
  if ("$_" -ne "KARMENBOT_INSTALL_FAILED") {
    Write-Host ""
    Write-Host (Paint $Bad "  karmenbot 安装失败：$_")
  }
  $global:LASTEXITCODE = 1
} finally {
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
