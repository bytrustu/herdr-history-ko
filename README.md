# herdr-history-ko

Herdr 앱에 더하는 화면 묶음입니다. 오른쪽에 「히스토리」 패널을 붙이고, 왼쪽 사이드바를 한글로 다듬었습니다.

![미리보기](preview.png)

## 들어 있는 것

- **히스토리 패널**: 지금 보고 있는 에이전트(Claude Code · Codex · Antigravity)에게 보낸 요청을 하나씩 나눠 보여 줍니다.
  - 요청마다 제목, 걸린 시간, 명령 수, 바꾼 파일, 누가 했는지(모델 · effort)가 나옵니다.
  - 줄을 누르면 요약 · 답변 · 진행 과정 · 바꾼 파일 · 보낸 글을 창으로 봅니다.
  - Herdr 에 추가한 다른 컴퓨터의 에이전트도 그 컴퓨터에서 읽어 옵니다.
- **한글 사이드바**: 스페이스 목록과 에이전트 목록을 한글로 바꾸고, 컴퓨터 아래에 스페이스가 오도록 정리했습니다.
  - 에이전트 정렬은 급한 순서 · 스페이스별 · 컴퓨터별 세 가지입니다.
  - 화면 공유가 켜진 다른 Mac 줄에는 화면 공유를 여는 단추가 생깁니다.
- **레이아웃 두 개**
  - `history-sidebar`: 한글 사이드바 + 히스토리(기본으로 바뀌는 것)
  - `history`: Herdr 기본 사이드바 + 히스토리

## 필요한 것

- macOS 의 Herdr 앱(0.1.16 에서 확인했습니다)
- Python 3.9 이상(`python3`)
- Claude Code 로그인: 제목과 요약을 만드는 데 씁니다. 없어도 패널은 열리고, 제목 자리에는 에이전트가 한 말의 첫 문장이 나옵니다.

## 설치

```sh
git clone https://github.com/bytrustu/herdr-history-ko.git
cd herdr-history-ko
sh install.sh
```

설치가 끝나면 레이아웃이 `history-sidebar` 로 바뀝니다. 기본 사이드바를 그대로 쓰려면 `sh install.sh --layout history` 로 설치합니다.
원래 쓰던 레이아웃으로는 Herdr 에서 ctrl-shift-l 로 돌아갑니다.

Herdr 안의 에이전트에게 「이 폴더의 install.sh 로 설치해 줘」라고 맡겨도 됩니다.

## 업데이트

```sh
cd herdr-history-ko
git pull
sh install.sh
```

- 설치한 버전과 받은 버전은 `sh install.sh --status` 로 봅니다.
- 바뀐 내용은 [CHANGELOG.md](CHANGELOG.md) 에 버전마다 적습니다.
- 설치할 때마다 바꾸기 전의 파일을 임시 폴더에 복사해 두고, 그 위치를 알려 줍니다.

## 지우기

```sh
sh install.sh --remove
```

이 키트가 설치한 모드와 레이아웃만 지웁니다. 지금 화면이 이 키트의 레이아웃이면 먼저 Herdr 기본 레이아웃으로 돌려놓습니다.

## 알아둘 것

- **Claude 에 보내는 것**: 제목과 요약은 내 컴퓨터의 `claude` 명령으로 만듭니다. Claude Code 구독 로그인을 쓰고 모델은 Sonnet 입니다. 보낸 요청의 글과 답변의 앞부분이 Claude 로 갑니다. API 키는 쓰지 않습니다.
- **요약 끄기**: 레이아웃 파일에서 `"id": "requests"` 블록을 `{ "mod": "request-log", "props": { "summaries": false } }` 로 바꿉니다.
- **읽는 것**: 내 컴퓨터에 남은 Claude Code · Codex · Antigravity 대화 파일을 읽고, 정리한 내용은 `~/.cache/herdr-request-log` 에 적어 둡니다.
- **실행하는 명령**: 어느 대화인지 찾느라 `ps` · `lsof` 를, 다른 컴퓨터를 읽느라 `hc` 를 씁니다. 사이드바는 화면 공유 단추를 보일지 정하느라 `ssh -G` 와 `nc` 를 씁니다.
- **Herdr 업데이트와의 관계**: 한글 사이드바는 Herdr 0.1.16 의 기본 사이드바를 복제해 고친 것입니다. 그래서 Herdr 가 업데이트되어도 사이드바에는 그 변경이 들어오지 않습니다. 맞춰야 할 변경이 생기면 이 키트의 새 버전으로 냅니다.
- 같은 폴더에서 Codex 를 여럿 띄우면 어느 대화인지 가려내지 못할 때가 있습니다. 그럴 때는 고르지 않고 알려 줍니다.

## 만드는 사람에게

내 Herdr 에서 고친 것을 이 저장소로 옮길 때는 다음 순서로 합니다.

1. `sh tools/export.sh`: `~/.config/herdr-app` 의 모드를 저장소로 옮겨 담고, 개인 경로가 섞였는지 검사합니다.
2. `VERSION` 을 올리고 `CHANGELOG.md` 에 바뀐 것을 적습니다.
3. 커밋한 뒤 `git tag v<버전>` 으로 표시하고 올립니다.

## 만든 방법

다른 에이전트가 빈 폴더에서 같은 것을 만들 수 있도록 [RECIPE.md](RECIPE.md) 에 화면 · 동작 · 구성을 적어 두었습니다.

## 바탕

히스토리 패널은 [herunan/herdr-over9k](https://github.com/herunan/herdr-over9k) 의 Timeline(MIT)을 바탕으로 했습니다. `mods/request-log/LICENSE.over9k` 를 참고하세요. 이 저장소는 MIT 라이선스입니다([LICENSE](LICENSE)).
