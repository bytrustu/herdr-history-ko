#!/bin/sh
# herdr-history-ko: Herdr 앱에 「히스토리」 패널과 한글 사이드바를 더한다.
#   sh install.sh                    설치(이미 있으면 이 폴더의 버전으로 바꾼다)하고 레이아웃을 history-sidebar 로 바꾼다
#   sh install.sh --layout history   기본 사이드바에 히스토리만 더한 레이아웃으로 바꾼다
#   sh install.sh --status           설치한 버전과 이 폴더의 버전
#   sh install.sh --remove           이 키트가 설치한 것만 지운다
#   sh install.sh --force            이 키트가 설치하지 않은 같은 이름의 모드나 레이아웃이 있어도 바꾼다
# 바꾸기 전의 파일은 언제나 임시 폴더에 복사해 둔다. HERDR_APP_HOME 으로 다른 설정 폴더를 고를 수 있다.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
KIT="herdr-history-ko"
RECORD="$APP/.$KIT"
VERSION="$(tr -d ' \n' < "$HERE/VERSION")"
MODS="request-log doc-view sidebar-spaces sidebar-agents sidebar-chrome"
LAYOUTS="history history-sidebar"

say() { printf '%s\n' "$*"; }
die() { printf '%s\n' "$*" >&2; exit 1; }
usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; }
# herdr-app 명령: PATH 에 없으면 앱이 깔아 두는 자리에서 찾는다.
herdr() {
  for c in "$(command -v herdr-app 2>/dev/null || true)" "$HOME/.local/bin/herdr-app" "/Applications/Herdr.app/Contents/MacOS/Herdr"; do
    if [ -n "$c" ] && [ -x "$c" ]; then "$c" "$@"; return $?; fi
  done
  return 127
}
current() { herdr status 2>/dev/null | tr -d ' \n' | sed -n 's/.*"layout":"\([^"]*\)".*/\1/p'; }
installed_version() { [ -f "$RECORD" ] && sed -n 's/^version //p' "$RECORD" | head -n 1 || true; }
ours_layout() { [ -f "$RECORD" ] && grep -qx "layout $1" "$RECORD"; }
ours_mod() { [ -f "$APP/mods/$1/.$KIT" ]; }

mode=install layout=history-sidebar force=
while [ $# -gt 0 ]; do
  case "$1" in
    --layout) shift; layout="${1:-}" ;;
    --layout=*) layout="${1#--layout=}" ;;
    --status) mode=status ;;
    --remove) mode=remove ;;
    --force|--update) force=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 1 ;;
  esac
  shift
done
case " $LAYOUTS " in *" $layout "*) ;; *) die "레이아웃은 history 나 history-sidebar 가운데 하나입니다." ;; esac

if [ ! -d "$APP/mods" ] || [ ! -d "$APP/layouts" ]; then
  die "Herdr 설정 폴더를 찾지 못했습니다: $APP
Herdr 앱을 한 번 실행한 뒤 다시 해 주세요."
fi

if [ "$mode" = status ]; then
  have="$(installed_version)"
  say "이 폴더의 버전: $VERSION"
  say "설치한 버전: ${have:-설치하지 않음}"
  now="$(current)"; [ -n "$now" ] && say "지금 레이아웃: $now"
  exit 0
fi

if [ "$mode" = remove ]; then
  now="$(current)"
  for l in $LAYOUTS; do
    if [ "$now" = "$l" ] && ours_layout "$l"; then herdr do layout.switch '{"name":"main"}' >/dev/null 2>&1 || true; sleep 1; fi
  done
  for l in $LAYOUTS; do
    if ours_layout "$l"; then rm -f "$APP/layouts/$l.json" "$APP/layouts/$l.svg"; fi
  done
  for m in $MODS; do
    if ours_mod "$m"; then rm -rf "${APP:?}/mods/$m"; fi
  done
  rm -f "$RECORD"
  say "지웠습니다. 정리해 둔 기록은 ~/.cache/herdr-request-log 와 ~/.cache/herdr-doc-view 에 남아 있습니다. 필요 없으면 그 폴더도 지우세요."
  exit 0
fi

if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then
  die "Python 3 이 필요합니다. 설치한 뒤 다시 해 주세요(터미널에서 xcode-select --install 또는 brew install python)."
fi

# 이 키트가 설치하지 않은 같은 이름이 있으면 멈춘다(--force 면 옮겨 두고 바꾼다).
taken=""
for m in $MODS; do
  if [ -e "$APP/mods/$m" ] && ! ours_mod "$m"; then taken="$taken mods/$m"; fi
done
for l in $LAYOUTS; do
  if [ -e "$APP/layouts/$l.json" ] && ! ours_layout "$l"; then taken="$taken layouts/$l.json"; fi
done
if [ -n "$taken" ] && [ -z "$force" ]; then
  die "이 키트가 설치하지 않은 같은 이름이 이미 있습니다:$taken
예전에 받은 히스토리 패키지라면 이 폴더의 것으로 바꿔도 됩니다: sh install.sh --force
(바꾸기 전의 파일은 임시 폴더에 복사해 둡니다)"
fi

# 바꾸기 전의 것을 옮겨 둔다.
keep=""
for m in $MODS; do
  if [ -e "$APP/mods/$m" ]; then
    [ -n "$keep" ] || { keep="${TMPDIR:-/tmp}"; keep="${keep%/}/$KIT-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$keep/mods" "$keep/layouts"; }
    cp -R "$APP/mods/$m" "$keep/mods/$m"
  fi
done
for l in $LAYOUTS; do
  if [ -e "$APP/layouts/$l.json" ]; then
    [ -n "$keep" ] || { keep="${TMPDIR:-/tmp}"; keep="${keep%/}/$KIT-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$keep/mods" "$keep/layouts"; }
    cp "$APP/layouts/$l.json" "$keep/layouts/"
  fi
done

before="$(installed_version)"
for m in $MODS; do
  rm -rf "${APP:?}/mods/$m"
  mkdir -p "$APP/mods/$m"
  cp -R "$HERE/mods/$m/." "$APP/mods/$m/"
  printf '%s %s\n' "$KIT" "$VERSION" > "$APP/mods/$m/.$KIT"
done
{
  printf 'version %s\n' "$VERSION"
  for l in $LAYOUTS; do
    cp "$HERE/layouts/$l.json" "$HERE/layouts/$l.svg" "$APP/layouts/"
    printf 'layout %s\n' "$l"
  done
} > "$RECORD"

if [ -n "$before" ] && [ "$before" != "$VERSION" ]; then say "$before 에서 $VERSION 으로 바꿨습니다."
elif [ -n "$before" ]; then say "$VERSION 을 다시 설치했습니다."
else say "$VERSION 을 설치했습니다."; fi
[ -n "$keep" ] && say "바꾸기 전의 파일은 $keep 에 복사해 두었습니다."
if ! xcode-select -p >/dev/null 2>&1; then
  say "참고: 문서 보기는 Xcode 명령줄 도구로 문서를 그립니다. 터미널에서 xcode-select --install 로 설치해 두세요."
fi

if ! herdr --version >/dev/null 2>&1; then
  say "Herdr 를 열고 ctrl-shift-l 을 눌러 레이아웃을 $layout 로 바꿔 주세요."
  exit 0
fi
for m in $MODS; do
  out="$(herdr check "$APP/mods/$m" 2>&1 || true)"
  case "$out" in
    "check passed"*) ;;
    *) die "파일은 복사했지만 이 Herdr 에서 $m 모드가 열리지 않습니다:
$out" ;;
  esac
done
sleep 1
if [ "$(current)" = "$layout" ]; then
  say "레이아웃은 이미 $layout 입니다."
elif herdr do layout.switch "{\"name\":\"$layout\"}" >/dev/null 2>&1; then
  say "레이아웃을 $layout 로 바꿨습니다. 원래 쓰던 레이아웃으로는 ctrl-shift-l 로 돌아갑니다."
else
  say "Herdr 를 열고 ctrl-shift-l 을 눌러 레이아웃을 $layout 로 바꿔 주세요."
fi
