// 문서 보기: 에이전트가 연 HTML 문서(SVG · 그림 파일도)를 Herdr 안에서 크게 본다.
// 히스토리(request-log)가 요청마다 에이전트가 연 문서를 기억한다: open 으로 연 것, 만들거나 고친 것, 답변에 적은 경로.
// 히스토리 머리의 「문서 N」이나 요청 창의 「문서」 단추가 이 모드를 다이얼로그로 연다:
//   openOverlay({ mod: "doc-view", kind: "dialog", props: { docs: [{ path, at, topic }], start, machine, browser } })
// 문서는 그 에이전트가 도는 컴퓨터에서 가져온다(machine: Herdr 에 추가한 컴퓨터 이름, 이 컴퓨터면 null).
// Herdr 모드에는 웹 화면을 넣을 수 없어서 view.py 가 macOS 의 WebKit 으로 페이지 전체를 그림으로 그린다.
// 그래서 링크 · 입력 같은 동작은 없다. 「브라우저로 열기」는 문서를 이 컴퓨터의 브라우저로 연다
// (다른 컴퓨터의 문서는 가져온 사본. props.browser: 앱 이름, 비우면 기본 브라우저).
// 한 번 그린 문서는 바로 보이고, 그사이 바뀌었는지 다시 가져와 확인한다. ←/→ 로 문서를 바꾸고 Esc 로 닫는다.
// 문서가 여럿이면 머리에 앞뒤 단추와 목록 단추가 있다(다이얼로그가 넓으면 목록을 펼쳐 둔다).

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { theme, exec, appHome, closeOverlay, props as blockProps, checking } from "herdr";

const WHY = {
  missing: "파일이 없습니다. 옮겨졌거나 지워졌을 수 있습니다.",
  path: "위치를 알 수 없는 문서입니다.",
  kind: "여기서 볼 수 없는 종류의 파일입니다.",
  big: "12MB 를 넘는 문서라 여기서는 열지 않습니다.",
  offline: "그 컴퓨터에 연결되지 않아 문서를 가져오지 못했습니다.",
  hc: "그 컴퓨터에 연결되지 않아 문서를 가져오지 못했습니다.",
  spawn: "그 컴퓨터에 python3 이 없어 문서를 가져오지 못했습니다.",
  slow: "문서를 가져오는 데 너무 오래 걸려 멈췄습니다.",
  swift: "문서를 그리려면 Xcode 명령줄 도구가 필요합니다. 터미널에서 xcode-select --install 로 설치하세요.",
  render: "문서를 그리지 못했습니다.",
  error: "문서를 열지 못했습니다.",
};
const LIST_W = 248; // 문서가 여럿일 때 왼쪽 목록의 폭
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
const ic = (name, size, color) => svg("mods/doc-view/icons/" + name + ".svg").size(size).flex_none().text_color(color);
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : d.getHours() + ":" + pad(d.getMinutes()); };
const base = (p) => String(p).split("/").pop();
const shortPath = (p) => String(p).replace(/^\/Users\/[^/]+\//, "~/");
// view.py 를 부르고 한 줄 JSON 을 받는다.
const py = (args, timeout) => exec("python3", args, { timeout })
  .then((r) => { try { return r?.code === 0 ? JSON.parse(r.stdout) : { ok: false, why: "error" }; } catch { return { ok: false, why: "error" }; } },
    () => ({ ok: false, why: "error" }));

export default class DocView extends View {
  init(_props, cx) {
    const g = blockProps() ?? {};
    this.docs = (Array.isArray(g.docs) ? g.docs : []).filter((d) => d && typeof d.path === "string" && d.path);
    this.i = Math.min(Math.max(0, Number(g.start) || 0), Math.max(0, this.docs.length - 1));
    this.machine = typeof g.machine === "string" && g.machine ? g.machine : null;
    this.browser = typeof g.browser === "string" ? g.browser : "";
    this.overlay = g.overlay ?? null;
    this.got = {}; // 경로 → view.py 가 낸 것(그린 그림이나 실패한 까닭)
    this.busy = {}; // 경로 → 가져와 그리는 중
    this.scrolls = Object.fromEntries(this.docs.map((d) => [d.path, ScrollHandle.new()])); // 경로 → 스크롤(문서마다 보던 자리를 둔다. 그리는 중에는 만들 수 없어 여기서)
    this.width = 0; // 다이얼로그 폭
    this.pageW = 0; // 문서를 그릴 폭(처음 열 때 한 번 정한다)
    this.listOpen = null; // 왼쪽 목록을 펼쳤나(처음 열 때 넓으면 펼친다)
    this.handle = cx.focus_handle();
    if (checking()) return;
    this.handle.focus();
  }


  // 지금 문서를 가져와 그린다. 전에 그린 것이 있으면 먼저 보이고, 다시 가져와 바뀌었으면 바꾼다.
  load(cx, again = false, k = this.i) {
    const d = this.docs[k];
    if (!d || !this.pageW || this.busy[d.path] || (this.got[d.path] && !again)) return;
    const path = d.path, args = ["-I", appHome() + "/mods/doc-view/view.py", this.machine ?? "", path, String(this.pageW)];
    this.busy[path] = true;
    cx.notify();
    cx.spawn(async (cx) => {
      if (!this.got[path]) {
        const seen = await py(args.concat("peek"), 15000);
        if (seen?.ok && !this.got[path]) { this.got[path] = seen; cx.notify(); }
      }
      const res = await py(args, 150000);
      this.busy[path] = false;
      // 보이던 그림은 그 컴퓨터가 잠깐 닿지 않아도 둔다. 파일이 없어졌으면 없어졌다고 보인다.
      const had = this.got[path];
      this.got[path] = res.ok || !had?.ok || res.why === "missing" ? res : { ...had, stale: res.why };
      cx.notify();
      this.ahead(cx);
    });
  }

  // 지금 문서 다음 둘을 미리 그려 둔다(넘기면 바로 보이게). 한 번에 하나씩.
  ahead(cx) {
    if (Object.values(this.busy).some(Boolean)) return;
    for (const k of [this.i + 1, this.i + 2]) {
      const d = this.docs[k];
      if (d && !this.got[d.path]) return this.load(cx, false, k);
    }
  }

  go(by, cx) {
    const n = this.i + by;
    if (n < 0 || n >= this.docs.length) return;
    this.i = n;
    this.load(cx);
    cx.notify();
  }

  // 이 컴퓨터의 브라우저로 연다. 다른 컴퓨터의 문서는 가져온 사본을 연다.
  openHere(res) {
    const target = this.machine ? res.local : res.path;
    if (target) exec("open", this.browser ? ["-a", this.browser, target] : [target]).catch(() => {});
  }

  render(cx) {
    const t = theme();
    const d = this.docs[this.i], res = d ? this.got[d.path] : null, busy = Boolean(d && this.busy[d.path]);
    const many = this.docs.length > 1, shown = Boolean(res?.ok), listed = many && Boolean(this.listOpen);
    const button = (id, name, text, click) => h_flex().id(id).h(30).px(12).gap(6).flex_none().items_center().rounded(15).bg(t.raised)
      .text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.selected)).on_click(click)
      .child(ic(name, 13, t.muted)).child(text);
    const round = (id, name, tip, click) => h_flex().id(id).size(30).flex_none().items_center().justify_center().rounded(15).cursor_pointer().tooltip(tip)
      .hover((s) => s.bg(t.hover)).on_click(click).child(ic(name, 15, t.muted));
    const badge = (name, spin) => h_flex().size(44).flex_none().items_center().justify_center().rounded(22).bg(t.raised)
      .child(spin ? ic(name, 22, t.muted).spin(900) : ic(name, 22, t.dim));
    const center = (kids) => v_flex().flex_1().min_w(0).min_h(0).px(32).pb(48).gap(12).items_center().justify_center().children(kids);
    const say = (text, color) => div().max_w(460).whitespace_normal().text_center().text_size(12.5).line_height("19px").text_color(color ?? t.muted).child(text);

    // 머리: 무슨 문서인가(문서 제목, 없으면 파일 이름), 어느 컴퓨터의 어디에 있나.
    const title = shown ? res.title || res.name : d ? base(d.path) : "문서";
    const where = d ? [this.machine ?? "이 컴퓨터", shortPath(d.path)].join(" · ") : "";
    const note = busy && shown ? "바뀌었는지 확인하는 중" : res?.stale ? "연결되지 않아 전에 그린 것을 보입니다"
      : shown && res.skipped > 0 ? "함께 쓰는 파일 " + res.skipped + "개는 가져오지 못했습니다" : "";
    const head = h_flex().flex_none().pl(20).pr(14).pt(16).pb(12).gap(12).items_center()
      .child(h_flex().size(34).flex_none().items_center().justify_center().rounded(10).bg(t.raised)
        .child(ic(d && IMAGE.test(d.path) ? "picture" : "doc", 17, t.muted)))
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(div().truncate().text_size(15).font_semibold().child(title))
        .child(h_flex().gap(5).min_w(0).items_center().text_size(11.5).text_color(t.dim)
          .when(Boolean(this.machine), (el) => el.child(ic("server", 12, t.dim)))
          .child(div().flex_1().min_w(0).truncate().child(where))
          .when(Boolean(note), (el) => el.child(h_flex().flex_none().gap(5).items_center()
            .when(busy, (el) => el.child(ic("ring", 11, t.dim).spin(900)))
            .child(note)))))
      .when(many, (el) => el.child(h_flex().flex_none().gap(2).items_center()
        .child(round("doc-prev", "chevron-left", "이전 문서 (←)", (_e, cx) => this.go(-1, cx)))
        .child(div().flex_none().px(2).text_size(11.5).text_color(t.muted).child((this.i + 1) + " / " + this.docs.length))
        .child(round("doc-next", "chevron-right", "다음 문서 (→)", (_e, cx) => this.go(1, cx)))
        .child(h_flex().id("doc-list-toggle").size(30).flex_none().items_center().justify_center().rounded(15).cursor_pointer()
          .tooltip(listed ? "목록 접기" : "목록 펼치기").when(listed, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { this.listOpen = !this.listOpen; cx.notify(); })
          .child(ic("list", 15, listed ? t.foreground : t.muted)))))
      .when(shown, (el) => el.child(button("doc-open", "external", "브라우저로 열기", () => this.openHere(res))))
      .when(Boolean(d), (el) => el.child(round("doc-reload", "reload", "다시 불러오기", (_e, cx) => this.load(cx, true))))
      .child(round("doc-close", "x", "닫기 (Esc)", () => { if (this.overlay) closeOverlay(this.overlay); }));

    // 왼쪽 목록(문서가 여럿일 때): 최근 것부터. 파일 이름, 연 시각과 그 요청의 제목.
    const row = (doc, k) => {
      const on = k === this.i;
      return h_flex().id("doc-" + k).px(10).py(8).gap(10).items_start().rounded(9).cursor_pointer()
        .when(on, (el) => el.bg(t.selected)).when(!on, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click((_e, cx) => { this.i = k; this.load(cx); cx.notify(); })
        .child(div().pt(1).child(ic(IMAGE.test(doc.path) ? "picture" : "doc", 15, on ? t.foreground : t.muted)))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(div().truncate().text_size(12.5).font_medium().text_color(on ? t.foreground : t.muted).child(base(doc.path)))
          .child(div().truncate().text_size(11).text_color(t.dim).child([hhmm(doc.at), doc.topic].filter(Boolean).join(" · "))));
    };
    const list = v_flex().id("doc-list").w(LIST_W).flex_none().min_h(0).overflow_y_scrollbar().pl(12).pr(8).pb(12).gap(2)
      .children(this.docs.map(row));

    // 본문: 그린 페이지(흰 종이)를 폭에 맞춰 보인다. 그 전에는 가져오는 중, 실패하면 까닭.
    let body;
    if (!d) body = center([badge("doc"), say("이 대화에서 에이전트가 연 문서가 없습니다.")]);
    else if (shown) {
      const avail = Math.max(240, this.width - (listed ? LIST_W : 12) - 52);
      const w = Math.min(avail, res.width), k = w / res.width;
      body = v_flex().id("doc-page-" + this.i).track_scroll(this.scrolls[d.path]).flex_1().min_w(0).min_h(0).overflow_y_scrollbar()
        .ml(listed ? 0 : 12).mr(12).mb(12).py(16).items_center().rounded(10).bg(t.raised)
        .child(v_flex().flex_none().w(w).rounded(4).overflow_hidden().bg("#ffffff")
          .children(res.tiles.map((x) => image(x.src).w(w).h(x.pt * k).flex_none())));
    } else if (res) body = center([badge("alert"), say(WHY[res.why] ?? WHY.error, t.foreground), say(shortPath(d.path), t.dim),
      button("doc-retry", "reload", "다시 해 보기", (_e, cx) => this.load(cx, true))]);
    else body = center([badge("ring", true), say("문서를 가져와 그리는 중입니다."),
      this.machine ? say(this.machine + " 에 있는 문서라 몇 초 걸립니다.", t.dim) : div()]);

    return v_flex().id("doc-view").track_focus(this.handle).size_full().min_h(0).bg(t.popover).text_color(t.foreground).text_size(13)
      .on_size_change((size, cx) => {
        if (Math.abs(size.width - this.width) <= 1) return;
        this.width = size.width;
        if (!this.pageW) {
          this.listOpen = size.width >= 1320;
          this.pageW = Math.round(Math.max(640, Math.min(1280, size.width - (many && this.listOpen ? LIST_W : 12) - 52)) / 20) * 20;
          this.load(cx);
        }
        cx.notify();
      })
      .on_key_down((e, cx) => {
        if (e.key === "left") this.go(-1, cx);
        else if (e.key === "right") this.go(1, cx);
        else return;
        cx.stop_propagation();
      })
      .child(head)
      .child(h_flex().flex_1().min_h(0).items_stretch().when(listed, (el) => el.child(list)).child(body));
  }
}
