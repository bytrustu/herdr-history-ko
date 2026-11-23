#!/bin/sh
# 지금 쓰는 Herdr(~/.config/herdr-app)의 모드를 이 저장소로 옮겨 담는다(만드는 사람용).
# 레이아웃은 저장소의 것을 그대로 둔다. 옮긴 뒤 이 컴퓨터의 홈 경로가 섞였는지 찾고, 바뀐 파일을 보여 준다.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
MODS="request-log sidebar-spaces sidebar-agents sidebar-chrome"
for m in $MODS; do
  [ -f "$APP/mods/$m/main.js" ] || { printf '%s 모드가 없습니다: %s\n' "$m" "$APP/mods/$m" >&2; exit 1; }
  # Herdr 가 쓰는 파일(.d.ts, jsconfig), 다른 안을 둔 alt, 숨김 파일은 옮기지 않는다.
  rsync -a --delete --exclude gpui-kit.d.ts --exclude jsconfig.json --exclude alt --exclude __pycache__ --exclude '.*' \
    "$APP/mods/$m/" "$ROOT/mods/$m/"
done
if grep -rIn -e "$HOME" -e "/Users/$(id -un)/" "$ROOT/mods" "$ROOT/layouts"; then
  printf '\n위 줄에 이 컴퓨터의 경로가 들어 있습니다. 지운 뒤 다시 하세요.\n' >&2
  exit 1
fi
printf '옮겨 담았습니다. 바뀐 파일:\n'
git -C "$ROOT" status --short -- mods layouts || true
printf '\n다음: VERSION 을 올리고 CHANGELOG.md 에 적은 뒤 커밋 · 태그(git tag v<버전>).\n'
