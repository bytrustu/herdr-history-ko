// 히스토리: 지금 보고 있는 에이전트(Claude Code, Codex)와 한 작업을 요청 단위로 보여 준다.
// 패널. 맨 위: 이 대화가 무슨 작업인지(주제와 한 문장 요약). 그 아래: 최근 요청부터, 날짜별로.
// 한 줄이 요청 하나: 상태(진행 중 · 끝남 · 확인 기다림), 주제 제목, 지금 하는 일이나 답변 첫 문장,
// 보낸 시각 · 걸린 시간 · 명령 수, 누가 했는지(모델 · effort, 함께 일한 서브에이전트 · Codex · agy · Claude).
// 줄을 누르면(또는 ↑/↓ 뒤 Enter) 그 요청이 모달로 크게 열린다.
// 모달. 제목과 시각, 누가 했나(모델 · effort · 쓴 출력 토큰), 작업 흐름(시간에 따른 활동과 한 일의 구성),
// 탭 다섯: 요약(Claude 가 간추린 결론 · 한 일 · 확인한 것 · 남은 것 · 알아둘 것), 답변(전문, Markdown),
// 진행 과정(에이전트가 한 말과 실행한 일, 누구에게 맡겼는지), 바꾼 파일(폴더별), 보낸 글.
// ←/→ 로 앞뒤 요청, Esc 로 닫는다. 진행 중인 요청은 열어 둔 채로 따라간다.
// 보낸 글은 모달의 「보낸 글」 탭에서만 보인다. 제목 · 맨 위 요약 · 답변 요약은 Claude 가 쓴다
// (reader.py --titles, --digest: 구독 로그인으로 claude -p 를 부른다. API 키는 쓰지 않는다).
// 제목은 패널이 보이는 동안 제목이 없는 요청이 있을 때만, 답변 요약은 그 요청을 모달로 열었을 때만 부르고,
// 받은 것은 적어 둔다. 받기 전이나 받지 못했을 때는 에이전트가 한 말의 첫 문장이 제목 자리에 오고,
// 요약 대신 답변 전문을 본다. 레이아웃에서 props { "summaries": false } 로 끄고, { "model": "haiku" } 로 모델을 바꾼다.
// 누가 했는지는 기록에 적힌 것만 보인다: 그 에이전트의 모델 · effort, Agent 도구로 띄운 서브에이전트,
// 셸에서 부른 codex exec · agy -p · claude -p(모델과 effort 는 명령에 적은 것만. 적지 않았으면 "기본 모델").
// 테두리 대신 배경 면으로 나눈다(바탕 위에 옅은 면).
// 대화는 reader.py 가 Claude Code · Codex · Antigravity(agy) 가 남기는 파일에서 읽는다. 다른 컴퓨터(Herdr 에 추가한 컴퓨터)에서 도는
// 에이전트는 reader.py --on <컴퓨터> 로 그 컴퓨터에서 읽어 온다(읽기 도구를 그쪽에 올려 두고 herdr-core 로 돌린다.
// Claude 에게 묻는 일은 이 컴퓨터에서 한다).
// 일하는 동안 2초마다, 쉬는 동안 6초마다 보고, 패널이 숨겨져 있으면 읽지 않는다.
// 따라가는 에이전트: 지금 들어가 있는 에이전트, 없으면 마지막에 본 것.
// 레이아웃에서: 패널은 { "mod": "request-log" }, 탭 줄 버튼은 props { "role": "toggle" }
// (id 가 "requests-panel" 인 칸을 여닫는다. 다른 id 는 props.panel 로 준다).
// 명령(keys.json 에 묶을 수 있다): request-log.latest(최근 요청 열기), .next, .prev(가리키는 요청 옮기기),
// .toggle(가리키는 요청 열기), .close. 모달이 열려 있을 때: .digest, .reply, .steps, .files, .sent(탭), .older, .newer.
// 탭 줄 아이콘(icon.png)은 Codex 의 이미지 생성으로 만들었다.
// herunan/herdr-over9k 의 Timeline(over9k-prompts, MIT)을 바탕으로 했다. LICENSE.over9k 참고.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, TextView, ScrollHandle } from "gpui-base";
import { theme, settings, exec, home, appHome, focused, agents, layout, run, checking, nextCommand, openOverlay, closeOverlay, props as blockProps } from "herdr";

const PANEL = "requests-panel";
const NOTE = {
  none: "에이전트를 선택하면 한 작업이 여기에 나옵니다.",
  other: "Claude Code · Codex · Antigravity 대화만 볼 수 있습니다.",
  down: "다른 컴퓨터에 연결되지 않아 대화를 읽지 못했습니다.",
  vague: "같은 폴더나 터미널에 대화가 여럿이라 어느 대화인지 가려내지 못했습니다.",
  empty: "아직 보낸 요청이 없습니다.",
  failed: "대화 기록을 읽지 못했습니다.",
};
// 제목을 요약하지 못할 때 맨 위에 보일 말(잠깐 실패한 것은 말없이 다시 해 본다).
const WHY = {
  limit: "Claude 사용 한도에 걸려 제목 요약을 잠시 쉽니다.",
  login: "Claude 에 로그인되어 있지 않아 제목을 요약하지 못했습니다.",
  missing: "claude 명령을 찾지 못해 제목을 요약하지 못했습니다.",
};
// 진행 과정: 단계마다 아이콘, 앞에 붙는 말(에이전트가 한 말과 설명이 붙은 실행에는 붙지 않는다).
const ICON = { say: "message", run: "terminal", cmd: "terminal", edit: "pencil", agent: "bot", cli: "bot", skill: "sparkle", ask: "question", web: "globe", tool: "plug" };
const KIND = { edit: "수정", agent: "서브에이전트", skill: "스킬", ask: "질문", web: "웹 검색", tool: "도구" };
const TABS = ["digest", "reply", "steps", "files", "sent"];
// 이보다 짧은 답변은 간추리지 않고 그대로 보인다(reader.py 의 DIGEST_MIN 과 같다).
const DIGEST_MIN = 400;
// 요약을 쓰지 못한 까닭(여기에 없는 까닭은 다시 써 볼 수 있다).
const WHY_DIGEST = {
  limit: "Claude 사용 한도에 걸려 요약을 쓰지 못했습니다.",
  login: "Claude 에 로그인되어 있지 않아 요약을 쓰지 못했습니다.",
  missing: "claude 명령을 찾지 못해 요약을 쓰지 못했습니다.",
};
// 누가 했나: 이름, 앱이 가진 아이콘, effort 의 세기(눈금 다섯 칸 가운데 몇 칸).
const WHO = { claude: "Claude", codex: "Codex", agy: "agy" };
const FACE = { claude: "icons/claude.svg", codex: "icons/codex.svg", agy: "icons/antigravity.svg" };
// 대화의 주인(그 에이전트 자신)을 부르는 이름.
const OWNER = { claude: "Claude Code", codex: "Codex", agy: "Antigravity" };
// 따라가는 에이전트가 무슨 앱인가: 읽은 대화가 알려 준 것, 아직 읽지 않았으면 Herdr 가 아는 이름.
const appOf = (a, read) => {
  if (OWNER[read]) return read;
  const k = String(a?.app ?? a?.program?.key ?? "").toLowerCase();
  return k.includes("codex") ? "codex" : k.includes("antigravity") || k === "agy" ? "agy" : "claude";
};
const LEVEL = { minimal: 1, low: 1, medium: 2, high: 3, xhigh: 4, max: 5 };
// 한 일의 구성: 종류마다 색이 정해져 있다(밝은 테마, 어두운 테마). 세 색은 어느 둘이 맞닿아도 구별된다. 그 밖은 회색.
const MIX = [["run", "실행", "#2a78d6", "#3987e5"], ["edit", "수정", "#eb6834", "#d95926"], ["look", "읽기 · 검색", "#1baf7a", "#199e70"], ["rest", "그 밖", null, null]];

// Python 3 은 "python3", 없으면 "python": 한 번만 찾는다.
let PY = null;
const python = (args, timeout) => (PY ??= exec("python3", ["-c", "1"]).then((r) => (r?.code === 0 ? "python3" : "python"), () => "python"))
  .then((p) => exec(p, args, { timeout: timeout ?? 20000 }));
const reader = () => appHome() + "/mods/request-log/reader.py";
// 다른 컴퓨터의 에이전트는 주소가 "컴퓨터/터미널"("vps/t7")이다: 그 컴퓨터에서 읽게 하고(--on), 터미널은 그쪽 이름으로 준다.
const far = (address) => { const s = String(address ?? ""); const i = s.indexOf("/"); return i < 0 ? [] : ["--on", s.slice(0, i)]; };
const term = (address) => String(address ?? "").split("/").pop();

const stop = (_e, cx) => cx.stop_propagation();
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.getHours() + ":" + pad(d.getMinutes()); };
// 날짜 묶음의 이름: "오늘", "어제", "11월 17일 월요일".
function dayOf(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const now = new Date(), day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "어제";
  return (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + "일월화수목금토"[d.getDay()] + "요일";
}
// "45초", "5분 12초", "1시간 3분".
function span(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (isNaN(s)) return "";
  if (s < 60) return s + "초";
  if (s < 3600) return Math.floor(s / 60) + "분" + (s % 60 ? " " + (s % 60) + "초" : "");
  const m = Math.floor(s / 60) % 60;
  return Math.floor(s / 3600) + "시간" + (m ? " " + m + "분" : "");
}
// 진행 중인 요청: "방금 시작", "3분째", "1시간 5분째".
function since(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (isNaN(m) || m < 1) return "방금 시작";
  return (m < 60 ? m + "분" : Math.floor(m / 60) + "시간" + (m % 60 ? " " + (m % 60) + "분" : "")) + "째";
}
// 일한 시간: 에이전트가 적어 둔 값, 없으면 보낸 때부터 마지막 활동까지.
const took = (p) => (p.ms > 0 ? span(p.ms) : p.done && p.at ? span(new Date(p.done) - new Date(p.at)) : "");
// "840", "12.3k", "1.2M".
const count = (n) => (n < 1000 ? String(n) : n < 1e6 ? (n / 1000).toFixed(n < 1e4 ? 1 : 0) + "k" : (n / 1e6).toFixed(1) + "M");
// Markdown 을 한 줄 글로.
const plain = (s) => (s ?? "").replace(/\x60\x60\x60[\s\S]*?\x60\x60\x60/g, " ").replace(/\*\*|__|\x60|^#+\s*|^>\s*/gm, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
// 답변의 첫 문장("했습니다." 처럼 아주 짧으면 둘째 문장까지).
function summary(reply) {
  const parts = plain(reply).split(/(?<=[.!?])\s/);
  const first = (parts[0] && parts[0].length < 25 && parts[1] ? parts[0] + " " + parts[1] : parts[0]) ?? "";
  return first.length > 160 ? first.slice(0, 159) + "…" : first;
}
// 색에 투명도를 준다("#rrggbb", "#rrggbbaa" 만; 다른 꼴은 그대로 둔다).
function tint(color, alpha) {
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(String(color));
  return m ? "#" + m[1] + Math.round(alpha * 255).toString(16).padStart(2, "0") : color;
}
// 글을 몇 줄 안에 들어가게 줄인다. 글자 폭은 어림한다(한글은 한 글자, 영문 · 숫자는 반 글자쯤).
function clamp(text, width, lines, size) {
  const room = (width / size - 1.2) * lines - 1;
  let used = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    used += c > 0x2e7f ? 0.95 : c === 32 ? 0.3 : c < 128 ? 0.56 : 0.7;
    if (used > room) return text.slice(0, i).trimEnd() + "…";
  }
  return text;
}
function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) { const f = find(child, id); if (f) return f; }
  return null;
}

// 모델 이름을 읽기 쉽게: "claude-fable-5-2" → "Fable 5.2", "gpt-6.2-astra" → "GPT-6.2 Astra".
function modelName(id) {
  if (!id || id === "?") return "";
  let s = String(id), tail = "";
  const room = /\[(\w+)\]$/.exec(s);
  if (room) { s = s.slice(0, room.index); tail = " (" + room[1].toUpperCase() + ")"; }
  const cap = (w) => w.split("-").filter(Boolean).map((x) => x[0].toUpperCase() + x.slice(1)).join(" ");
  let m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{6,})?$/.exec(s);
  if (m) return cap(m[1]) + " " + m[2] + (m[3] ? "." + m[3] : "") + tail;
  m = /^gpt-([\d.]+)(?:-(.+))?$/.exec(s);
  if (m) return "GPT-" + m[1] + (m[2] ? " " + cap(m[2]) : "") + tail;
  m = /^gemini-([\d.]+)(?:-(.+))?$/.exec(s);
  if (m) return "Gemini " + m[1] + (m[2] ? " " + cap(m[2]) : "") + tail;
  return (/^[a-z]+$/.test(s) ? cap(s) : s) + tail;
}
// 일한 쪽 하나를 보일 말로: 이름, 어떻게 맡았는지, 모델, effort, 아이콘.
// 모델을 명령에 적지 않고 부른 쪽은 그 도구의 기본값이라 "기본 모델"이라고만 한다.
function actorOf(a) {
  const sub = a.who === "sub";
  const name = a.main ? OWNER[a.who] ?? "Claude Code" : sub ? "서브에이전트" : WHO[a.who] ?? a.who;
  const how = a.main ? "" : sub ? [a.name, a.n > 1 ? a.n + "개" : ""].filter(Boolean).join(" · ")
    : (a.name === "cl" ? "cl run · " : "") + (a.n > 1 ? a.n + "번 맡김" : "맡김");
  const model = a.model === "?" ? "모델 알 수 없음" : a.model ? modelName(a.model) : a.main || sub ? "" : "기본 모델";
  return { name, how, model, effort: a.effort && a.effort !== "?" ? a.effort : "", face: sub ? "sub" : a.who };
}
// 어두운 테마인가(바탕색의 밝기로 본다).
function isDark(t) {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})/.exec(String(t.background));
  return m ? (parseInt(m[1], 16) * 299 + parseInt(m[2], 16) * 587 + parseInt(m[3], 16) * 114) / 1000 < 128 : false;
}

// 패널과 모달이 함께 쓰는 부품. 테두리 없이 면으로: 바탕 위에 옅은 면(raised).
const ic = (name, size, color) => svg("mods/request-log/icons/" + name + ".svg").size(size).flex_none().text_color(color);
const badge = (name, size, fill, color, spin) => h_flex().size(size).flex_none().items_center().justify_center().rounded(size / 2).bg(fill)
  .child(spin ? ic(name, Math.round(size * 0.6), color).spin(900) : ic(name, Math.round(size * 0.6), color));
// 요청의 상태: 가장 최근 요청만 진행 중이거나 확인을 기다릴 수 있다.
const stateOf = (p, newest, status) => (newest && !p.ended && status === "working" ? "live"
  : newest && !p.ended && status === "blocked" ? "waiting" : p.interrupted ? "stopped" : p.ended ? "done" : "paused");
const lookOf = (t, state) => ({
  live: { icon: "ring", color: t.working, spin: true },
  waiting: { icon: "question", color: t.blocked },
  stopped: { icon: "stop", color: t.muted },
  done: { icon: "check", color: t.done },
  paused: { icon: "pause", color: t.muted },
})[state];
const wordOf = (p, state) => (state === "live" ? "진행 중 " + since(p.at) : state === "waiting" ? "확인 기다리는 중"
  : state === "stopped" ? "중단함" : state === "paused" ? "멈춤" : took(p));
// 제목 자리에 올 말: Claude 가 요약한 주제, 아직 없으면 에이전트가 한 말(답변이나 처음 한 말)의 첫 문장.
const said = (p) => (p.reply ? summary(p.reply) : (p.steps ?? []).find((s) => s.k === "say" || s.k === "run")?.t) || "새 요청";
// 일한 쪽의 아이콘(앱이 가진 것). 모르는 쪽은 로봇.
const face = (who, size, t) => (FACE[who] ? image(FACE[who]).w(size).h(size).flex_none() : ic("bot", size, t.muted));
// effort 의 세기: 점점 높아지는 눈금 다섯 칸 가운데 몇 칸이 찼는가(모르는 값이면 빈 눈금).
const meter = (t, effort) => h_flex().flex_none().gap(2).items_end()
  .children([1, 2, 3, 4, 5].map((k) => div().w(3).h(3 + k * 2).rounded(1.5).bg(k <= (LEVEL[effort] ?? 0) ? t.foreground : t.border)));

export default class RequestLog extends View {
  init(_props, cx) {
    const given = blockProps() ?? {};
    this.role = given.role ?? "panel";
    if (this.role === "toggle") return;
    this.handle = cx.focus_handle();
    this.scroll = ScrollHandle.new();
    this.agent = null; // 따라가는 터미널
    this.path = null; // 그 대화 파일
    this.size = null; // 마지막으로 읽었을 때의 크기
    this.reqs = []; // 최근 것부터. topic: 제목("" 은 요약하지 못한 것, null 은 아직 묻지 않은 것)
    this.copied = null; // 방금 복사한 것("reply" | "sent")
    if (this.role === "detail") return this.initDetail(given, cx);
    this.off = given.summaries === false; // 제목 요약을 끈다
    this.model = typeof given.model === "string" ? given.model : ""; // 요약에 쓸 모델(비우면 reader.py 의 기본값)
    this.topic = ""; // 대화 전체의 주제
    this.gist = ""; // 지금까지 한 일 한 문장
    this.sel = null; // 키보드가 가리키는 요청(보낸 시각으로 가리킨다)
    this.overlay = null; // 열어 둔 모달
    this.note = "none"; // 목록 대신 보일 말(NOTE 의 키, 읽는 중이면 "loading")
    this.naming = false; // 제목을 받는 중인가
    this.retryAt = 0; // 제목 요약에 실패해 쉬는 동안: 다시 해 볼 시각
    this.why = ""; // 요약하지 못한 까닭(WHY 의 키)
    this.rows = {}; // 요청 → 목록의 몇 번째 자식인가(스크롤)
    this.width = 384;
    this.ticks = 0;
    if (checking()) return;
    this.follow(cx, true);
    cx.timer.every(2000, (cx) => this.tick(cx));
    cx.spawn(async (cx) => { for (;;) this.command(await nextCommand(), cx); });
  }

  // 지금 들어가 있는 에이전트(에이전트가 아닌 터미널이면 null).
  here() {
    const f = focused();
    if (f?.agent) return f.agent;
    if (f?.terminal && agents().some((a) => a.address === f.terminal)) return f.terminal;
    return null;
  }

  clear(note) {
    this.path = null; this.size = null; this.reqs = []; this.sel = null;
    this.title = ""; this.topic = ""; this.gist = ""; this.context = 0; this.more = false; this.note = note; this.app = null;
    this.retryAt = 0; this.why = "";
  }

  // 일하는 동안은 2초마다, 쉬는 동안은 6초마다 읽는다. 어느 대화인지는 상태가 바뀔 때와
  // 30초마다 다시 찾는다(/clear 나 재시작으로 대화가 바뀌었을 수 있다).
  tick(cx) {
    this.ticks += 1;
    if (find(layout(), PANEL)?.hidden) { this.away = true; return; }
    const woke = Boolean(this.away);
    this.away = false;
    const a = agents().find((x) => x.address === this.agent);
    const status = a?.status ?? null;
    const turned = status !== this.status;
    this.status = status;
    if (woke || turned || status === "working" || this.ticks % 3 === 0) this.follow(cx, woke || turned || this.ticks % 15 === 0);
    this.name(cx);
    // 진행 중인 요청의 "N분째".
    const minute = Math.floor(Date.now() / 60000);
    if (status === "working" && minute !== this.minute) { this.minute = minute; cx.notify(); }
  }

  // 따라갈 에이전트를 정하고, 그 대화가 늘었으면 다시 읽는다.
  follow(cx, resolve) {
    const list = agents();
    let here = this.here();
    if (!here && !list.some((a) => a.address === this.agent)) {
      // 따라가던 것이 없으면 가장 최근에 움직인 에이전트.
      here = list.slice().sort((a, b) => b.seq - a.seq)[0]?.address ?? null;
      if (!here && this.agent) { this.agent = null; this.clear("none"); cx.notify(); }
    }
    if (here && here !== this.agent) { this.agent = here; this.clear("loading"); this.lost = false; resolve = true; cx.notify(); }
    const a = list.find((x) => x.address === this.agent);
    if (!a) return;
    // 대화를 찾지 못한 에이전트(Claude Code 도 Codex 도 아닌 것)는 다시 찾을 때만 본다.
    if (this.lost && !resolve) return;
    if (this.busy) { this.wanted = Boolean(this.wanted) || Boolean(resolve); return; }
    resolve = Boolean(resolve) || Boolean(this.wanted);
    this.wanted = false;
    this.busy = true;
    const at = this.agent;
    cx.spawn(async (cx) => {
      try {
        const args = ["-I", reader(), ...far(at), term(at), this.path ?? "", this.size != null ? String(this.size) : "", resolve ? "1" : ""];
        const r = await python(args).catch(() => null);
        if (at !== this.agent) return;
        let got = null;
        try { got = JSON.parse(r?.stdout ?? ""); } catch {}
        if (!got) {
          if (!this.reqs.length && this.note !== "failed") { this.note = "failed"; cx.notify(); }
          return;
        }
        if (got.same) return;
        // 그 컴퓨터에 닿지 못했다: 읽어 둔 것이 있으면 그대로 두고, 없을 때만 알린다.
        if (got.down) {
          if (!this.reqs.length && this.note !== "down") { this.note = "down"; cx.notify(); }
          return;
        }
        const same = (got.path ?? null) === this.path;
        if (!same) this.sel = null;
        // 방금 받은 제목이 파일에 적히기 전에 읽었을 수 있다: 들고 있던 제목은 이어 쓴다.
        const had = {};
        if (same) for (const p of this.reqs) if (p.topic != null) had[p.at] = p.topic;
        this.reqs = (got.reqs ?? []).reverse();
        for (const p of this.reqs) if (p.topic == null && had[p.at] != null) p.topic = had[p.at];
        this.path = got.path ?? null;
        this.size = got.size ?? null;
        this.context = got.context ?? 0;
        this.title = got.title ?? "";
        this.app = got.app ?? null;
        this.topic = got.topic || (same ? this.topic : "");
        this.gist = got.gist || (same ? this.gist : "");
        this.more = Boolean(got.more);
        this.lost = !got.found;
        this.note = this.reqs.length ? "" : got.vague ? "vague" : got.found ? "empty" : "other";
        cx.notify();
        this.name(cx);
      } finally {
        this.busy = false;
      }
      // 읽는 사이에 다른 에이전트로 옮겼으면 바로 그쪽을 읽는다.
      if (at !== this.agent || this.wanted) this.follow(cx, true);
    });
  }

  // 제목이 없는 요청이 있으면 Claude 에게 요약을 받는다. 한 번에 한 묶음씩 묻고, 실패하면 한동안 쉰다.
  name(cx) {
    if (this.off || this.naming || !this.path || Date.now() < this.retryAt) return;
    const asked = this.reqs.filter((p) => p.topic == null).map((p) => p.at);
    if (!asked.length) return;
    this.naming = true;
    const at = this.agent, path = this.path;
    const args = ["-I", reader(), ...far(at), "--titles", term(at), path, this.model];
    cx.spawn(async (cx) => {
      try {
        const r = await python(args, 100000).catch(() => null);
        if (at !== this.agent || path !== this.path) return;
        let got = null;
        try { got = JSON.parse(r?.stdout ?? ""); } catch {}
        if (!got) { this.retryAt = Date.now() + 180000; return; }
        for (const p of this.reqs) {
          const t = got.titles?.[p.at];
          if (t != null) p.topic = t;
          // 다 묻고도 제목이 없는 요청은 다시 묻지 않는다.
          else if (got.ok && !got.more && !got.busy && asked.includes(p.at)) p.topic = "";
        }
        if (got.topic) this.topic = got.topic;
        if (got.gist) this.gist = got.gist;
        this.why = got.ok ? "" : (got.why ?? "error");
        this.retryAt = got.ok ? (got.busy ? Date.now() + 4000 : 0) : Date.now() + Math.max(60, got.wait ?? 180) * 1000;
        cx.notify();
      } finally {
        this.naming = false;
      }
      this.name(cx); // 남은 요청이 있으면 이어서 묻는다(없거나 쉬는 중이면 바로 돌아온다)
    });
  }

  // 요청 하나를 모달로 크게 연다. 먼저 그릴 수 있게 그 요청을 같이 건네고, 모달이 나머지를 읽는다.
  view(key) {
    const p = this.reqs.find((x) => x.at === key);
    if (!p) return;
    this.sel = key;
    this.shut();
    this.overlay = openOverlay({ mod: "request-log", kind: "dialog", width: 780, height: 0.86,
      props: { role: "detail", agent: this.agent, path: this.path, app: this.app, at: key, req: p, newest: this.reqs[0] === p, summaries: !this.off, model: this.model } });
  }

  shut() {
    if (!this.overlay) return;
    try { closeOverlay(this.overlay); } catch {}
    this.overlay = null;
  }

  // 키와 명령(request-log.<이름>)이 같은 일을 한다.
  command(name, cx) {
    const list = this.reqs;
    if (!list.length) return;
    const cur = list.findIndex((p) => p.at === this.sel);
    if (name === "latest") this.view(list[0].at);
    else if (name === "toggle") this.view(list[Math.max(0, cur)].at);
    else if (name === "close") this.shut();
    else if (name === "next" || name === "prev") {
      this.sel = list[Math.min(list.length - 1, Math.max(0, cur + (name === "next" ? 1 : -1)))].at;
      const at = this.rows[this.sel];
      if (at != null) this.scroll.scroll_to_item(at);
    } else return;
    cx.notify();
  }

  // 글을 클립보드에 담고, 버튼을 잠깐 "복사했습니다"로 바꾼다.
  copy(cx, what, text) {
    try { cx.write_to_clipboard(text); } catch { return; }
    this.copied = what;
    cx.notify();
    cx.spawn(async (cx) => { await cx.sleep(1400); if (this.copied === what) { this.copied = null; cx.notify(); } });
  }

  // ---- 모달: 요청 하나를 크게

  initDetail(given, cx) {
    this.overlay = given.overlay ?? null;
    this.agent = given.agent ?? null;
    this.path = given.path ?? null;
    this.app = given.app ?? null; // 대화의 앱(claude · codex · agy)
    this.key = given.at ?? null; // 보고 있는 요청
    this.kept = given.req ?? null; // 목록에서 밀려나도 보던 요청은 남긴다
    this.newest = Boolean(given.newest);
    this.off = given.summaries === false; // 답변 요약을 끈다
    this.model = typeof given.model === "string" ? given.model : ""; // 요약에 쓸 모델(비우면 reader.py 의 기본값)
    this.reqs = [];
    this.tab = null; // 고른 탭(null 이면 요청에 맞는 것: 끝났으면 요약이나 답변, 아니면 진행 과정)
    this.seen = -1; // 진행 과정에서 마지막으로 본 단계 수(늘면 끝으로 내린다)
    this.digests = {}; // 요청 → 방금 받은 요약
    this.failed = {}; // 요청 → 요약을 쓰지 못한 까닭
    this.asking = null; // 요약을 받는 중인 요청
    if (checking()) return;
    this.handle.focus();
    this.read(cx);
    cx.timer.every(2000, (cx) => this.read(cx));
    cx.spawn(async (cx) => { for (;;) this.detailCommand(await nextCommand(), cx); });
  }

  // 보고 있는 요청과 그 자리(0 이 가장 최근).
  current() {
    const i = this.reqs.findIndex((p) => p.at === this.key);
    return i >= 0 ? { p: this.reqs[i], i, newest: i === 0 } : { p: this.kept, i: -1, newest: this.newest && !this.reqs.length };
  }

  // 대화를 다시 읽는다(늘었을 때만 내용이 온다). 진행 중인 요청에 단계가 늘면 끝이 보이게 내린다.
  read(cx) {
    if (this.busy || !this.agent || !this.path) return;
    this.busy = true;
    const args = ["-I", reader(), ...far(this.agent), term(this.agent), this.path, this.size != null ? String(this.size) : "", ""];
    cx.spawn(async (cx) => {
      try {
        const r = await python(args).catch(() => null);
        let got = null;
        try { got = JSON.parse(r?.stdout ?? ""); } catch {}
        if (got && !got.same && got.path === this.path) {
          this.reqs = (got.reqs ?? []).reverse();
          this.size = got.size ?? null;
          this.app = got.app ?? this.app;
        }
        const { p, newest } = this.current();
        const n = p?.steps?.length ?? 0;
        if (n !== this.seen) {
          const first = this.seen < 0;
          this.seen = n;
          if (newest && !p.ended && (first || this.shownTab(p) === "steps")) this.scroll.scroll_to_item(n);
        }
        this.digest(cx);
        cx.notify(); // 읽은 것이 같아도 "N분째"는 흐른다
      } finally {
        this.busy = false;
      }
    });
  }

  // 요약을 보일 요청인가: 끝났고 답변이 길다(짧은 답변은 그대로 읽는 편이 빠르다).
  digestible(p) {
    return !this.off && Boolean(p.ended) && (p.reply ?? "").length >= DIGEST_MIN && this.failed[p.at] !== "short" && this.failed[p.at] !== "none";
  }

  digestOf(p) {
    return p.digest ?? this.digests[p.at] ?? null;
  }

  // 보고 있는 요청의 답변을 Claude 에게 간추려 받는다. 한 번에 하나씩 받고, 받은 것은 reader.py 가 적어 둔다.
  digest(cx) {
    const { p } = this.current();
    if (this.asking || !p || !this.path || !this.digestible(p) || this.digestOf(p) || this.failed[p.at]) return;
    const at = p.at;
    this.asking = at;
    cx.spawn(async (cx) => {
      try {
        const r = await python(["-I", reader(), ...far(this.agent), "--digest", term(this.agent), this.path, at, this.model], 100000).catch(() => null);
        let got = null;
        try { got = JSON.parse(r?.stdout ?? ""); } catch {}
        if (got?.ok && got.digest) this.digests[at] = got.digest;
        else this.failed[at] = got?.why ?? "error";
      } finally {
        this.asking = null;
      }
      cx.notify();
      this.digest(cx); // 그사이 다른 요청으로 넘겼으면 그 요청도
    });
  }

  // 지금 보이는 탭: 고른 것, 없으면(또는 그 요청에 없는 탭이면) 끝난 요청은 요약(짧은 답변은 답변), 아니면 진행 과정.
  shownTab(p) {
    const has = { digest: this.digestible(p), files: (p.edits ?? []).length > 0 };
    if (this.tab && has[this.tab] !== false) return this.tab;
    return p.reply && p.ended ? (has.digest ? "digest" : "reply") : "steps";
  }

  // 앞뒤 요청으로(by 1: 더 예전 것, -1: 더 최근 것).
  step(by) {
    const { i } = this.current();
    const next = this.reqs[i + by];
    if (i < 0 || !next) return;
    this.key = next.at; this.kept = next; this.seen = -1; this.copied = null;
  }

  detailCommand(name, cx) {
    if (name === "close") { try { if (this.overlay) closeOverlay(this.overlay); } catch {} return; }
    if (TABS.includes(name)) this.tab = name;
    else if (name === "older") this.step(1);
    else if (name === "newer") this.step(-1);
    else return;
    this.digest(cx);
    cx.notify();
  }

  renderDetail(cx) {
    const t = theme(), mono = settings().font_family, dark = isDark(t);
    const { p, i, newest } = this.current();
    const frame = v_flex().id("request-log-detail").track_focus(this.handle).size_full().min_h(0).bg(t.popover).text_color(t.foreground).text_size(13);
    if (!p) return frame;
    const a = agents().find((x) => x.address === this.agent);
    const state = stateOf(p, newest, a?.status ?? null), look = lookOf(t, state), live = state === "live";
    const steps = p.steps ?? [], also = p.also ?? [], edits = p.edits ?? [], by = p.by ?? [];
    const app = by.find((x) => x.main)?.who ?? appOf(a, this.app);
    const tab = this.shownTab(p), word = wordOf(p, state);
    const when = dayOf(p.at) + " " + hhmm(p.at) + (state === "done" && p.done ? " – " + hhmm(p.done) : "");
    const digest = this.digestOf(p), good = dark ? "#57ab5a" : "#1a7f37";
    const move = (by, cx) => { this.step(by); this.digest(cx); cx.notify(); };

    const label = (text) => div().flex_none().text_size(11.5).font_semibold().text_color(t.muted).child(text);
    const card = () => v_flex().flex_1().min_w(0).px(14).pt(12).pb(13).gap(10).rounded(12).bg(t.raised);
    const button = (id, name, text, click) => h_flex().id(id).h(30).px(12).gap(6).flex_none().items_center().rounded(15).bg(t.raised)
      .text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.selected)).on_click(click)
      .child(ic(name, 12, t.muted)).child(text);
    const round = (id, name, tip, on, click) => h_flex().id(id).size(30).flex_none().items_center().justify_center().rounded(15).bg(t.raised).tooltip(tip)
      .when(on, (el) => el.cursor_pointer().hover((s) => s.bg(t.selected)).on_click(click))
      .child(ic(name, 14, on ? t.muted : t.border));
    const empty = (name, text) => v_flex().flex_1().min_h(0).pb(30).gap(12).items_center().justify_center()
      .child(badge(name, 44, t.raised, t.dim, false))
      .child(div().text_size(12.5).text_color(t.muted).child(text));
    const body = (id) => v_flex().id("detail-" + id).flex_1().min_h(0).overflow_y_scrollbar().px(22).pt(16).pb(8);

    // 누가 했나: 한 줄에 한 쪽. 이름과 어떻게 맡았는지, 모델, effort(눈금 다섯 칸), 쓴 출력 토큰(여럿이면 몫을 막대로).
    const spent = by.reduce((n, x) => n + (x.tokens || 0), 0), several = by.filter((x) => x.tokens > 0).length > 1;
    const tileOf = (who) => h_flex().size(30).flex_none().items_center().justify_center().rounded(9).bg(t.background).child(face(who === "sub" ? app : who, 17, t));
    const actor = (x, k) => {
      const v = actorOf(x), tip = (x.what ?? []).length ? "맡긴 일: " + x.what.join(" / ") : "";
      const row = h_flex().id("actor-" + k).gap(10).items_center()
        .child(tileOf(v.face))
        .child(v_flex().flex_1().min_w(0).gap(4)
          .child(h_flex().gap(6).items_center()
            .child(div().flex_none().text_size(13).font_medium().child(v.name))
            .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(v.how))
            .when(Boolean(v.model), (el) => el.child(div().flex_none().text_size(12.5).font_medium().text_color(x.model && x.model !== "?" ? t.foreground : t.dim).child(v.model))))
          .when(Boolean(v.effort) || x.tokens > 0, (el) => el.child(h_flex().gap(6).items_center().text_size(11.5).text_color(t.muted)
            .when(Boolean(v.effort), (el) => el.child(div().flex_none().text_color(t.dim).child("effort")).child(meter(t, v.effort)).child(div().flex_none().font_medium().child(v.effort)))
            .child(div().flex_1())
            .when(x.tokens > 0, (el) => el.child(div().flex_none().text_color(t.dim).child("출력 " + count(x.tokens))))
            .when(x.tokens > 0 && several, (el) => el.child(div().w(44).h(4).flex_none().rounded(2).bg(t.border)
              .child(div().h(4).rounded(2).bg(t.muted).w(Math.max(8, (x.tokens / spent) * 100).toFixed(1) + "%")))))));
      return tip ? row.tooltip(tip) : row;
    };
    const whoCard = card()
      .child(label("누가 했나"))
      .children(by.slice(0, 4).map(actor))
      .when(by.length > 4, (el) => el.child(div().text_size(11.5).text_color(t.dim).child("외 " + (by.length - 4) + "곳은 진행 과정에 나옵니다.")))
      .when(!by.length, (el) => el.child(h_flex().gap(10).items_center()
        .child(tileOf(app))
        .child(v_flex().gap(3)
          .child(div().text_size(13).font_medium().child(OWNER[app] ?? "Claude Code"))
          .child(div().text_size(11.5).text_color(t.dim).child("모델 기록이 남아 있지 않습니다.")))));

    // 작업 흐름: 보낸 때부터 마지막 활동까지를 같은 폭의 칸으로 나눈 기둥(칸마다 한 일의 수), 그 아래 한 일의 구성.
    const mix = p.mix ?? {};
    const parts = MIX.map(([id, name, onLight, onDark]) => ({ id, name, color: (dark ? onDark : onLight) ?? t.dim,
      n: id === "look" ? (mix.read || 0) + (mix.web || 0) : id === "rest" ? (mix.hand || 0) + (mix.etc || 0) : mix[id] || 0 })).filter((x) => x.n > 0);
    const used = parts.reduce((n, x) => n + x.n, 0);
    const pace = p.pace, t0 = new Date(p.at).getTime(), H = 38;
    let cols = [], peak = 0, per = 0;
    if (pace?.n?.length && !isNaN(t0)) {
      const end = live ? Date.now() : new Date(p.done ?? p.at).getTime();
      const secs = Math.max((pace.n[pace.n.length - 1][0] + 1) * pace.res, ((isNaN(end) ? t0 : end) - t0) / 1000);
      const bars = Math.max(12, Math.min(48, Math.ceil(secs / pace.res)));
      per = secs / bars;
      cols = new Array(bars).fill(0);
      for (const [k, n] of pace.n) cols[Math.min(bars - 1, Math.floor((k * pace.res) / per))] += n;
      peak = Math.max(1, ...cols);
    }
    const ink = tint(t.foreground, 0.58);
    const col = (n, k) => v_flex().id("pace-" + k).flex_1().min_w(0).h(H).justify_end().items_center().px(1)
      .when(n > 0, (el) => el.tooltip(hhmm(new Date(t0 + k * per * 1000).toISOString()) + " · " + n + "번").hover((s) => s.bg(t.hover))
        .child(div().w_full().max_w(14).h(Math.max(3, Math.round((n / peak) * H))).rounded_t(2).bg(ink)));
    const flowCard = card()
      .child(h_flex().items_center().child(label("작업 흐름")).child(div().flex_1())
        .when(used > 0, (el) => el.child(div().flex_none().text_size(11.5).text_color(t.dim).child("도구 사용 " + used + "번"))))
      .when(cols.length > 0, (el) => el.child(v_flex().gap(4)
        .child(h_flex().h(H).items_end().border_b(1).border_color(t.border).children(cols.map(col)))
        .child(h_flex().text_size(11).text_color(t.dim)
          .child(div().flex_none().child(hhmm(p.at)))
          .child(div().flex_1())
          .child(div().flex_none().text_color(live ? t.working : t.dim).child(live ? "지금" : hhmm(p.done ?? p.at))))))
      .when(parts.length > 0, (el) => el.child(v_flex().gap(7)
        .child(h_flex().h(8).overflow_hidden().children(parts.map((x, k) => div().id("mix-" + x.id).h(8).flex_none().min_w(6).w(((x.n / used) * 100).toFixed(2) + "%")
          .tooltip(x.name + " " + x.n + "번 (" + Math.round((x.n / used) * 100) + "%)")
          .child(div().h(8).rounded(4).bg(x.color).when(k < parts.length - 1, (el) => el.mr(2))))))
        .child(h_flex().flex_wrap().gap_x(12).gap_y(3).children(parts.map((x) => h_flex().flex_none().gap(5).items_center().text_size(11.5)
          .child(div().size(8).flex_none().rounded(4).bg(x.color))
          .child(div().text_color(t.muted).child(x.name))
          .child(div().font_medium().child(String(x.n))))))))
      .when(!cols.length && !parts.length, (el) => el.child(div().text_size(12).text_color(t.dim).child(live ? "아직 한 일이 없습니다." : "도구를 쓰지 않고 답했습니다.")));

    const tabs = [["digest", "요약", ""], ["reply", "답변", ""], ["steps", "진행 과정", steps.length + (p.cut ?? 0) || ""], ["files", "바꾼 파일", edits.length || ""], ["sent", "보낸 글", ""]]
      .filter((x) => (x[0] !== "files" || edits.length > 0) && (x[0] !== "digest" || this.digestible(p)));
    // 탭: 옅은 면 위에서 고른 것만 바탕색 면으로 올라온다.
    const seg = ([id, name, n]) => h_flex().id("tab-" + id).flex_1().h(30).gap(6).items_center().justify_center().rounded(8).text_size(12.5)
      .when(tab === id, (el) => el.bg(t.background).shadow_sm().font_medium().text_color(t.foreground))
      .when(tab !== id, (el) => el.text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.tab = id; cx.notify(); }))
      .child(name)
      .when(n !== "", (el) => el.child(div().text_size(11).text_color(t.dim).child(String(n))));

    // 요약: 결론 한 문장이 가장 크게, 그 아래 한 일, 확인한 것과 남은 것(나란히), 알아둘 것.
    const point = (text, color) => h_flex().gap(9).items_start()
      .child(div().flex_none().pt(8).child(div().size(5).rounded(3).bg(color)))
      .child(div().flex_1().min_w(0).whitespace_normal().text_size(13.5).line_height("21px").child(text));
    const block = (icon, name, color, items, side) => v_flex().px(16).pt(13).pb(15).gap(8).rounded(12).bg(t.raised)
      .when(Boolean(side), (el) => el.flex_1().min_w(0))
      .when(!side, (el) => el.flex_none())
      .child(h_flex().pb(1).gap(8).items_center()
        .child(badge(icon, 22, tint(color, 0.15), color, false))
        .child(div().text_size(12.5).font_semibold().child(name))
        .child(div().text_size(11.5).text_color(t.dim).child(String(items.length))))
      .children(items.map((x) => point(x, tint(color, 0.75))));
    const toReply = (_e, cx) => { this.tab = "reply"; cx.notify(); };
    const digestView = () => {
      const why = this.failed[p.at];
      if (!digest && why) return v_flex().flex_1().min_h(0).pb(30).gap(12).items_center().justify_center()
        .child(badge("alert", 44, t.raised, t.dim, false))
        .child(div().text_size(12.5).text_color(t.muted).child(WHY_DIGEST[why] ?? "요약을 쓰지 못했습니다."))
        .child(h_flex().gap(8)
          .child(button("digest-full", "message", "답변 전문 보기", toReply))
          .when(!WHY_DIGEST[why], (el) => el.child(button("digest-retry", "ring", "다시 쓰기", (_e, cx) => { delete this.failed[p.at]; this.digest(cx); cx.notify(); }))));
      // 쓰는 중: 자리만 잡은 면이 옅게 깜빡인다.
      if (!digest) return body("digest").gap(12)
        .child(h_flex().flex_none().gap(8).items_center().text_size(12).text_color(t.muted).child(ic("ring", 13, t.muted).spin(900)).child("답변을 간추리는 중입니다."))
        .child(v_flex().flex_none().gap(10).loop("opacity", { from: 0.5, to: 1, period: 1300 })
          .child(v_flex().px(18).py(18).gap(10).rounded(12).bg(tint(t.accent, dark ? 0.16 : 0.07))
            .child(div().h(12).w(430).rounded(6).bg(tint(t.accent, 0.16))).child(div().h(12).w(250).rounded(6).bg(tint(t.accent, 0.16))))
          .child(v_flex().px(16).py(16).gap(12).rounded(12).bg(t.raised)
            .children([120, 380, 320, 350].map((w) => div().h(10).w(w).rounded(5).bg(t.border)))));
      const did = digest.did ?? [], checked = digest.checked ?? [], open = digest.open ?? [], note = digest.note ?? [];
      return body("digest").gap(10)
        .child(v_flex().flex_none().px(18).pt(14).pb(16).gap(6).rounded(12).bg(tint(t.accent, dark ? 0.16 : 0.07))
          .child(div().text_size(11.5).font_semibold().text_color(t.accent).child("결론"))
          .child(div().whitespace_normal().text_size(16).line_height("25px").font_semibold().child(digest.headline ?? "")))
        .when(did.length > 0, (el) => el.child(block("list", "한 일", t.accent, did, false)))
        .when(checked.length > 0 || open.length > 0, (el) => el.child(h_flex().flex_none().gap(10).items_stretch()
          .when(checked.length > 0, (el) => el.child(block("shield", "확인한 것", good, checked, true)))
          .when(open.length > 0, (el) => el.child(block("flag", "남은 것", t.working, open, true)))))
        .when(note.length > 0, (el) => el.child(block("info", "알아둘 것", t.muted, note, false)))
        .child(h_flex().flex_none().pt(2).pb(8).child(button("digest-full", "message", "답변 전문 보기", toReply)));
    };
    // 요약을 글로(복사용).
    const digestText = () => [["결론", [digest?.headline ?? ""]], ["한 일", digest?.did ?? []], ["확인한 것", digest?.checked ?? []], ["남은 것", digest?.open ?? []], ["알아둘 것", digest?.note ?? []]]
      .filter((x) => x[1].length > 0).map(([name, items]) => name + "\n" + items.map((x) => "- " + x).join("\n")).join("\n\n");

    // 진행 과정의 한 단계: 아이콘과 아래로 잇는 선, 한 일, 시각. 설명 없이 이어진 명령은 "명령 7번"과 마지막 명령.
    // 다른 쪽에 맡긴 단계는 그쪽 아이콘이 오고, 아래에 누구 · 모델 · effort 가 붙는다.
    const row = (s, k) => {
      const end = k === steps.length - 1 && !live, cmd = s.k === "cmd", say = s.k === "say";
      const who = s.a != null ? by[s.a] : null, v = who ? actorOf(who) : null;
      const text = cmd ? "명령 " + (s.c ?? 1) + "번" : KIND[s.k] ? KIND[s.k] + " · " + s.t : s.t;
      return h_flex().gap(12).items_stretch()
        .child(v_flex().w(24).flex_none().items_center()
          .child(v ? h_flex().size(24).flex_none().items_center().justify_center().rounded(12).bg(t.raised).child(face(v.face === "sub" ? app : v.face, 14, t))
            : badge(ICON[s.k] ?? "terminal", 24, say ? tint(t.accent, 0.12) : t.raised, say ? t.accent : t.muted, false))
          .when(!end, (el) => el.child(div().w(1).flex_1().min_h(10).bg(t.border))))
        .child(v_flex().flex_1().min_w(0).pb(end ? 0 : 14).gap(3)
          .child(h_flex().gap(12).items_start()
            .child(div().flex_1().min_w(0).pt(2).whitespace_normal().text_size(13).line_height("20px").text_color(say ? t.foreground : t.muted).child(text))
            .child(div().flex_none().pt(4).text_size(11).text_color(t.dim).child(hhmm(s.at))))
          .when(cmd, (el) => el.child(div().truncate().text_size(11.5).font_family(mono).text_color(t.dim).child(s.t)))
          .when(Boolean(v), (el) => el.child(h_flex().gap(6).items_center().text_size(11.5).text_color(t.muted)
            .child(div().flex_none().font_medium().text_color(t.foreground).child(who?.who === "sub" && who?.name ? "서브에이전트 " + who.name : (v?.name ?? "")))
            .when(Boolean(v?.model), (el) => el.child(div().flex_none().text_color(t.dim).child("·")).child(div().flex_none().child(v?.model ?? "")))
            .when(Boolean(v?.effort), (el) => el.child(div().flex_none().text_color(t.dim).child("·")).child(meter(t, v?.effort ?? "")).child(div().flex_none().child(v?.effort ?? ""))))));
    };
    // 바꾼 파일: 폴더별로 묶는다.
    const folders = [], seen = {};
    for (const x of edits) {
      const cut = x.lastIndexOf("/"), dir = x.slice(0, Math.max(0, cut)).replace(home(), "~") || "/";
      if (!seen[dir]) { seen[dir] = []; folders.push([dir, seen[dir]]); }
      seen[dir].push(x.slice(cut + 1));
    }
    const content = tab === "digest" ? digestView()
      : tab === "reply"
      ? (p.reply
        ? body("reply").child(TextView.markdown("reply-" + p.at, p.reply).selectable(true).text_size(13.5))
        : empty(live ? "ring" : "message", live ? "작업이 끝나면 답변이 여기에 나옵니다." : "남긴 답변이 없습니다."))
      : tab === "steps"
      ? (steps.length || live
        ? body("steps").track_scroll(this.scroll)
          .children(steps.map(row))
          .when(live, (el) => el.child(h_flex().gap(12).items_center()
            .child(badge("ring", 24, tint(t.working, 0.14), t.working, true))
            .child(div().text_size(13).text_color(t.working).child("진행 중"))))
          .when(p.cut > 0, (el) => el.child(div().pt(14).text_size(11.5).text_color(t.dim).child("처음 " + p.cut + "단계는 남아 있지 않습니다.")))
        : empty("terminal", "기록된 단계가 없습니다."))
      : tab === "files"
      ? body("files").gap(14).children(folders.map(([dir, names]) => v_flex().flex_none().gap(2)
        .child(h_flex().h(26).gap(8).items_center().min_w(0)
          .child(ic("folder", 14, t.muted))
          .child(div().flex_1().min_w(0).truncate().text_size(12).font_medium().text_color(t.muted).child(dir.length > 78 ? "…" + dir.slice(-77) : dir))
          .child(div().flex_none().text_size(11.5).text_color(t.dim).child(names.length + "개")))
        .children(names.map((name) => h_flex().h(30).pl(22).pr(10).gap(10).items_center().min_w(0).rounded(8).hover((s) => s.bg(t.hover))
          .child(ic("file", 14, t.dim))
          .child(div().flex_1().min_w(0).truncate().text_size(13).child(name))))))
      : body("sent").gap(14)
        .child(div().whitespace_normal().text_size(13.5).line_height("22px").child(p.text))
        .when(also.length > 0, (el) => el.child(v_flex().gap(8)
          .child(div().text_size(11.5).font_semibold().text_color(t.muted).child("일하는 중에 덧붙인 말"))
          .children(also.map((m) => h_flex().px(14).py(10).gap(12).items_start().rounded(10).bg(t.raised)
            .child(div().flex_1().min_w(0).whitespace_normal().text_size(13).line_height("20px").child(m.text))
            .child(div().flex_none().pt(3).text_size(11).text_color(t.dim).child(hhmm(m.at)))))));
    const copying = tab === "digest" && digest ? ["digest", "요약 복사", digestText()]
      : tab === "reply" && p.reply ? ["reply", "답변 복사", p.reply] : tab === "sent" ? ["sent", "보낸 글 복사", p.text] : null;

    return frame
      .on_key_down((e, cx) => {
        if (e.key === "left") move(1, cx);
        else if (e.key === "right") move(-1, cx);
        else return;
        cx.stop_propagation();
      })
      // 머리: 상태, 주제 제목, 언제 · 얼마나.
      .child(h_flex().flex_none().pl(22).pr(16).pt(20).pb(14).gap(14).items_start()
        .child(badge(look.icon, 30, tint(look.color, 0.14), look.color, Boolean(look.spin)))
        .child(v_flex().flex_1().min_w(0).gap(4)
          .child(div().whitespace_normal().text_size(17).line_height("24px").font_semibold().child(p.topic || said(p)))
          .child(h_flex().text_size(12).text_color(t.muted)
            .child(div().flex_none().child(when))
            .when(Boolean(word), (el) => el.child(div().flex_none().text_color(live ? t.working : state === "waiting" ? t.blocked : t.muted).child(" · " + word)))))
        .child(h_flex().id("detail-close").size(30).flex_none().items_center().justify_center().rounded(15).cursor_pointer().tooltip("닫기 (Esc)")
          .hover((s) => s.bg(t.hover)).on_click(() => { if (this.overlay) closeOverlay(this.overlay); })
          .child(ic("x", 15, t.muted))))
      // 한눈에: 누가 했나, 작업 흐름.
      .child(h_flex().flex_none().px(22).gap(10).items_stretch().child(whoCard).child(flowCard))
      .child(h_flex().flex_none().mx(22).mt(14).p(3).gap(2).rounded(11).bg(t.raised).children(tabs.map(seg)))
      .child(content)
      // 바닥: 보이는 글 복사, 앞뒤 요청.
      .child(h_flex().flex_none().px(22).pt(10).pb(16).gap(8).items_center()
        .when(Boolean(copying), (el) => el.child(button("detail-copy", this.copied === copying?.[0] ? "check" : "copy",
          this.copied === copying?.[0] ? "복사했습니다" : (copying?.[1] ?? ""), (_e, cx) => this.copy(cx, copying[0], copying[2]))))
        .child(div().flex_1())
        .when(i >= 0 && this.reqs.length > 1, (el) => el
          .child(div().flex_none().pr(4).text_size(11.5).text_color(t.dim).child((this.reqs.length - i) + " / " + this.reqs.length))
          .child(round("detail-older", "chevron-left", "이전 요청 (←)", i < this.reqs.length - 1, (_e, cx) => move(1, cx)))
          .child(round("detail-newer", "chevron-right", "다음 요청 (→)", i > 0, (_e, cx) => move(-1, cx)))));
  }

  // ---- 탭 줄의 버튼: 패널을 여닫는다.
  toggle() {
    const t = theme(), id = blockProps()?.panel ?? PANEL, node = find(layout(), id), on = Boolean(node) && !node.hidden;
    return h_flex().size_full().pr(4).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("toggle-request-log").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => run("layout.toggle", { id }))
        .child(image("mods/request-log/icon.png").w(15).h(15).flex_none())
        .child("히스토리"));
  }

  render(cx) {
    if (this.role === "toggle") return this.toggle();
    if (this.role === "detail") return this.renderDetail(cx);
    const t = theme();
    // 다른 에이전트로 옮겼으면 다음 틱을 기다리지 않고 따라간다(그리는 중에는 못 하니 미룬다).
    const here = this.here();
    if (here && here !== this.agent && !this.jumping && !checking()) {
      this.jumping = true;
      cx.spawn(async (cx) => { await cx.sleep(0); this.jumping = false; this.follow(cx, true); });
    }
    const list = this.reqs;
    const a = agents().find((x) => x.address === this.agent);
    const status = a?.status ?? null;
    // 제목이 쓸 수 있는 폭: 패널에서 목록 여백, 줄 여백, 상태 동그라미, 화살표를 뺀 것.
    const titleW = Math.max(160, this.width - 92);
    const app = appOf(a, this.app);

    // 요청 한 줄. 진행 중이면 옅게 물든 면, 누르면 모달로 열린다.
    const item = (p, i) => {
      const key = p.at, state = stateOf(p, i === 0, status), look = lookOf(t, state), live = state === "live";
      const steps = p.steps ?? [], also = p.also ?? [], edits = p.edits ?? [];
      // 지금 하는 일: 마지막으로 한 말이나 설명이 붙은 일, 없으면 마지막 명령.
      const now = steps.findLast((s) => s.k !== "cmd") ?? steps[steps.length - 1];
      const word = wordOf(p, state);
      const facts = [p.cmds ? "명령 " + p.cmds + "번" : "", edits.length ? "파일 " + edits.length + "개" : "", also.length ? "덧붙인 말 " + also.length + "개" : ""].filter(Boolean).join(" · ");
      // 제목을 받는 중에는 옅게 보인다.
      const waiting = p.topic == null && !this.off && !WHY[this.why];
      // 누가 했나: 이 대화의 에이전트(모델 · effort), 그리고 함께 일한 쪽(서브에이전트, 셸에서 부른 Codex · agy · Claude).
      const by = p.by ?? [], helpers = by.filter((x) => !x.main), base = by.find((x) => x.main)?.who ?? app;
      const pill = (x, k) => {
        const v = actorOf(x), text = x.main ? [v.model, v.effort].filter(Boolean).join(" · ") : v.name + (x.n > 1 ? " " + x.n : "");
        return h_flex().id("by-" + i + "-" + k).h(18).pl(5).pr(7).gap(4).flex_none().items_center().rounded(9).bg(t.raised).text_size(10.5).text_color(t.muted)
          .tooltip([v.name, v.how, v.model, v.effort].filter(Boolean).join(" · "))
          .child(face(v.face === "sub" ? base : v.face, 11, t)).child(text);
      };
      const pills = by.filter((x) => x.main && x.model).concat(helpers.slice(0, 3)).map(pill);
      if (helpers.length > 3) pills.push(div().flex_none().text_size(10.5).line_height("18px").text_color(t.dim).child("+" + (helpers.length - 3)));
      return h_flex().id("req-" + i).px(12).py(10).gap(10).items_start().rounded(10).cursor_pointer()
        .when(live, (el) => el.bg(tint(t.working, 0.09)))
        .when(!live && key === this.sel, (el) => el.bg(t.hover))
        .hover((s) => s.bg(live ? tint(t.working, 0.14) : t.selected))
        .on_click((_e, cx) => { this.view(key); cx.notify(); })
        .child(badge(look.icon, 20, tint(look.color, 0.14), look.color, Boolean(look.spin)))
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().max_h(38).overflow_hidden().whitespace_normal().text_size(13).line_height("19px").font_medium().text_color(waiting ? t.muted : t.foreground)
            .child(clamp(p.topic || said(p), titleW, 2, 13)))
          .when(live && Boolean(now), (el) => el.child(h_flex().gap(6).items_center().text_size(12).line_height("17px")
            .child(div().flex_none().text_size(11).font_medium().text_color(t.working).child("지금"))
            .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(now?.t ?? ""))))
          .when(!live && Boolean(p.reply) && Boolean(p.topic), (el) => el.child(div().truncate().text_size(12).line_height("17px").text_color(t.muted).child(summary(p.reply))))
          .child(h_flex().text_size(11).text_color(t.dim)
            .child(div().flex_none().child(hhmm(p.at)))
            .when(Boolean(word), (el) => el.child(div().flex_none().text_color(live ? t.working : state === "waiting" ? t.blocked : t.dim).child(" · " + word)))
            .when(Boolean(facts), (el) => el.child(div().flex_1().min_w(0).truncate().child(" · " + facts))))
          .when(pills.length > 0, (el) => el.child(h_flex().pt(3).gap(4).overflow_hidden().children(pills))))
        .child(div().flex_none().pt(3).child(ic("chevron-right", 13, t.dim)));
    };

    // 목록: 날짜 이름 한 줄, 그날의 요청들. 요청마다 몇 번째 자식인지 적어 둔다(스크롤).
    const kids = [], rows = {};
    let day = null;
    list.forEach((p, i) => {
      const name = dayOf(p.at);
      if (name !== day) {
        day = name;
        kids.push(div().px(12).pt(kids.length ? 14 : 4).pb(4).text_size(11).font_semibold().text_color(t.dim).child(name));
      }
      rows[p.at] = kids.length;
      kids.push(item(p, i));
    });
    this.rows = rows;

    // 머리 오른쪽: 어느 에이전트의 기록인가.
    const who = a ? [a.program?.name, a.space_name].filter(Boolean).join(" · ") : "";
    const mark = !a ? null : !a.program?.icon ? ic("bot", 13, t.muted)
      : a.program.tint ? svg(a.program.icon).size(13).flex_none().text_color(t.muted) : image(a.program.icon).w(13).h(13).flex_none();
    // 요약하지 못하고 있으면 그 까닭을 한 줄로.
    const trouble = !this.off && list.some((p) => !p.topic) ? WHY[this.why] : null;
    // 읽는 동안: 자리만 잡은 줄 셋이 옅게 깜빡인다.
    const bone = (w) => div().h(9).w(w).rounded(5).bg(t.raised);
    const loading = () => v_flex().px(8).pt(8).gap(4).loop("opacity", { from: 0.5, to: 1, period: 1300 })
      .children([210, 150, 180].map((w) => h_flex().px(12).py(10).gap(10).items_start()
        .child(div().size(20).flex_none().rounded(10).bg(t.raised))
        .child(v_flex().flex_1().pt(5).gap(8).child(bone(w)).child(bone(w - 80)))));
    // 보일 요청이 없을 때: 가운데에 아이콘과 한마디.
    const blank = () => v_flex().flex_1().min_h(0).px(28).pb(40).gap(12).items_center().justify_center()
      .child(badge(this.note === "failed" ? "alert" : "message", 44, t.raised, t.dim, false))
      .child(div().whitespace_normal().text_center().text_size(12.5).line_height("19px").text_color(t.muted).child(NOTE[this.note] ?? ""));

    return v_flex().id("request-log").track_focus(this.handle).size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 1) { this.width = size.width; cx.notify(); } })
      .on_key_down((e, cx) => {
        if (e.key === "enter") this.command("toggle", cx);
        else if (e.key === "down") this.command("next", cx);
        else if (e.key === "up") this.command("prev", cx);
      })
      .child(h_flex().h(46).flex_none().pl(16).pr(10).gap(8).items_center()
        .child(image("mods/request-log/icon.png").w(18).h(18).flex_none())
        .child(div().flex_none().text_size(14).font_semibold().child("히스토리"))
        .child(div().flex_1())
        .when(Boolean(a), (el) => el.child(h_flex().h(24).pl(8).pr(10).gap(6).min_w(0).items_center().rounded(12).bg(t.raised).text_size(11.5).text_color(t.muted)
          .child(mark ?? ic("bot", 13, t.muted))
          .child(div().min_w(0).truncate().child(who)))))
      // 무슨 작업인가: 주제, 지금까지 한 일 한 문장, 요청 수와 지금 들고 있는 컨텍스트.
      .when(list.length > 0, (el) => el.child(v_flex().flex_none().mx(8).mb(4).px(12).py(11).gap(4).rounded(10).bg(t.raised)
        .child(div().whitespace_normal().text_size(13.5).line_height("19px").font_semibold().child(this.topic || this.title || "제목 없는 대화"))
        .when(Boolean(this.gist), (el) => el.child(div().whitespace_normal().text_size(12).line_height("18px").text_color(t.muted).child(this.gist)))
        .child(div().truncate().pt(1).text_size(11).text_color(t.dim)
          .child([(this.more ? "최근 요청 " : "요청 ") + list.length + "건", this.context > 0 ? "컨텍스트 " + count(this.context) : ""].filter(Boolean).join(" · ")))
        .when(Boolean(trouble), (el) => el.child(div().whitespace_normal().text_size(11).line_height("16px").text_color(t.dim).child(trouble ?? "")))))
      .when(this.note === "loading", (el) => el.child(loading()))
      .when(Boolean(this.note) && this.note !== "loading", (el) => el.child(blank()))
      .when(list.length > 0, (el) => el.child(v_flex().id("request-log-list").track_scroll(this.scroll).flex_1().min_h(0).overflow_y_scrollbar().px(8).pt(2).pb(10).gap(2)
        .children(kids)
        .when(this.more, (el) => el.child(div().pt(10).text_center().text_size(11).text_color(t.dim).child("더 오래된 요청은 여기에 나오지 않습니다.")))));
  }
}
