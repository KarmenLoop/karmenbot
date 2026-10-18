#!/bin/sh
# karmenbot installer for macOS and Linux (Ubuntu, Debian, Fedora, Arch, ...).
#   curl -fsSL __BASE_URL__/install.sh | sh
# Everything goes under ~/.karmenbot (runtime/, app/) plus one launcher in
# ~/.local/bin. Every download is checked against a SHA-256 before use.
#
# Environment overrides:
#   KARMENBOT_DIST_URL       where latest.json and release archives live
#   KARMENBOT_HOME           install root (default ~/.karmenbot)
#   KARMENBOT_BIN_DIR        launcher directory (default ~/.local/bin)
#   KARMENBOT_NODE_MIRROR    Node.js download mirror (default https://nodejs.org/dist)
#   KARMENBOT_FORCE_RUNTIME  1 = always use a private Node, even if node >= 22 exists
#   KARMENBOT_NO_MODIFY_PATH 1 = do not touch shell profiles
#   KARMENBOT_NO_SETUP       1 = do not open the settings centre after installing
set -eu

BASE="${KARMENBOT_DIST_URL:-__BASE_URL__}"
BASE="${BASE%/}"
KB_HOME="${KARMENBOT_HOME:-$HOME/.karmenbot}"
BIN_DIR="${KARMENBOT_BIN_DIR:-$HOME/.local/bin}"
NODE_MIRROR="${KARMENBOT_NODE_MIRROR:-https://nodejs.org/dist}"
NODE_MIRROR="${NODE_MIRROR%/}"
NODE_VERSION="__NODE_VERSION__"
STARTED="$(date +%s)"

# ── Look: the website's palette (ice, steel, accent blue) when the terminal can show it.
ESC="$(printf '\033')"
DEPTH=none
ANIM=0
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != "dumb" ]; then
  ANIM=1
  DEPTH=16
  case "${TERM:-}" in *256color*) DEPTH=256 ;; esac
  case "${COLORTERM:-}" in truecolor | 24bit) DEPTH=truecolor ;; esac
  case "${TERM_PROGRAM:-}" in iTerm.app | WezTerm | vscode | ghostty | WarpTerminal | Apple_Terminal) [ "$DEPTH" = 16 ] && DEPTH=256 ;; esac
fi
case "$DEPTH" in
  truecolor)
    ICE="$ESC[38;2;201;216;232m"; BLUE="$ESC[38;2;124;166;255m"; STEEL="$ESC[38;2;143;160;190m"; FAINT="$ESC[38;2;88;100;128m"
    OK="$ESC[38;2;76;194;131m"; WARN="$ESC[38;2;224;164;64m"; BAD="$ESC[38;2;242;148;140m"; TEXT="$ESC[38;2;237;237;235m" ;;
  256)
    ICE="$ESC[38;5;153m"; BLUE="$ESC[38;5;111m"; STEEL="$ESC[38;5;103m"; FAINT="$ESC[38;5;60m"
    OK="$ESC[38;5;78m"; WARN="$ESC[38;5;179m"; BAD="$ESC[38;5;210m"; TEXT="$ESC[38;5;255m" ;;
  16)
    ICE="$ESC[97m"; BLUE="$ESC[94m"; STEEL="$ESC[37m"; FAINT="$ESC[90m"; OK="$ESC[92m"; WARN="$ESC[93m"; BAD="$ESC[91m"; TEXT="$ESC[97m" ;;
  *) ICE=""; BLUE=""; STEEL=""; FAINT=""; OK=""; WARN=""; BAD=""; TEXT="" ;;
esac
if [ "$DEPTH" = none ]; then BOLD=""; RESET=""; CLEAR=""; else BOLD="$ESC[1m"; RESET="$ESC[0m"; CLEAR="$ESC[K"; fi

# Ask the terminal itself: inside $( ) tput sees a pipe, not the screen.
COLS="$(stty size </dev/tty 2>/dev/null | cut -d ' ' -f 2)"
case "$COLS" in '' | *[!0-9]* | 0) COLS="$(tput cols 2>/dev/null </dev/tty || echo "${COLUMNS:-80}")" ;; esac
case "$COLS" in '' | *[!0-9]* | 0) COLS=80 ;; esac

__BANNER__

say() { printf '%s\n' "$*"; }
tilde() { case "$1" in "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;; *) printf '%s' "$1" ;; esac; }
STEP=0
LABEL=""
step_line() { # mark colour detail
  printf '\r  %s│%s %s%s%s %s%s%s  %s%s%s%s' "$FAINT" "$RESET" "$2" "$1" "$RESET" "$TEXT" "$STEP  $LABEL" "$RESET" "$STEEL" "$3" "$RESET" "$CLEAR"
}
step() { STEP=$((STEP + 1)); LABEL="$1"; step_line "…" "$BLUE" ""; }
ok() { step_line "✓" "$OK" "$1"; printf '\n'; }
warn_step() { step_line "!" "$WARN" "$1"; printf '\n'; }
fail() {
  if [ -n "$LABEL" ]; then step_line "✗" "$BAD" ""; printf '\n'; fi
  printf '\n  %s%skarmenbot 安装失败：%s%s\n  %sInstall failed: %s%s\n' "$BAD" "$BOLD" "$1" "$RESET" "$FAINT" "${2:-$1}" "$RESET" >&2
  exit 1
}
# Run a slow command in the background and spin until it finishes.
spin() {
  if [ "$ANIM" != 1 ]; then "$@"; return; fi
  "$@" &
  pid=$!
  i=0
  while kill -0 "$pid" 2>/dev/null; do
    case $((i % 4)) in 0) f="◐" ;; 1) f="◓" ;; 2) f="◑" ;; *) f="◒" ;; esac
    step_line "$f" "$BLUE" "$SPIN_NOTE"
    sleep 0.1 2>/dev/null || sleep 1
    i=$((i + 1))
  done
  wait "$pid"
}
SPIN_NOTE=""

TMP="$(mktemp -d 2>/dev/null || mktemp -d -t karmenbot)"
trap 'rm -rf "$TMP"' EXIT INT TERM

if command -v curl >/dev/null 2>&1; then
  fetch() { curl -fsSL --retry 2 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  fetch() { wget -q -O "$2" "$1"; }
else
  fail "需要 curl 或 wget（Ubuntu 可以先运行：sudo apt install curl）" "curl or wget is required"
fi
if command -v shasum >/dev/null 2>&1; then
  sha256() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
elif command -v sha256sum >/dev/null 2>&1; then
  sha256() { sha256sum "$1" | cut -d ' ' -f 1; }
else
  fail "需要 shasum 或 sha256sum" "shasum or sha256sum is required"
fi

# ── The way in.
say ""
banner
case $(( $$ % 5 )) in
  0) QUIP="正在把一束光折进你的电脑……" ;;
  1) QUIP="泡杯茶吧，水还没开我就装好了。" ;;
  2) QUIP="每个文件都要对一遍指纹，连一个比特都不放过。" ;;
  3) QUIP="安装不需要管理员权限，也不会动你的系统设置。" ;;
  *) QUIP="玻璃擦亮了，马上开工。" ;;
esac
say ""
printf '  %s%s%s\n\n' "$STEEL" "$QUIP" "$RESET"
printf '  %s┌─%s %s%s安装 karmenbot%s %s%s%s\n' "$FAINT" "$RESET" "$ICE" "$BOLD" "$RESET" "$FAINT" "─────────────────────────────────────────────" "$RESET"

# 1. System.
step "检查系统"
case "$(uname -s)" in
  Darwin) OS=darwin; OS_NAME="macOS $(sw_vers -productVersion 2>/dev/null || echo)" ;;
  Linux)
    OS=linux
    OS_NAME="Linux"
    if [ -r /etc/os-release ]; then OS_NAME="$(. /etc/os-release && printf '%s' "${PRETTY_NAME:-Linux}")"; fi ;;
  MINGW* | MSYS* | CYGWIN*) fail "Windows 请在 PowerShell 里运行：irm $BASE/install.ps1 | iex" "on Windows run in PowerShell: irm $BASE/install.ps1 | iex" ;;
  *) fail "暂不支持这个系统：$(uname -s)" "unsupported system: $(uname -s)" ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) ARCH=arm64 ;;
  x86_64 | amd64) ARCH=x64 ;;
  armv7l | armv7*) ARCH=armv7l ;;
  *) fail "暂不支持这个处理器：$(uname -m)" "unsupported CPU: $(uname -m)" ;;
esac
ok "${OS_NAME} · ${ARCH}"

# 2. Node.js 22+: reuse the system one, or fetch a private copy.
step "准备 Node.js"
NODE=""
if [ "${KARMENBOT_FORCE_RUNTIME:-0}" != "1" ] && command -v node >/dev/null 2>&1; then
  MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$MAJOR" -ge 22 ] 2>/dev/null; then NODE="$(command -v node)"; fi
fi
if [ -n "$NODE" ]; then
  ok "系统自带 $("$NODE" -v)"
else
  if [ "$OS" = linux ]; then
    if ldd --version 2>&1 | grep -qi musl; then
      fail "这个 Linux 使用 musl（例如 Alpine），请先用系统包管理器装好 Node.js 22 以上再运行本脚本" "musl-based Linux (e.g. Alpine): install Node.js 22+ with your package manager first"
    fi
    GLIBC="$(ldd --version 2>/dev/null | head -n 1 | grep -o '[0-9]\+\.[0-9]\+$' || echo 0.0)"
    if [ "$GLIBC" != 0.0 ] && { [ "${GLIBC%%.*}" -lt 2 ] || { [ "${GLIBC%%.*}" -eq 2 ] && [ "${GLIBC#*.}" -lt 28 ]; }; } 2>/dev/null; then
      fail "系统太旧（glibc $GLIBC），Node.js 22 需要 glibc 2.28 以上，例如 Ubuntu 20.04 或更新" "glibc $GLIBC is too old; Node.js 22 needs 2.28+ (Ubuntu 20.04 or newer)"
    fi
  fi
  NAME="node-$NODE_VERSION-$OS-$ARCH"
  RUNTIME="$KB_HOME/runtime/$NAME"
  if [ ! -x "$RUNTIME/bin/node" ]; then
    SPIN_NOTE="下载 $NODE_VERSION"
    spin fetch "$NODE_MIRROR/$NODE_VERSION/SHASUMS256.txt" "$TMP/SHASUMS256.txt" || fail "无法下载 Node.js 校验文件（网络慢可设置 KARMENBOT_NODE_MIRROR）" "cannot download Node.js checksums"
    spin fetch "$NODE_MIRROR/$NODE_VERSION/$NAME.tar.gz" "$TMP/node.tar.gz" || fail "无法下载 Node.js（网络慢可设置 KARMENBOT_NODE_MIRROR）" "cannot download Node.js"
    WANT="$(grep " $NAME.tar.gz\$" "$TMP/SHASUMS256.txt" | cut -d ' ' -f 1)"
    [ -n "$WANT" ] && [ "$WANT" = "$(sha256 "$TMP/node.tar.gz")" ] || fail "Node.js 校验不一致，已停止" "Node.js checksum mismatch; stopped"
    mkdir -p "$KB_HOME/runtime"
    SPIN_NOTE="解压"
    spin tar -xzf "$TMP/node.tar.gz" -C "$TMP"
    rm -rf "$RUNTIME"
    mv "$TMP/$NAME" "$RUNTIME"
  fi
  NODE="$RUNTIME/bin/node"
  ok "私用 $("$NODE" -v) · 已校验"
fi

# 3. Release information.
step "获取发布信息"
fetch "$BASE/latest.json" "$TMP/latest.json" || fail "无法连接发布地址 $BASE" "cannot reach $BASE"
VERSION="$("$NODE" -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!/^[0-9A-Za-z.+-]+$/.test(m.version))process.exit(1);console.log(m.version)' "$TMP/latest.json")" || fail "发布信息无效" "invalid release manifest"
FILE="$("$NODE" -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!/^[0-9A-Za-z._-]+\.tar\.gz$/.test(m.file))process.exit(1);console.log(m.file)' "$TMP/latest.json")" || fail "发布信息无效" "invalid release manifest"
WANT="$("$NODE" -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(m.sha256||"")' "$TMP/latest.json")"
KFILE="$("$NODE" -e 'const k=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).kernel||{};if(!/^[0-9A-Za-z._-]+\.tar\.gz$/.test(k.file||""))process.exit(1);console.log(k.file)' "$TMP/latest.json")" || fail "发布信息无效（缺内核包）" "invalid release manifest (no kernel)"
KWANT="$("$NODE" -e 'const k=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).kernel||{};console.log(k.sha256||"")' "$TMP/latest.json")"
ok "karmenbot $VERSION"

# 4. The open-source app and the Koder kernel (closed, from the official site), both verified.
step "下载安装包"
SPIN_NOTE="$FILE"
spin fetch "$BASE/$FILE" "$TMP/$FILE" || fail "无法下载 $FILE" "cannot download $FILE"
[ -n "$WANT" ] && [ "$WANT" = "$(sha256 "$TMP/$FILE")" ] || fail "安装包校验不一致，已停止，没有安装任何东西" "archive checksum mismatch; nothing was installed"
SPIN_NOTE="$KFILE"
spin fetch "$BASE/$KFILE" "$TMP/$KFILE" || fail "无法下载 $KFILE" "cannot download $KFILE"
[ -n "$KWANT" ] && [ "$KWANT" = "$(sha256 "$TMP/$KFILE")" ] || fail "内核包校验不一致，已停止，没有安装任何东西" "kernel checksum mismatch; nothing was installed"
SIZE="$(($(wc -c < "$TMP/$FILE") / 1024))"
KSIZE="$(($(wc -c < "$TMP/$KFILE") / 1024))"
ok "${SIZE} KB + 内核 ${KSIZE} KB · SHA-256 已校验"

# 5. Unpack and the launcher. If that Node later moves (nvm, upgrades), fall back to PATH.
step "安装"
mkdir -p "$KB_HOME/app" "$TMP/unpack"
tar -xzf "$TMP/$FILE" -C "$TMP/unpack"
tar -xzf "$TMP/$KFILE" -C "$TMP/unpack"
[ -f "$TMP/unpack/karmenbot-$VERSION/bin/karmenbot.mjs" ] && [ -f "$TMP/unpack/karmenbot-kernel-$VERSION/vendor/MANIFEST.json" ] || fail "安装包结构不对" "unexpected archive layout"
mv "$TMP/unpack/karmenbot-kernel-$VERSION/vendor" "$TMP/unpack/karmenbot-$VERSION/vendor"
mv "$TMP/unpack/karmenbot-kernel-$VERSION/KERNEL-LICENSE.md" "$TMP/unpack/karmenbot-$VERSION/KERNEL-LICENSE.md"
rm -rf "$KB_HOME/app/$VERSION"
mv "$TMP/unpack/karmenbot-$VERSION" "$KB_HOME/app/$VERSION"
# The installed copy carries the official site, so updates can be looked up
# without remembering the address. distUrl is the address this copy came from.
"$NODE" -e 'const fs=require("fs");const p=process.argv[1]+"/site.json";let s={};try{s=JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){}s.site=s.site||"https://karmenloop.com";s.updates=s.updates||"https://karmenloop.com/updates.html";s.download=s.download||"https://karmenloop.com/download.html";s.bot=s.bot||"https://karmenloop.com/karmen-bot.html";s.github=s.github||"https://github.com/KarmenLoop/karmenbot";s.email=s.email||"info@karmenloop.com";s.distUrl=process.argv[2];fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n")' "$KB_HOME/app/$VERSION" "$BASE"
rm -f "$KB_HOME/app/current"
ln -s "$KB_HOME/app/$VERSION" "$KB_HOME/app/current"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/karmenbot" <<EOF
#!/bin/sh
NODE="$NODE"
[ -x "\$NODE" ] || NODE=node
exec "\$NODE" "$KB_HOME/app/current/bin/karmenbot.mjs" "\$@"
EOF
chmod 755 "$BIN_DIR/karmenbot"
"$BIN_DIR/karmenbot" --version >/dev/null 2>&1 || fail "安装后无法启动 karmenbot" "karmenbot does not start after install"
ok "$(tilde "$BIN_DIR")/karmenbot"

# 6. PATH, once.
step "加入 PATH"
case ":$PATH:" in
  *":$BIN_DIR:"*) ON_PATH=1 ;;
  *) ON_PATH=0 ;;
esac
PROFILE=""
if [ "$ON_PATH" = 1 ]; then
  ok "已在 PATH 里"
elif [ "${KARMENBOT_NO_MODIFY_PATH:-0}" = 1 ]; then
  warn_step "按你的要求没有改动，请自己把 ${BIN_DIR} 加入 PATH"
else
  case "$(basename "${SHELL:-sh}")" in
    zsh) PROFILE="$HOME/.zshrc" ;;
    bash) if [ "$OS" = darwin ]; then PROFILE="$HOME/.bash_profile"; else PROFILE="$HOME/.bashrc"; fi ;;
    fish) PROFILE="" ;;
    *) PROFILE="$HOME/.profile" ;;
  esac
  if [ -n "$PROFILE" ]; then
    if ! grep -q '# karmenbot PATH' "$PROFILE" 2>/dev/null; then
      printf '\n# karmenbot PATH\nexport PATH="%s:$PATH"\n' "$BIN_DIR" >> "$PROFILE"
    fi
    ok "$(tilde "$PROFILE")"
  else
    warn_step "fish 用户请运行：fish_add_path ${BIN_DIR}"
  fi
fi

ELAPSED=$(( $(date +%s) - STARTED ))
printf '  %s└─%s %s完成 · 用时 %s 秒%s\n\n' "$FAINT" "$RESET" "$OK" "$ELAPSED" "$RESET"
printf '  %s%s✓ karmenbot %s 安装完成 / installed%s\n\n' "$OK" "$BOLD" "$VERSION" "$RESET"
if [ "$ON_PATH" = 0 ]; then printf '  %s1.%s 新开一个终端，或先运行：%sexport PATH="%s:$PATH"%s\n' "$BLUE" "$RESET" "$ICE" "$BIN_DIR" "$RESET"; fi
printf '  %s2.%s 设置：%skarmenbot settings%s    %s3.%s 开始：%skarmenbot%s    %s4.%s 教程：%skarmenbot 教程%s\n' "$BLUE" "$RESET" "$ICE" "$RESET" "$BLUE" "$RESET" "$ICE" "$RESET" "$BLUE" "$RESET" "$ICE" "$RESET"
printf '  %s（装好了。接下来的活儿，交给我。）%s\n' "$STEEL" "$RESET"

# 7. First run opens the settings centre (keyboard and mouse) when a terminal
#    is available, also under curl | sh.
if [ "${KARMENBOT_NO_SETUP:-0}" != "1" ] && [ -t 1 ] && [ -r /dev/tty ] && [ ! -f "$KB_HOME/config.json" ]; then
  say ""
  "$BIN_DIR/karmenbot" settings < /dev/tty || true
fi
