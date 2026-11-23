#!/usr/bin/env python3
# 에이전트 다시 열기(한글 사이드바).
#
# 재부팅 · 로그아웃 · 코어 재시작이 지나가면 Herdr 의 터미널은 같은 주소, 같은 폴더의 셸로 돌아온다.
# 그 안에서 돌던 에이전트는 다시 뜨지 않는다(Herdr 는 처음 명령을 다시 돌리지 않는다).
# 이 도구는 터미널마다 돌던 에이전트의 대화를 적어 두었다가, 셸만 남은 터미널에 그 대화를 이어 여는
# 명령을 보낸다: Claude Code 는 claude --resume <id>, Codex 는 codex resume <id>, Antigravity 는
# agy --conversation <id>. 명령은 그 터미널의 셸에 입력하므로 셸에 둔 별칭 · 함수(기본 옵션)가 그대로 붙는다.
#
#   revive.py scan [--now]      터미널을 살펴 기록을 고치고 다시 열 것을 낸다(40초 안에 살폈으면 기록만 읽는다)
#   revive.py restore [주소...]  다시 열 것(또는 고른 주소)에 명령을 보낸다
#   revive.py dismiss           지금 다시 열 것을 이번에는 넘긴다
#   revive.py show              기록 전체
#   revive.py probe <base64>    (안에서 쓴다) 이 컴퓨터에서 프로세스가 쓰는 대화를 찾는다
#
# 다시 열 것: 기록에 에이전트가 있던 터미널이 지금 셸뿐이고, 그 셸이 기록 때와 다른 프로세스일 때
# (코어가 새로 띄운 셸). 같은 셸에서 에이전트만 끝났으면 사람이 닫은 것이라 기록을 지운다.
# 기록: ~/.local/state/herdr-revive/<HC_SESSION 또는 default>.json

import base64
import collections
import concurrent.futures
import fcntl
import glob
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time

os.environ["PATH"] = os.environ.get("PATH", "") + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
HOME = os.path.expanduser("~")
APPS = {"claude-code": "claude", "codex": "codex", "antigravity": "agy"}
SESSION = os.environ.get("HC_SESSION") or "default"
STATE_DIR = os.path.join(os.environ.get("XDG_STATE_HOME") or os.path.join(HOME, ".local", "state"), "herdr-revive")
STATE = os.path.join(STATE_DIR, re.sub(r"[^A-Za-z0-9_.-]", "_", SESSION) + ".json")
FRESH = 40 * 1000          # 이만큼 안에 살폈으면 다시 살피지 않는다
GONE = 10 * 60 * 1000      # 터미널이 보이지 않은 지 이만큼 지나야 기록을 지운다
RESENT = 5 * 60 * 1000     # 명령을 보낸 뒤 이만큼은 다시 열 것으로 내놓지 않는다
UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

# 이어 열 때 살려 두는 옵션(값을 받는 것 · 받지 않는 것). 나머지(첫 프롬프트, --resume 등)는 버린다.
# 셸 함수가 스스로 붙이는 옵션(claude 의 --settings, codex 의 --dangerously-bypass-hook-trust)은
# 두 번 붙지 않게 버린다.
KEEP = {
    "claude": ({"--model", "--effort", "--permission-mode", "--setting-sources", "--agent", "--fallback-model"},
               {"--dangerously-skip-permissions", "--safe-mode", "--chrome", "--ide"}),
    "codex": ({"-m", "--model", "-c", "--config", "-p", "--profile", "-s", "--sandbox", "-a", "--ask-for-approval", "--enable", "--disable"},
              {"--dangerously-bypass-approvals-and-sandbox", "--no-daemon", "--search", "--full-auto"}),
    "agy": ({"--model", "--effort", "--mode", "--agent", "--project"},
            {"--dangerously-skip-permissions"}),
}


def ms():
    return int(time.time() * 1000)


def run(argv, timeout=10, feed=None):
    try:
        r = subprocess.run(argv, capture_output=True, timeout=timeout, input=feed,
                           stdin=None if feed is not None else subprocess.DEVNULL)
        return r.returncode, r.stdout.decode("utf-8", "replace")
    except (OSError, subprocess.TimeoutExpired):
        return None, ""


def hc_bin():
    for c in (shutil.which("hc"), os.path.join(HOME, ".local/bin/hc"), "/opt/homebrew/bin/hc", "/usr/local/bin/hc"):
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def hc_json(args, timeout=10):
    hc = hc_bin()
    if not hc:
        return None
    code, out = run([hc] + args + ["--json"], timeout)
    if code != 0:
        return None
    try:
        return json.loads(out)
    except ValueError:
        return None


# ---- 이 컴퓨터에서: 프로세스가 쓰는 대화

def tree(pid):
    # pid 와 그 아래 프로세스들(에이전트가 감싸는 프로그램 아래에서 돌 수 있다).
    _, out = run(["ps", "-axo", "pid=,ppid="])
    kids = collections.defaultdict(list)
    for line in out.split("\n"):
        p = line.split()
        if len(p) == 2 and p[0].isdigit() and p[1].isdigit():
            kids[int(p[1])].append(int(p[0]))
    seen, todo = [], [int(pid)]
    while todo and len(seen) < 64:
        p = todo.pop(0)
        if p not in seen:
            seen.append(p)
            todo.extend(kids.get(p, []))
    return seen


def open_files(pids, what="0-999"):
    if not pids:
        return []
    _, out = run(["lsof", "-a", "-p", ",".join(str(p) for p in pids), "-d", what, "-Fn"], 12)
    return [line[1:] for line in out.split("\n") if line.startswith("n") and len(line) > 1]


def slug(cwd):
    return re.sub(r"[^A-Za-z0-9]", "-", cwd)


def find_claude(pids):
    best = None
    for base in sorted(glob.glob(os.path.join(HOME, ".claude*"))):
        if not os.path.isdir(os.path.join(base, "sessions")):
            continue
        for pid in pids:
            try:
                with open(os.path.join(base, "sessions", "%d.json" % pid), encoding="utf-8") as fh:
                    s = json.load(fh)
            except (OSError, ValueError):
                continue
            if not isinstance(s, dict) or not s.get("sessionId"):
                continue
            key = (s.get("kind") != "interactive", s.get("startedAt") or 0)
            if best is None or key < best[0]:
                best = (key, s, base)
    if best is None:
        return {"why": "no-session"}
    _, s, base = best
    sid, cwd = s["sessionId"], s.get("cwd") or ""
    p = os.path.join(base, "projects", slug(cwd), sid + ".jsonl") if cwd else ""
    if not (p and os.path.isfile(p)) and not glob.glob(os.path.join(base, "projects", "*", sid + ".jsonl")):
        return {"why": "empty"}  # 아직 아무것도 보내지 않은 대화: 이어 열 것이 없다
    env = {} if os.path.normpath(base) == os.path.join(HOME, ".claude") else {"CLAUDE_CONFIG_DIR": base}
    return {"id": sid, "env": env, "cwd": cwd}


def rollouts(pids):
    return [p for p in open_files(pids) if p.endswith(".jsonl") and "/sessions/" in p and os.path.basename(p).startswith("rollout-")]


def codex_cwds(path):
    span = 4 * 1024 * 1024
    try:
        with open(path, "rb") as f:
            head = f.readline(span)
            f.seek(0, 2)
            f.seek(max(0, f.tell() - span))
            tail = f.read()
    except OSError:
        return set()
    found = set()
    for raw in [head] + [l for l in tail.split(b"\n") if b'"type":"turn_context"' in l[:160]][-1:]:
        try:
            e = json.loads(raw.decode("utf-8", "replace"))
        except ValueError:
            continue
        cwd = e.get("payload", {}).get("cwd") if isinstance(e, dict) and isinstance(e.get("payload"), dict) else None
        if isinstance(cwd, str) and cwd:
            found.add(os.path.normpath(cwd))
    return found


def codex_title(path):
    m = re.search("(" + UUID + r")\.jsonl$", path)
    if not m or "/sessions/" not in path:
        return None
    name = None
    try:
        with open(os.path.join(path.split("/sessions/")[0], "session_index.jsonl"), encoding="utf-8", errors="replace") as f:
            for line in f:
                if m.group(1) in line:
                    try:
                        name = json.loads(line).get("thread_name") or name
                    except ValueError:
                        pass
    except OSError:
        pass
    return name


def codex_path(pids, title):
    mine = rollouts(pids)
    if mine:
        return mine[0], ""
    # 백그라운드 서버(codex app-server)에 붙은 codex: 대화 파일은 서버가 열어 둔다. 서버의 대화 가운데
    # 일하는 폴더가 같은 것 하나, 여럿이면 터미널 제목에 이름이 적힌 것 하나. 못 가리면 고르지 않는다.
    cwds = set(os.path.normpath(c) for c in open_files(pids, "cwd"))
    if not cwds:
        return None, "no-cwd"
    _, out = run(["ps", "-ww", "-axo", "pid=,command="])
    served = []
    for line in out.split("\n"):
        m = re.match(r"\s*(\d+)\s+(.*)", line)
        if m and "codex" in m.group(2) and " app-server" in m.group(2):
            for p in rollouts([int(m.group(1))]):
                if p not in served:
                    served.append(p)
    hits = [p for p in served if codex_cwds(p) & cwds]
    if len(hits) == 1:
        return hits[0], ""
    if len(hits) > 1:
        parts = [s.strip() for s in re.sub(r"^[^\w\[(\"']+", "", title or "").split(" | ") if s.strip()]
        named = [p for p in hits if codex_title(p) and codex_title(p) in parts]
        if len(named) == 1:
            return named[0], ""
        return None, "vague"
    return None, "no-rollout"


def find_codex(pids, title):
    path, why = codex_path(pids, title)
    m = re.search("(" + UUID + r")\.jsonl$", path or "")
    if not m:
        return {"why": why or "no-rollout"}
    base = path.split("/sessions/")[0]
    env = {} if os.path.normpath(base) == os.path.join(HOME, ".codex") else {"CODEX_HOME": base}
    return {"id": m.group(1), "env": env}


def find_agy(pids):
    found = []
    for lock in open_files(pids):
        if lock.endswith(".lock") and os.path.basename(os.path.dirname(lock)) == "presence":
            cid = os.path.basename(lock)[:-5]
            db = os.path.join(os.path.dirname(os.path.dirname(lock)), "conversations", cid + ".db")
            if re.fullmatch(UUID, cid) and os.path.isfile(db) and cid not in found:
                found.append(cid)
    if len(found) != 1:
        return {"why": "vague" if found else "no-conversation"}
    return {"id": found[0], "env": {}}


def probe(items):
    out = []
    for it in items:
        try:
            pids = tree(it["pid"]) if it.get("pid") else []
            if not pids:
                out.append({"why": "no-process"})
            elif it["app"] == "claude":
                out.append(find_claude(pids))
            elif it["app"] == "codex":
                out.append(find_codex(pids, it.get("title") or ""))
            else:
                out.append(find_agy(pids))
        except Exception as e:  # 한 터미널이 틀려도 나머지는 읽는다
            out.append({"why": "error: %s" % e})
    return out


def far_probe(machine, items):
    # 그 컴퓨터에서 이 파일의 probe 를 돌린다. 닿지 않으면 None.
    hc = hc_bin()
    try:
        with open(os.path.abspath(__file__), "rb") as f:
            src = f.read()
    except OSError:
        return None
    payload = base64.b64encode(json.dumps(items).encode("utf-8")).decode("ascii")
    code, out = run([hc, "exec", "--json", "--on", machine, "--timeout", "40", "-i", "--", "python3", "-I", "-", "probe", payload], 50, src)
    try:
        r = json.loads(out)
        got = json.loads(base64.b64decode(r.get("stdout") or "").decode("utf-8", "replace"))
    except (ValueError, TypeError, AttributeError):
        return None
    return got if isinstance(got, list) and len(got) == len(items) else None


# ---- 기록

class Locked:
    def __enter__(self):
        os.makedirs(STATE_DIR, exist_ok=True)
        self.fh = open(STATE + ".lock", "w")
        fcntl.flock(self.fh, fcntl.LOCK_EX)
        return self

    def __exit__(self, *a):
        fcntl.flock(self.fh, fcntl.LOCK_UN)
        self.fh.close()


def load():
    try:
        with open(STATE, encoding="utf-8") as f:
            st = json.load(f)
        if isinstance(st, dict) and isinstance(st.get("terms"), dict):
            return st
    except (OSError, ValueError):
        pass
    return {"terms": {}, "scanned": 0}


def save(st):
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=1)
    os.replace(tmp, STATE)


def machine_of(address):
    return address.rsplit("/", 1)[0] if "/" in address else None


def flags_of(app, argv):
    vals, bools = KEEP[app]
    out, i = [], 1
    while i < len(argv):
        a = str(argv[i])
        name, eq, val = a.partition("=")
        if name in vals:
            if eq:
                out.append(a)
            elif i + 1 < len(argv):
                out += [a, str(argv[i + 1])]
                i += 1
        elif a in bools:
            out.append(a)
        i += 1
    return out


def scan(force=False):
    now = ms()
    st = load()
    if not force and now - st.get("scanned", 0) < FRESH:
        return st
    ls = hc_json(["ls"])
    if not isinstance(ls, dict):
        return st  # 코어가 아직 없다: 기록은 그대로
    up = {m.get("name") for m in (hc_json(["machine", "ls"]) or {}).get("machines", []) if m.get("state") == "connected"}
    terms = {t["address"]: t for t in ls.get("terminals", []) if t.get("state") == "live" and t.get("address")}
    recs = st.setdefault("terms", {})
    look = [a for a, t in terms.items() if (t.get("agent") in APPS or a in recs) and (machine_of(a) is None or machine_of(a) in up)]
    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        gets = dict(zip(look, pool.map(lambda a: hc_json(["get", a]), look)))
    want = collections.defaultdict(list)
    for a in look:
        g, t = gets.get(a), terms[a]
        if not isinstance(g, dict):
            continue
        r = recs.get(a)
        if t.get("agent") in APPS:
            fg = g.get("foreground") or {}
            want[machine_of(a)].append({"address": a, "pid": fg.get("pid"), "app": APPS[t["agent"]], "cwd": fg.get("cwd") or t.get("cwd") or "",
                                        "title": g.get("title") or "", "argv": fg.get("argv") or [], "tpid": g.get("pid"), "where": t.get("where") or "",
                                        "name": g.get("name") or ""})
        elif r and not r.get("lost"):
            if g.get("pid") != r.get("tpid"):
                r["lost"] = now  # 새 셸로 돌아왔다(재부팅 · 로그아웃 · 코어 재시작)
            else:
                del recs[a]  # 같은 셸에서 에이전트만 끝났다: 사람이 닫은 것
        if r and r.get("gone"):
            r.pop("gone", None)
    for m, items in want.items():
        got = probe(items) if m is None else far_probe(m, items)
        if got is None:
            continue  # 그 컴퓨터에 닿지 않았다: 기록은 그대로
        for it, f in zip(items, got):
            a, old = it["address"], recs.get(it["address"])
            if f.get("id"):
                recs[a] = {"app": it["app"], "id": f["id"], "env": f.get("env") or {}, "cwd": f.get("cwd") or it["cwd"],
                           "flags": flags_of(it["app"], it["argv"]), "pid": it["pid"], "tpid": it["tpid"],
                           "where": it["where"], "name": it["name"], "seen": now}
            elif old and old.get("pid") == it["pid"] and not old.get("lost"):
                old["seen"], old["tpid"] = now, it["tpid"]  # 잠깐 못 가렸다: 전에 찾은 대화를 둔다
            else:
                recs.pop(a, None)  # 다른 에이전트가 떴는데 이어 열 대화가 없다
    for a, r in list(recs.items()):
        m = machine_of(a)
        if a in terms or (m is not None and m not in up):
            continue
        r.setdefault("gone", now)
        if now - r["gone"] > GONE:
            del recs[a]  # 닫은 터미널
    st["scanned"] = now
    st["terms"] = recs
    save(st)
    return st


def lost_of(st, now=None):
    now = now or ms()
    out = []
    for a, r in st.get("terms", {}).items():
        if r.get("lost") and not r.get("dismissed") and not r.get("gone") and now - (r.get("sent") or 0) > RESENT:
            out.append({"address": a, "app": r["app"], "where": r.get("where") or "", "name": r.get("name") or "", "cwd": r.get("cwd") or "", "lost": r["lost"]})
    out.sort(key=lambda x: x["address"])
    return out


def command(r, here):
    app, rid = r["app"], r["id"]
    if app == "claude":
        argv = ["claude"] + r.get("flags", []) + ["--resume", rid]
    elif app == "codex":
        argv = ["codex"] + r.get("flags", []) + ["resume", rid]
    else:
        argv = ["agy"] + r.get("flags", []) + ["--conversation", rid]
    cmd = " ".join(shlex.quote(str(a)) for a in argv)
    env = {k: v for k, v in (r.get("env") or {}).items() if k in ("CLAUDE_CONFIG_DIR", "CODEX_HOME") and v}
    if env:
        cmd = " ".join("%s=%s" % (k, shlex.quote(v)) for k, v in env.items()) + " " + cmd
    cwd = r.get("cwd") or ""
    if cwd and os.path.normpath(cwd) != os.path.normpath(here or cwd):
        cmd = "cd " + shlex.quote(cwd) + " && " + cmd
    return cmd


def restore(only):
    with Locked():
        st = scan(force=True)
        terms = {t["address"]: t for t in (hc_json(["ls"]) or {}).get("terminals", [])}
        todo = [x["address"] for x in lost_of(st)] if not only else [a for a in only if a in st["terms"] and st["terms"][a].get("lost")]
        todo = [a for a in todo if a in terms and terms[a].get("agent") not in APPS]
        now = ms()
        for a in todo:
            st["terms"][a]["sent"] = now
        save(st)
    hc = hc_bin()

    def send(a):
        cmd = command(st["terms"][a], terms[a].get("cwd"))
        code, _ = run([hc, "send", a, cmd], 20)
        return {"address": a, "ok": code == 0, "command": cmd}

    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        done = list(pool.map(send, todo))
    return {"sent": done}


def main():
    args = sys.argv[1:]
    what = args[0] if args else "scan"
    if what == "probe":
        items = json.loads(base64.b64decode(args[1]).decode("utf-8"))
        sys.stdout.write(json.dumps(probe(items)))
        return
    if what == "scan":
        with Locked():
            st = scan(force="--now" in args)
        sys.stdout.write(json.dumps({"lost": lost_of(st), "at": st.get("scanned", 0)}, ensure_ascii=False))
    elif what == "restore":
        sys.stdout.write(json.dumps(restore(args[1:]), ensure_ascii=False))
    elif what == "dismiss":
        with Locked():
            st = load()
            now = ms()
            for x in lost_of(st, now):
                st["terms"][x["address"]]["dismissed"] = now
            save(st)
        sys.stdout.write(json.dumps({"lost": []}))
    elif what == "show":
        sys.stdout.write(json.dumps(load(), ensure_ascii=False, indent=1))
    else:
        sys.stderr.write("revive.py scan [--now] | restore [주소...] | dismiss | show\n")
        sys.exit(2)


if __name__ == "__main__":
    main()
