// 사이드바의 에이전트 목록(기본 제공 agents 를 복제해 고친 것): 한글 이름, 스페이스 > 에이전트 위계
// (스페이스 머리에 같은 색 표지, 그 아래로 들여 쓴 에이전트), 상태에 따라 물드는 시간과 상태를 말로 알려 주는 풍선말.
// 동작은 원본 그대로다.
// Agents in grouped or priority views; parents take their most urgent sub-agent's place.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout, hc, exec, checking } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it ("✦  Working", "⠋ - Thinking"), and Codex's blinking "[ ! ] " / "[ . ] " mark.
// Stops at an opening bracket or quote, so a title that starts with one ("[web] login") keeps it.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

// Antigravity(agy)는 터미널 제목을 비워 두어 이름 대신 「Antigravity」만 보였다. 그 agy 가 열어 둔
// 대화(presence/<대화>.lock)의 제목을 agy 의 요약 DB 에서 읽는다. 다른 컴퓨터의 agy 는 그 컴퓨터에서 읽는다.
const AGY = new Map(); // 터미널 주소 -> { name, at }
const AGY_TITLE = `PATH="$PATH:/usr/sbin:/usr/bin:/sbin:/bin"
id=$(lsof -a -p "$1" -Fn 2>/dev/null | sed -n 's#^n.*/antigravity-cli/presence/\\([0-9a-f-]*\\)\\.lock$#\\1#p' | head -n 1)
[ -n "$id" ] || exit 0
exec sqlite3 -readonly "file:$HOME/.gemini/antigravity-cli/conversation_summaries.db?immutable=1" "select title from conversation_summaries where conversation_id='$id'" 2>/dev/null`;
const agyName = (l) => (l?.app === "antigravity" ? AGY.get(l.terminal ?? l.address)?.name ?? "" : "");

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    // First agent, else first focused terminal, else first terminal in the tab.
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, l) {
  const prog = l?.program?.name;
  // agy 의 터미널 제목은 비었거나 프로그램 이름뿐이라, 읽어 둔 대화 제목이 있으면 그것을 쓴다.
  const raw = clean(l?.title);
  const agy = clean(agyName(l));
  const bare = !raw || raw === (l?.terminal ?? l?.address) || raw === prog || raw.toLowerCase() === l?.program?.key || raw.toLowerCase() === "agy";
  const live = agy && bare ? agy : raw;
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((l?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== (l?.terminal ?? l?.address) && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "priority", label: "급한 순서", icon: "clock" },
  { id: "grouped", label: "스페이스별", icon: "layers" },
  { id: "machines", label: "컴퓨터별", icon: "monitor" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "확인 필요", 3: "끝남", 2: "작업 중", 1: "쉬는 중" };
// 상태를 부르는 말(풍선말), 스페이스 표지의 색(spaces 와 같다).
const WORD = { blocked: "확인 필요", done: "끝남 · 아직 보지 않음", working: "작업 중", idle: "쉬는 중", finished: "끝남 · 확인함" };
// 끝난 지 이만큼이 지나기 전에는 흐리게 하지 않는다: 방금 끝난 일은 아직 소식이다.
const FRESH = 3600000;
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}시간` : `${Math.floor(h / 24)}일`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu) return;
    this.folded = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts.
    try { this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}"); } catch { this.changed = {}; }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
    try { this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]"); } catch { this.pendingPins = []; }
    if (!Array.isArray(this.pendingPins)) this.pendingPins = [];
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    cx.timer.every(30000, (cx) => cx.notify());
    this.agyBusy = new Set();
    cx.timer.every(5000, (cx) => this.refreshAgy(cx));
  }

  // agy 의 대화 제목: 처음 보면 바로, 그 뒤로는 1분마다 다시 읽는다(대화가 이어지며 제목이 바뀐다).
  refreshAgy(cx) {
    if (checking()) return;
    const now = Date.now();
    const due = agents().filter((a) => a.app === "antigravity" && !this.agyBusy.has(a.address) && now - (AGY.get(a.address)?.at ?? 0) > 60000);
    if (!due.length) return;
    const machineOf = new Map(spaces().map((s) => [s.id, s.machine ?? null]));
    for (const a of due) this.agyBusy.add(a.address);
    cx.spawn(async (cx) => {
      let changed = false;
      for (const a of due) {
        const old = AGY.get(a.address)?.name ?? "";
        let name = old;
        try {
          const g = await hc(["get", a.address, "--json"]);
          const pid = g.code === 0 ? JSON.parse(g.stdout)?.foreground?.pid : null;
          if (pid) {
            const r = await exec("sh", ["-c", AGY_TITLE, "sh", String(pid)], { on: machineOf.get(a.space) ?? null, timeout: 8000 });
            if (r.code === 0) name = clean(r.stdout.split("\n")[0]);
          }
        } catch {}
        AGY.set(a.address, { name, at: Date.now() });
        this.agyBusy.delete(a.address);
        if (name !== old) changed = true;
      }
      if (changed) cx.notify();
    });
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      const prev = this.changed[a.address];
      if (prev?.s === s) continue;
      // w: 일하다 멈췄는가. 처음 본 쉬는 에이전트는 끝낸 일이 없다.
      this.changed[a.address] = { s, at: now, w: prev ? prev.s !== "idle" : false };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  // 상태 표지에 넘길 것: 쉬는 중이면 일을 끝내고 쉬는지(finished), 끝난 지 한 시간이 안 됐는지(fresh).
  markOf(a, now) {
    const idle = a.status === "idle";
    return { status: a.status, finished: idle && this.changed[a.address]?.w !== false, fresh: idle && now - this.since(a) < FRESH };
  }

  rank(a) {
    return RANK[a.status] ?? 0;
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("정렬"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact, indent = 0) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39 + indent)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => (this.listed.has(k.address) ? run("pane.focus", { terminal: k.address }) : this.peek(k.address)))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(this.status(t, { status: st }, compact));
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("확인 필요");
    // 끝남(아직 안 봄): 옅은 원 안의 체크. 끝내고 본 것: 체크만(방금이면 끝남 색, 오래되면 흐린 색). 일한 적 없는 쉬는 중: 고리.
    if (a.status === "done") return div().size(14).flex_none().rounded(7).bg(color + "26").flex().items_center().justify_center().child(svg("mods/workspace-chrome/check.svg").size(10).text_color(color));
    if (a.status === "idle" && a.finished) return h_flex().size(14).flex_none().items_center().justify_center().child(svg("mods/workspace-chrome/check.svg").size(12).text_color(a.fresh ? (t.done ?? t.dim) : t.dim));
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    // 어느 컴퓨터의 에이전트인지: 그 스페이스의 machine(이 컴퓨터는 null), 모르면 주소 앞부분(`vps/t7`).
    const spaceList = spaces();
    const machineOfSpace = new Map(spaceList.map((s) => [s.id, s.machine ?? null]));
    const machineOf = (a) => (machineOfSpace.has(a.space) ? machineOfSpace.get(a.space) : a.address.includes("/") ? a.address.split("/")[0] : null);
    // 이 컴퓨터 먼저, 다른 컴퓨터는 스페이스 목록에 나오는 순서대로.
    const machineOrder = [null, ...new Set([...spaceList.map((s) => s.machine).filter(Boolean), ...list.map(machineOf).filter(Boolean).sort()])];
    const machineRank = (a) => machineOrder.indexOf(machineOf(a));
    // A kept sub-agent (one with a pane) is in agents() too: where a tree shows
    // it, it gets no row of its own, unless it's pinned.
    const nested = new Set(collapsed ? [] : list.flatMap((a) => this.tree(all, a.address).map((s) => s.t.address)));
    list = list.filter((a) => a.pinned || !nested.has(a.address));
    const tabCounts = new Map();
    for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
    const byPriority = sort.id === "priority";
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0))]));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    const pinned = list.filter((a) => a.pinned);
    let rest = list.filter((a) => !a.pinned);
    // 컴퓨터별: 컴퓨터마다 모아 머리를 달고 그 아래에 스페이스 묶음(스페이스 목록과 같은 위계).
    const byMachine = sort.id === "machines";
    if (byMachine) rest = rest.map((a, i) => [a, i]).sort((x, y) => machineRank(x[0]) - machineRank(y[0]) || x[1] - y[1]).map(([a]) => a);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority, byMachine && !a.pinned ? 8 : 0))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // A row reads "space \u00b7 detail": the detail is a tab someone named or the
    // agent's own title, never an automatic tab number unless two rows would
    // otherwise read the same.
    // Read the pane snapshot once: every host read copies the whole list into JS.
    const leads = leadPanes(panes());
    const tabs = new Map(spaceList.flatMap(s => s.tabs).map(tab => [tab.id, tab]));
    const labels = new Map(list.map(a => {
      const tab = tabs.get(a.tab);
      const many = tabCounts.get(a.tab) > 1;
      return [a.address, tab ? title(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : (a.title || a.program?.name || "")];
    }));
    const label = (a) => labels.get(a.address);
    const detail = new Map(list.map(a => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));
    }

    const row = (a, i, subs = []) => {
      const pic = icon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      // 다른 컴퓨터의 에이전트는 그 컴퓨터를 적는다. 묶음 머리(스페이스 · 컴퓨터)가 있으면 머리에서 말한다.
      const machine = machineOf(a);
      if (collapsed) {
        return h_flex()
          .id(`ag-${a.address}`)
          .h(26)
          .px(8)
          .flex_none()
          .items_center()
          .gap(4)
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.muted).child(String(i + 1)))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, this.markOf(a, now), true)));
      }
      const when = this.since(a);
      // 작업 중은 진하게. 쉬는 중은 끝난 지 한 시간이 지나야 흐리게: 방금 끝난 일은 끝났다는 게 보여야 한다.
      const mark = this.markOf(a, now);
      const { finished, fresh } = mark;
      const idle = a.status === "idle" && !a.focused && !fresh;
      const working = a.status === "working";
      const isPinned = a.pinned;
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "고정 해제" : "맨 위에 고정")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      // Under a space header the space goes without saying; an automatic tab number says nothing.
      // Without a space header above (priority, pinned) the row names its space.
      const full = byPriority || isPinned;
      const name = full ? a.space_name || label(a) : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      return h_flex()
        .id(`ag-${a.address}`)
        .pl(full ? 8 : byMachine ? 22 : 14)
        .pr(8)
        .h(30)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(a.focused, (el) => el.bg(t.selected))
        .when(working && !a.focused, (el) => el.bg(t.working + "14"))
        .when(idle && this.hovered !== a.address, (el) => el.opacity(0.55))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
          .when(subs.length > 0, el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          })).child(pic)))
        .child(h_flex().flex_1().min_w(0).gap(5).items_center()
          .child(div().min_w(0).max_w(full && more ? 120 : 200).truncate().text_color(idle ? t.muted : t.foreground).when(working, (el) => el.font_semibold()).child(name))
          .when(full && Boolean(more), el => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${more}`))))
        .when(Boolean(machine) && full, el => el.child(h_flex().flex_none().max_w(96).gap(3).items_center().text_size(11).text_color(t.dim)
          .child(svg("mods/workspace-chrome/server.svg").size(11).flex_none())
          .child(div().min_w(0).truncate().child(machine))))
        .when(subs.length > 0, el => el.child(fold(a, subs)))
        .when(this.hovered === a.address, el => el.child(pin))
        .when(this.hovered !== a.address && Boolean(when), el => el.child(div().flex_none().text_size(11).text_color(a.status === "working" ? (t.working ?? t.dim) : a.status === "done" ? (t.done ?? t.dim) : finished && fresh ? t.muted : t.dim).child(duration(now - when))))
        .child(div().id(`st-${a.address}`).flex_none().tooltip(finished ? WORD.finished : WORD[a.status] ?? "").child(this.status(t, mark, byPriority && !isPinned)));
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "고정", status: null, members: pinned }] : [];
    let machineGroup = null;
    for (const a of rest) {
      if (byMachine && (!machineGroup || machineGroup.machine !== machineOf(a))) {
        machineGroup = { kind: "machine", id: `mc-${machineOf(a) ?? "local"}`, machine: machineOf(a), members: [] };
        groups.push(machineGroup);
      }
      if (machineGroup) machineGroup.members.push(a);
      const r = rankOf(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, space: byPriority ? null : a.space, machine: machineOf(a), members: [a] });
    }

    // 스페이스 묶음의 머리에 붙는 표지: 스페이스 목록과 같은 색 점.
    const colors = shared("space.colors") ?? {};
    const here = spaceList.find((s) => s.active)?.id; // 지금 보고 있는 스페이스
    const mark = (g) => {
      const c = colors[g.space] ?? "ansi6";
      return div().size(8).mx(3).flex_none().rounded(4).bg(c.startsWith("#") ? c : (MARK[c] ?? t[c]));
    };
    // A group's header; it folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex()
        .id(g.id)
        .px(8)
        .when(byMachine && g.id !== "pinned", (el) => el.pl(16))
        .pt(8)
        .h(30)
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .when(Boolean(g.space), (el) => el.child(mark(g)))
        .child(div().truncate().text_color(t[g.status] ?? (g.space ? (g.space === here ? t.foreground : t.muted) : t.dim)).when(Boolean(g.space), (el) => el.font_semibold()).child(g.label))
        .child(div().text_color(t.dim).child(String(g.members.length)))
        .child(div().flex_1())
        // 스페이스별: 다른 컴퓨터의 스페이스는 머리 끝에 그 컴퓨터.
        .when(!byMachine && Boolean(g.space) && Boolean(g.machine), (el) => el.child(h_flex().flex_none().max_w(110).gap(3).items_center().font_normal().text_color(t.dim)
          .child(svg("mods/workspace-chrome/server.svg").size(11).flex_none())
          .child(div().min_w(0).truncate().child(g.machine))))
        .when(!open, (el) => el
          .when(!byPriority && top && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
    };
    // 컴퓨터 머리: 스페이스 목록의 컴퓨터 줄과 같은 모양(아이콘 · 이름). 누르면 그 컴퓨터의 에이전트를 접는다.
    const machineHeader = (g, first) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex()
        .id(g.id)
        .mt(first ? 2 : 6)
        .px(8)
        .h(26)
        .flex_none()
        .gap(7)
        .items_center()
        .rounded(6)
        .text_size(11)
        .font_medium()
        .text_color(t.muted)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${g.machine ? "server" : "monitor"}.svg`).size(13).flex_none())
        .child(div().truncate().child(g.machine ?? "이 컴퓨터"))
        .child(div().font_normal().text_color(t.dim).child(String(g.members.length)))
        .child(div().flex_1())
        .when(!open && Boolean(top) && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none().text_color(t.dim));
    };
    const wide = () => {
      const out = [];
      let hidden = false; // 접힌 컴퓨터 아래의 묶음
      for (const g of groups) {
        if (g.kind === "machine") {
          // 앞에 다른 컴퓨터가 있으면 가는 선으로 구역을 나눈다.
          if (out.length) out.push(div().h(1).mx(8).mt(12).flex_none().bg(t.border));
          out.push(machineHeader(g, out.length === 0));
          hidden = this.folded.has(g.id);
          continue;
        }
        if (hidden) continue;
        out.push(header(g));
        if (!this.folded.has(g.id)) out.push(...g.members.flatMap(withKids));
      }
      return out;
    };
    // 접힌 사이드바: 다른 컴퓨터의 에이전트 앞에 그 컴퓨터 표시(마우스를 올리면 이름).
    const rail = () => {
      const out = [];
      let m;
      list.forEach((a, i) => {
        if (!byPriority && !a.pinned && machineOf(a) !== m) {
          m = machineOf(a);
          if (m) out.push(h_flex().id(`mc-rail-${m}`).h(20).mt(4).flex_none().items_center().justify_center().text_color(t.dim).tooltip(m)
            .child(svg("mods/workspace-chrome/server.svg").size(11)));
        }
        out.push(...withKids(a, i));
      });
      return out;
    };
    const rows = collapsed ? rail() : wide();

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(13)
      .when(!collapsed, (el) =>
        el.child(
          h_flex()
            .px(16)
            .h(41)
            .pt(14)
            .pb(5)
            .flex_none()
            .items_center()
            .justify_between()
            .child(h_flex().gap(6).items_center().text_size(12).child(div().font_semibold().text_color(t.muted).child("에이전트")).child(div().text_size(11).text_color(t.dim).child(String(list.length))))
            .child(
              div()
                .id("ag-sort")
                .text_size(11)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(() => openOverlay({ mod: "sidebar-agents", kind: "popup", width: 200, height: 171, props: { sortMenu: true } }))
                .tooltip(`정렬: ${sort.label}`)
                .child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14)),
            ),
        ),
      )
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("아직 상태를 알린 에이전트가 없습니다. 에이전트가 상태를 알리면 여기에 나옵니다. 오래된 버전이나 tmux 안의 에이전트는 나오지 않을 수 있습니다.")),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always").children(rows))
      .when(collapsed, (el) =>
        el.child(
          h_flex()
            .h(28)
            .items_center()
            .justify_center()
            .child(
              div()
                .id("collapse")
                .text_size(13)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(toggleSidebar)
                .child("»"),
            ),
        ),
      );
  }
}
