# Session History KR

Claude Code, Codex, Antigravity에 맡긴 일이 어디까지 진행됐는지 히스토리에서 요청별로 확인합니다. 에이전트가 만든 HTML 문서는 Herdr 안에서 바로 봅니다. 한글 사이드바는 스페이스를 컴퓨터별로 묶고 확인이 필요한 에이전트를 먼저 보여 줍니다. 재부팅 뒤에는 셸만 남은 터미널에서 에이전트 대화를 다시 열 수 있습니다.

![Session History KR](preview.png)

레이아웃은 두 가지입니다. 둘 다 히스토리를 보여 주며, `history-sidebar` 는 한글 사이드바를, `history` 는 Herdr 기본 사이드바를 씁니다.

**What you see:**

왼쪽에서 오른쪽으로.

- **사이드바**(268px, `chrome` 바탕): 위 46px 는 기본 `workspace-chrome`, 가운데는 스페이스 목록과 에이전트 목록이 같은 비율(각각 최소 90px), 바닥 69px 는 「설정」 · 「컴퓨터 추가」.
  - 스페이스 목록: 머리 「스페이스 N」과 +. 다른 컴퓨터가 등록되어 있으면 컴퓨터 줄(11px semibold, 이 컴퓨터는 모니터 아이콘과 「이 컴퓨터」, 다른 컴퓨터는 서버 아이콘과 이름, 이름 옆에 스페이스 수(`dim`), 연결 점, +, 접기 화살표)이 생긴다. 그 아래 스페이스 줄은 14px 더 들여 쓰이고, 컴퓨터 아이콘 가운데(줄 왼쪽에서 14px)에서 1px `border` 세로선이 그 컴퓨터의 스페이스 줄을 따라 내려온다. 스페이스 줄은 8px 색 점(스페이스 색), 이름, 평범하지 않을 때만 저장소 · 브랜치, 오른쪽에 그 안의 에이전트 수와 가장 급한 상태.
  - 화면 공유(5900)가 열린 다른 컴퓨터 줄에는 화면 공유 단추가 붙는다.
  - 에이전트 목록: 머리 「에이전트 N」과 정렬 아이콘(급한 순서 시계 · 스페이스별 겹친 층 · 컴퓨터별 모니터).
    - 스페이스별: 스페이스 머리(8px 색 점, 이름, 수) 아래 에이전트 줄(앱 아이콘, 제목, 지난 시간, 상태). 다른 컴퓨터의 스페이스는 머리 끝에 서버 아이콘과 컴퓨터 이름.
    - 컴퓨터별: 컴퓨터 머리(13px 아이콘, 이름, 수, 접기 화살표) 아래 스페이스 묶음이 8px 들여 쓰인다. 두 번째 컴퓨터부터 위에 1px 선.
    - 급한 순서: 확인 필요 · 끝남 · 작업 중 · 쉬는 중 구역. 줄은 「스페이스 · 제목」, 다른 컴퓨터 줄 끝에 서버 아이콘과 이름.
    - 에이전트 줄의 강약: 작업 중은 이름을 semibold 로, 줄 바탕을 `working` 색 8%(`+ "14"`) 면으로. 상태 표지는 끝남(아직 안 봄)이 `done` 색 15% 원(14px) 안의 `done` 색 체크, 끝내고 본 것이 체크만(끝난 지 한 시간 안이면 `done` 색, 넘으면 `dim`), 일을 시킨 적 없이 쉬는 것이 7px 고리. 끝난 지 한 시간이 지난 쉬는 줄만(지금 보고 있지 않을 때) 이름을 `muted` 로, 줄 전체를 불투명도 0.55 로 흐리게 하고, 마우스를 올리면 원래대로. 방금 끝난 일은 흐리지 않는다. 한 시간은 쉬는 상태가 된 시각부터 세고(끝남과 쉬는 중은 한 상태로 본다), 일을 했는지는 상태가 바뀔 때 앞 상태가 쉬는 중이 아니었는지로 localStorage `changed` 에 적어 둔다.
    - 에이전트 제목: 이름 붙인 탭이면 탭 이름, 아니면 터미널 제목. Antigravity(agy)는 터미널 제목에 터미널 주소만 남겨, agy 가 저장한 대화 제목을 쓴다.
  - 에이전트 다시 열기 카드는 다시 열 에이전트가 있을 때 에이전트 목록의 머리글과 항목 사이에 표시한다. 카드 바탕은 `done` 색 8%(`+ "14"`), 바깥 여백은 좌우 8 · 아래 8, 모서리 반경은 10으로 한다. 첫 줄에는 14px 되돌리기 아이콘(`revive.svg`, `done` 색)과 「재부팅 전 에이전트 N개」(12.5px semibold)를 표시한다. 둘째 줄에는 탭 이름을 셋까지 「 · 」로 잇고, 그보다 많으면 「외 N개」를 덧붙인다(11.5px `muted`, 마우스를 올리면 전체 이름 표시). 탭 이름이 없거나 숫자뿐이면 앱 이름(Claude Code · Codex · Antigravity)을 쓴다. 셋째 줄에는 「다시 열기」 버튼(26px, `done` 바탕에 흰 semibold 글자, 여는 동안 「여는 중…」)과 글자 버튼 「닫기」(마우스를 올리면 「이번에는 열지 않습니다」)를 둔다. 열기를 마치면 36px 줄에 체크와 「에이전트 N개를 다시 열었습니다」(못 열면 「다시 열지 못했습니다」)를 5초 동안 표시한다. 사이드바를 좁게 접으면 카드를 숨긴다.
- **탭 줄**(42px): 기본 `tabs` 와 오른쪽 96px 「히스토리」 단추(15px 시계 아이콘 `icon.png` + 글자). 패널이 열려 있으면 단추가 눌린 면으로 보인다.
- **본문**(안쪽 여백 8, 간격 8): 터미널, 숨은 파일 · 변경 패널, 히스토리 칸(384px, 300~720px 로 끌어 바꿈). 맨 아래 상태 줄 28px.
- **히스토리 패널**: 테두리 대신 바탕보다 옅은 면(`raised`)으로 나눈다.
  - 머리: 18px 아이콘과 「히스토리」(14px 굵게), 오른쪽에 「문서 N」 알약(에이전트가 연 문서가 있을 때, 문서 아이콘 13px)과 따라가는 에이전트 칩(앱 아이콘 + 「앱 이름 · 스페이스」).
  - 주제 카드: 대화 전체의 주제, 지금까지 한 일 한 문장, 「요청 N건 · 컨텍스트 Nk」.
  - 날짜 묶음(「오늘」 · 「어제」 · 「11월 17일 월요일」) 아래 최근 요청부터 한 줄씩: 상태 표지, 제목, 지금 하는 일이나 답변 첫 문장, 「시각 · 걸린 시간 · 명령 N번 · 파일 N개 · 문서 N개 · 덧붙인 말 N개」, 모델 알약(앱 아이콘 + 「모델 · effort」)과 함께 일한 쪽 알약(셋까지, 넘으면 「+N」).
- **요청 창**(줄을 누르면 뜨는 모달): 제목과 시각, 「누가 했나」(한 줄에 한 쪽: 아이콘, 이름, 어떻게 맡았는지, 모델, effort 눈금 다섯 칸, 출력 토큰과 몫 막대), 「작업 흐름」(같은 폭 칸의 기둥과 실행 `#2a78d6` · 수정 `#eb6834` · 읽기 · 검색 `#1baf7a` · 그 밖 구성 막대), 탭 다섯(요약 · 답변 · 진행 과정 · 바꾼 파일 · 보낸 글). 그 요청에 문서가 있으면 머리의 닫기 단추 앞에 「문서 N」 단추.
- **문서 보기**(다이얼로그, 창의 94%): 머리에 34px 문서 아이콘 면, 문서 제목(15px 굵게, 없으면 파일 이름), 그 아래 「컴퓨터 · 경로」(11.5px, 다른 컴퓨터면 서버 아이콘)와 「바뀌었는지 확인하는 중」 같은 한마디. 오른쪽에 문서가 여럿이면 ‹ 「1 / N」 › 와 목록 단추, 「브라우저로 열기」, 다시 불러오기, 닫기. 본문은 옅은 면(`raised`) 위에 흰 종이로 그린 페이지 전체를 폭에 맞춰 세로로 스크롤. 목록(248px)은 다이얼로그가 1320px 이상이면 펼쳐 두고, 줄마다 파일 이름과 「연 시각 · 그 요청의 제목」.

**How it behaves:**

- 패널은 지금 들어가 있는 에이전트를 따라가고, 없으면 마지막에 본 것을 둔다. 일하는 동안 2초, 쉬는 동안 6초마다 읽고, 패널이 숨어 있으면 읽지 않는다.
- 요청의 상태 표지(동그라미 안 아이콘, 테마 색): 가장 최근 요청이 끝나지 않았고 에이전트가 working 이면 「진행 중 N분」(도는 고리, `working`), blocked 이면 「확인 기다리는 중」(물음표, `blocked`). 끝난 요청은 체크(`done`)와 걸린 시간, 사용자가 끊은 요청은 「중단함」(정지, `muted`), 끝나지 않은 채 에이전트가 idle 이거나 더 새 요청이 온 것은 「멈춤」(일시정지, `muted`). 진행 중인 줄은 옅게 물든 면이다.
- 제목: 패널이 보이는 동안 제목이 없는 요청을 12개씩 Claude 에게 받아 적어 둔다. 받기 전에는 에이전트가 한 말의 첫 문장이 제목 자리에 온다. 요약은 400자 넘는 답변을 창으로 열 때 한 번 받는다. 실패하면 사용 한도 30분 · 로그인 없음 10분 · 명령 없음 30분 쉬고, 그 까닭을 맨 위에 적는다.
- 보낸 글 원문은 창의 「보낸 글」 탭에서만 보인다.
- 문서 보기: 「문서 N」(최근 문서부터, 같은 문서는 한 번)이나 요청 창의 「문서」, 명령 `request-log.docs` 로 연다. 처음 여는 문서는 도는 고리와 「문서를 가져와 그리는 중입니다」, 한 번 그린 문서는 바로 보이고 그사이 바뀌었으면 바뀐 그림으로 갈아 끼운다. ←/→ 로 앞뒤 문서, 지금 문서가 끝나면 다음 둘을 미리 그린다. 가져오지 못하면 까닭(파일 없음 · 연결 안 됨 · 12MB 넘음 · Xcode 명령줄 도구 없음)과 「다시 해 보기」. 「브라우저로 열기」는 이 컴퓨터의 브라우저로 연다(다른 컴퓨터의 문서는 가져온 사본).
- 키: 패널에서 ↑/↓ 로 가리키고 Enter 로 연다. 창에서 ←/→ 로 앞뒤 요청, Esc 로 닫는다. 진행 중인 요청을 열어 두면 끝까지 따라간다. 명령 `request-log.latest` · `.next` · `.prev` · `.toggle` · `.close`, 창이 열려 있을 때 `.digest` · `.reply` · `.steps` · `.files` · `.sent` · `.older` · `.newer`.
- 에이전트 목록: 정렬 아이콘을 누르면 「정렬」 팝업(셋 가운데 고른 것에 체크). 묶음 머리를 누르면 접히고, 접힌 머리에는 수와 가장 급한 상태가 남는다. 줄에 마우스를 올리면 고정 핀, 상태 표지에 마우스를 올리면 「확인 필요」 같은 말.
- 스페이스 목록: 누르면 바뀌고, 오른쪽 클릭은 메뉴, 끌면 순서가 바뀐다(원본 그대로). 컴퓨터 줄을 누르면 그 컴퓨터의 스페이스가 접힌다. 화면 공유 단추는 `vnc://사용자@주소` 를 연다.
- 에이전트 다시 열기는 사이드바가 뜬 지 4초 뒤에 `revive.py scan`을 호출하고, 이후 1분마다 반복한다. 에이전트가 실행 중인 터미널마다 대화를 찾아 기록한다. 나중에 그 터미널에 셸만 남으면 현재 셸 pid를 기록과 비교한다. pid가 다르면 코어가 새로 띄운 셸이므로 다시 열 대상으로 표시한다. pid가 같으면 같은 셸에서 사용자가 에이전트만 종료한 것으로 보고 기록을 지운다. 「다시 열기」 버튼과 `sidebar-agents.revive` 명령은 `revive.py restore`를 호출한다. `restore`는 셸만 남은 터미널마다 `hc send`로 명령을 입력한다. 명령을 보낸 터미널은 5분 동안 다시 열 대상에서 제외한다. 「닫기」(`dismiss`)는 현재 표시된 대상에 건너뛰기 표시만 남긴다. 그 터미널에서 에이전트가 다시 실행되면 새로 기록한다. 없어진 터미널은 10분 뒤 기록에서 지우고, 연결되지 않은 컴퓨터의 기록은 그대로 둔다.

**Built from:**

- `layouts/history-sidebar.json`: Herdr 0.1.16 의 `main` 레이아웃에서 바꾼 것. 사이드바 블록의 `content.mod` 를 `sidebar-spaces` · `sidebar-agents` · `sidebar-chrome`(props `{"footer": true}`)으로. `work` 의 탭 블록을 `tabs-row`(row, 42px, `resizable: false`: `tabs` weight 1 + `requests-toggle` 96px `{mod: "request-log", props: {role: "toggle"}}`)로 감싸고, `work-body` 의 `panel` 뒤에 `requests-panel`(column, 384px, min 300, max 720) 안의 블록 `requests` `{mod: "request-log"}` 를 넣었다. `layouts/history.json` 은 사이드바만 기본(`spaces` · `agents` · `workspace-chrome`)이다.
- `mods/request-log`: `main.js` 한 파일에 역할 셋(패널 · `role: "toggle"` 단추 · `role: "detail"` 창, `openOverlay`). props `summaries: false`(제목 · 요약 끔), `model`(요약 모델), `panel`(단추가 여닫을 칸 id). 쓰는 `herdr` 함수: `agents` · `focused` · `layout` · `run("layout.toggle")` · `openOverlay` · `closeOverlay` · `nextCommand` · `exec` · `appHome` · `theme` · `settings`. 그림: `icon.png`, `icons/*.svg`(선 아이콘), 앱의 `icons/claude.svg` · `codex.svg` · `antigravity.svg`.
- `mods/request-log/reader.py`(표준 라이브러리만, Python 3.9+): 패널이 `python3 -I reader.py <터미널> [알던 경로] [알던 크기] [다시 찾기]` 로 부른다.
  - 어느 대화인지: 환경의 `HC_TERMINAL_ID` 가 그 터미널인 프로세스(`ps -wwE`). Claude Code 는 `~/.claude*/sessions/<pid>.json` → `projects/<폴더>/<세션>.jsonl`. Codex 는 그 프로세스가 연 `rollout-*.jsonl`(`lsof`), 백그라운드 서버에 붙은 경우는 서버가 연 대화 가운데 일하는 폴더가 같은 것. Antigravity 는 그 `agy` 가 연 `~/.gemini/antigravity-cli/presence/<id>.lock` → `conversations/<id>.db`.
  - 다른 컴퓨터: `reader.py --on <컴퓨터> …` 가 자기 파일을 `hc file write --on` 으로 올리고 `hc exec --json --on` 으로 거기서 읽는다.
  - 제목 · 요약: `claude -p --model sonnet` 을 API 키 없이(환경을 비우고) 구독 로그인으로 부른다. 받은 것은 `~/.cache/herdr-request-log/` 에 둔다.
- 문서 찾기(`reader.py`): 요청마다 `docs`. 셸 명령의 `open <파일>`(같은 명령의 `cd` 를 따라가고, 상대 경로는 그 대화의 폴더를 알 때만), 에이전트가 만들거나 고친 `.html`, 답변에 적은 경로(`~/` · `/` 로 시작, 백틱 · `[이름](<경로>)` 안의 띄어쓰기 경로 포함, 지금 있는 파일만). 확장자 `.html .htm .svg .png .jpg .jpeg .gif .webp`. 요청마다 12개.
- `reader.py [--on <컴퓨터>] --doc <경로> [고친 시각] [크기]`: 그 컴퓨터에서 문서와, 문서가 같은 폴더(아래 폴더 포함) 안에서 `src` · `href` · `url()` 로 부르는 재료(css · js · 그림 · 글꼴, 다른 html 은 빼고, 80개 · 합쳐 12MB까지)를 base64 JSON 으로 낸다. 고친 시각과 크기가 같으면 `{"same": true}`.
- `mods/doc-view`: `main.js`(다이얼로그, props `docs: [{path, at, topic}]` · `start` · `machine` · `browser`), `view.py`(가져와 `~/.cache/herdr-doc-view/docs/<문서>/` 에 펼치고, 글자 인코딩을 적지 않은 HTML 에는 사본에 `<meta charset="utf-8">` 을 넣고, 그린 조각을 `mods/doc-view/.shots/` 에 둔다. `peek` 은 전에 그린 것만), `render.swift`(처음 쓸 때 `xcrun swiftc -O` 로 `~/.cache/herdr-doc-view/bin/` 에 빌드. WKWebView 를 화면 밖 테두리 없는 창에 두고 accessory 앱으로 돌려 Dock 에 나오지 않는다. 글꼴을 기다려 높이를 재고 1600pt 조각을 2배 PNG 로 찍는다. 60000pt 까지, 25초). 그림 파일은 그리지 않고 그대로 쓴다. 쓰는 `herdr` 함수: `exec` · `appHome` · `closeOverlay` · `props` · `theme`. 아이콘 `icons/*.svg`.
- `mods/sidebar-spaces` · `sidebar-agents` · `sidebar-chrome`: 기본 `spaces` · `agents` · `workspace-chrome`(0.1.16)을 `mod.clone` 으로 복제해 글자를 한글로 바꾸고 위계를 더한 것. `sidebar-spaces` 는 `hc machine ls --json` 으로 컴퓨터를, `exec("ssh", ["-G", …])` 와 `nc -z -G 2 <주소> 5900` 으로 화면 공유를 5분마다 알아보고 `open` 으로 연다. `sidebar-agents` 는 `shared("agents.sort")` 에 `priority` · `grouped` · `machines` 를 둔다. 아이콘은 기본 `mods/workspace-chrome/*.svg`. `sidebar-agents` 는 Antigravity 에이전트(`app: "antigravity"`)의 대화 제목을 1분마다 읽는다: `hc get <터미널> --json` 의 `foreground.pid` → `lsof -a -p <pid> -Fn` 으로 그 agy 가 연 `~/.gemini/antigravity-cli/presence/<대화>.lock` → `conversation_summaries.db`(`immutable=1`) 의 `conversation_summaries.title`. 다른 컴퓨터는 `exec(…, {on: 컴퓨터})` 로 그 컴퓨터에서 읽는다.
- `mods/sidebar-agents/revive.py`는 표준 라이브러리만 사용하며 `scan [--now]`(40초 안에 이미 확인했으면 기록만 읽음) · `restore [주소...]` · `dismiss` · `show`를 제공한다. 기록은 `~/.local/state/herdr-revive/<HC_SESSION 또는 default>.json`에 저장하고 `fcntl`로 잠근다. 터미널마다 앱, 대화 ID, 환경, 폴더, 옵션, 에이전트 pid, 셸 pid(`hc get`의 `pid`), 자리, 이름을 기록한다. `sidebar-agents`는 `exec("python3", ["-I", …])`로 호출한다.
  - 대화 ID는 `hc get <터미널> --json`의 `foreground.pid`가 가리키는 프로세스와 그 하위 프로세스에서 찾는다. Claude Code는 `~/.claude*/sessions/<pid>.json`의 `sessionId`를 쓴다. 대화 파일이 아직 없으면 기록하지 않고, 기본 설정 폴더가 아니면 `CLAUDE_CONFIG_DIR`도 기록한다. Codex는 프로세스가 연 `rollout-*-<uuid>.jsonl`에서 찾는다. 백그라운드 서버에 연결됐으면 `reader.py`와 같은 방식으로 찾고, 기본 폴더가 아니면 `CODEX_HOME`도 기록한다. agy는 프로세스가 연 `presence/<id>.lock`에서 찾는다.
  - 옵션은 `foreground.argv`에서 정해 둔 것만 추린다. claude는 `--model` `--effort` `--permission-mode` `--setting-sources` `--agent` `--fallback-model` `--dangerously-skip-permissions` `--safe-mode` `--chrome` `--ide`, codex는 `-m` `-c` `-p` `-s` `-a`(긴 이름 포함) `--enable` `--disable` `--dangerously-bypass-approvals-and-sandbox` `--no-daemon` `--search` `--full-auto`, agy는 `--model` `--effort` `--mode` `--agent` `--project` `--dangerously-skip-permissions`를 남긴다. 첫 프롬프트와 `--resume` 등 나머지는 버린다.
  - 다시 열 때는 `claude <옵션> --resume <id>` · `codex <옵션> resume <id>` · `agy <옵션> --conversation <id>`를 쓴다. 기록한 환경 변수가 있으면 실행 명령 앞에 `CLAUDE_CONFIG_DIR=…` · `CODEX_HOME=…`를 붙인다. 셸의 현재 폴더가 기록과 다르면 맨 앞에 `cd <폴더> &&`를 붙인다.
  - 다른 컴퓨터의 대화는 `hc exec --json --on <컴퓨터> -i -- python3 -I - probe <base64>`로 이 파일을 표준 입력에 넘겨 그 컴퓨터에서 찾는다. 다시 열기 명령은 `hc send`로 그 컴퓨터의 터미널에 보낸다.

**Watch out:**

- 대화를 못 찾으면 짐작하지 않고 비워 둔다. 같은 폴더의 Codex 가 여럿이거나 agy 잠금 파일이 여럿이면 고르지 않고 알린다.
- 대화 파일은 수백 MB 가 되기도 한다. 처음에는 끝 32MB 만, 그다음은 늘어난 부분만 읽는다.
- Antigravity 대화는 SQLite(WAL) 안의 protobuf 다. 스키마가 공개되어 있지 않아 번호는 기록을 읽어 맞췄다(`reader.py` 의 「Antigravity(agy) 의 대화」 주석). agy 는 쓸 때만 열고 닫아 평소에는 `-wal` 이 없다: 그때는 `immutable` 로 읽고, `-wal` 이 있으면 사본을 만들어 읽는다. 같은 크기로 고쳐 쓰이므로 바뀌었는지는 고친 시각으로 본다.
- 모드에는 웹 화면을 넣을 수 없다. 문서는 그림으로 보이므로 링크 · 입력은 동작하지 않는다.
- `image()` 는 설정 폴더 안의 파일만 그린다. 그린 조각을 모드 폴더의 숨김 폴더(`.shots`)에 두어야 핫 리로드가 일어나지 않는다. 묶음은 16개만 남긴다.
- `ScrollHandle.new()` 는 render 안에서 만들 수 없다. 문서마다 쓸 스크롤은 init 에서 만든다.
- 메일 본문 조각처럼 `<meta charset>` 이 없는 HTML 은 WebKit 이 UTF-8 로 읽지 않아 한글이 깨진다.
- 답변에 적힌 경로는 띄어쓰기가 든 경로의 꼬리만 잡힐 수 있어, 지금 있는 파일만 문서로 적는다.
- `reader.py` 의 `VERSION` 을 올리면 대화를 다시 읽는다. 큰 대화는 끝 32MB 에 요청이 몇 개 없을 수 있어, 예전 버전의 기록이 있으면 192MB 까지 거슬러 읽는다.
- Xcode 명령줄 도구가 없으면 `xcrun` 이 설치 창을 띄우므로 먼저 `xcode-select -p` 로 확인한다.
- `claude -p --output-format json` 은 2.1.328 에서 결과 하나가 아니라 이벤트 배열을 낸다.
- 사이드바 복제본은 Herdr 업데이트를 받지 않는다. 미리 보려고 `herdr-app do mod.open` 을 쓰지 않는다(지금 레이아웃에 블록이 더해진다).
- 모드의 `exec` 는 PATH 에 `/usr/sbin` 이 없어 `lsof` 를 찾지 못한다. agy 제목을 읽는 스크립트는 첫 줄에서 PATH 를 더한다.
- `herdr-app check` 는 기본 역할만 그린다. 단추 · 창 · 접힌 사이드바는 값을 넣은 임시 사본으로 확인한다.
- Herdr는 재부팅 · 로그아웃 · 코어 중단(`hc server stop` 포함)으로 끊긴 터미널을 같은 주소에 복구한다. 마지막 폴더에서 셸을 띄우고 처음 명령은 다시 실행하지 않는다. 주소가 같으므로 「코어가 새로 띄움」과 「사람이 에이전트를 끔」은 셸 pid로만 구분할 수 있다.
- 명령을 셸에 입력하면 셸 함수나 별칭이 기본 옵션을 다시 붙인다. 함수가 붙인 옵션도 argv에 남으므로 정해 둔 옵션만 추려 중복을 피한다(`claude`의 `--settings`, `codex`의 `--dangerously-bypass-hook-trust` 등).
- Claude Code에서 메시지를 한 번도 보내지 않으면 대화 파일이 없어 `--resume`이 실패한다. 이런 터미널은 기록하지 않는다.
- 대화를 잠시 찾지 못해도 에이전트 pid가 같으면 기존 기록을 유지한다. 다른 에이전트가 실행됐는데 대화를 찾지 못하면 기록을 지운다.
- 모드의 `exec`는 PATH가 짧다. `revive.py`는 시작할 때 `/usr/sbin`(`lsof`) 등을 PATH에 추가한다.

**Done when:**

- 네 모드가 `herdr-app check` 를 통과하고 `herdr-app status` 의 `errors` 가 비어 있다.
- `layout.switch {"name": "history-sidebar"}` 뒤 탭 줄 오른쪽에 「히스토리」 단추가 있고, 누르면 384px 패널이 열리고 닫힌다.
- Claude Code · Codex · agy 가 도는 터미널에 들어가면 그 대화의 요청이 최근 것부터 나오고, 줄을 누르면 창이 열린다.
- Herdr 에 추가한 다른 컴퓨터의 에이전트에 들어가도 요청이 나온다.
- 에이전트가 `open` 으로 HTML 을 연 대화를 따라가면 히스토리 머리에 「문서 1」이 생기고, 누르면 그 페이지가 원본과 같은 모양으로 나온다. 다른 컴퓨터의 에이전트가 연 문서도 같다.
- 에이전트 정렬 팝업에 세 가지가 있고, 컴퓨터별에서 「이 컴퓨터」와 다른 컴퓨터 머리가 나뉜다.
- 이름 없는 탭에서 도는 agy 가 「Antigravity」가 아니라 agy 대화 제목으로 나오고, 방금 끝난 에이전트는 또렷한 체크로, 끝난 지 한 시간이 지난 에이전트만 흐리게 나오며, 작업 중인 줄은 굵다.
- 에이전트가 실행 중인 터미널이 있을 때 `hc server stop`으로 코어를 멈췄다가 다시 띄우면 1분 안에 에이전트 목록 위에 「재부팅 전 에이전트 N개」가 표시된다. 「다시 열기」를 누르면 터미널마다 같은 대화 ID와 옵션으로 대화가 이어진다. 다른 컴퓨터의 에이전트도 같은 방식으로 다시 열린다. `/exit`로 에이전트를 종료한 터미널은 목록에 나오지 않는다.
- `claude` 로그인이 없으면 제목 자리에 에이전트가 한 말의 첫 문장이 오고, 맨 위에 까닭이 나온다.
