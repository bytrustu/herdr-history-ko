#!/usr/bin/env python3
# 문서 보기(doc-view)의 일꾼: 에이전트가 연 문서를 가져와 그림으로 그린다.
#   view.py <컴퓨터 또는 ""> <경로> <폭> [peek]
# peek 이면 가져오지 않고 전에 그린 것만 낸다(다이얼로그가 바로 보이도록. 없으면 {"ok": false, "why": "none"}).
# 1) 문서와, 그 문서가 같은 폴더 안에서 부르는 파일(그림 · CSS · 스크립트)을 request-log 의 reader.py --doc 로
#    가져온다(다른 컴퓨터면 reader.py --on <컴퓨터> --doc: herdr-core 로 그 컴퓨터에서 읽는다).
# 2) 이 컴퓨터의 ~/.cache/herdr-doc-view/docs/<문서>/ 에 펼친다.
# 3) HTML · SVG 는 render.swift(macOS 의 WebKit, 창 없이)로 페이지 전체를 세로 조각 PNG 로 찍는다. 그림 파일은
#    그대로 쓴다. 조각은 이 모드 폴더의 .shots/ 에 둔다(Herdr 의 image() 는 설정 폴더 안의 파일만 그린다).
# 가져온 내용과 폭이 같으면 다시 그리지 않는다. 내는 것: 한 줄 JSON(main.js 참고). 실패하면 {"ok": false, "why"}.
import base64, hashlib, json, os, re, shutil, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))
READER = os.path.join(APP, "mods", "request-log", "reader.py")
CACHE = os.path.join(os.path.expanduser("~"), ".cache", "herdr-doc-view")
SHOTS = os.path.join(HERE, ".shots")
KEEP = 16  # 남겨 두는 그림 묶음 수
RENDER_V = 2  # 그리는 방식이 바뀌면 올린다(전에 그린 것을 쓰지 않게)
CHARSET = re.compile(rb"<meta[^>]+charset|<\?xml[^>]+encoding", re.I)
IMAGES = (".png", ".jpg", ".jpeg", ".gif", ".webp")


def done(**kw):
    sys.stdout.write(json.dumps(kw, ensure_ascii=False))
    sys.exit(0)


def fetch(machine, path, known=None):
    cmd = [sys.executable, "-I", READER] + (["--on", machine] if machine else []) + ["--doc", path]
    if known:
        cmd += [str(known.get("mtime") or ""), str(known.get("size") or "")]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=90, stdin=subprocess.DEVNULL)
        got = json.loads(r.stdout.decode("utf-8", "replace") or "null")
    except subprocess.TimeoutExpired:
        return {"ok": False, "why": "slow"}
    except (OSError, ValueError):
        return {"ok": False, "why": "error"}
    return got if isinstance(got, dict) else {"ok": False, "why": "error"}


def renderer():
    # render.swift 를 한 번 빌드해 둔다(내용이 바뀌면 다시). Xcode 명령줄 도구가 없으면 None(설치 창을 띄우지 않는다).
    src = os.path.join(HERE, "render.swift")
    try:
        with open(src, "rb") as f:
            h = hashlib.sha1(f.read()).hexdigest()[:12]
    except OSError:
        return None
    bin_dir = os.path.join(CACHE, "bin")
    exe = os.path.join(bin_dir, "render-" + h)
    if os.access(exe, os.X_OK):
        return exe
    try:
        if subprocess.run(["xcode-select", "-p"], capture_output=True, timeout=10).returncode != 0:
            return None
        os.makedirs(bin_dir, exist_ok=True)
        tmp = "%s.%d.tmp" % (exe, os.getpid())
        r = subprocess.run(["xcrun", "swiftc", "-O", "-o", tmp, src], capture_output=True, timeout=300)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if r.returncode != 0 or not os.path.isfile(tmp):
        return None
    os.replace(tmp, exe)
    for old in os.listdir(bin_dir):
        if old.startswith("render-") and old != os.path.basename(exe):
            try:
                os.remove(os.path.join(bin_dir, old))
            except OSError:
                pass
    return exe


def image_size(p):
    try:
        out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", p], capture_output=True, text=True, timeout=20).stdout
        w = int(out.split("pixelWidth:")[1].split()[0])
        h = int(out.split("pixelHeight:")[1].split()[0])
        return w, h
    except (OSError, subprocess.TimeoutExpired, IndexError, ValueError):
        return None


def utf8(path):
    # 글자 인코딩을 적지 않은 HTML(메일 본문 조각 같은 것)은 WebKit 이 UTF-8 로 읽지 않아 한글이 깨진다.
    # UTF-8 로 읽히는 파일이면 사본에 <meta charset="utf-8"> 을 넣는다(doctype 뒤나 head 안, 없으면 맨 앞).
    try:
        with open(path, "rb") as f:
            data = f.read()
        if data.startswith(b"\xef\xbb\xbf") or CHARSET.search(data[:4096]):
            return
        data.decode("utf-8")
    except (OSError, UnicodeDecodeError):
        return
    tag = b'<meta charset="utf-8">'
    m = re.search(rb"<head[^>]*>", data[:4096], re.I) or re.search(rb"<!doctype[^>]*>", data[:4096], re.I)
    data = data[:m.end()] + tag + data[m.end():] if m else tag + data
    with open(path, "wb") as f:
        f.write(data)


def prune(keep):
    try:
        dirs = [os.path.join(SHOTS, d) for d in os.listdir(SHOTS)]
    except OSError:
        return
    now = time.time()
    for d in dirs:
        if d.endswith(".tmp") and now - os.path.getmtime(d) > 600:
            shutil.rmtree(d, ignore_errors=True)
    dirs = sorted((d for d in dirs if not d.endswith(".tmp") and os.path.isdir(d)), key=os.path.getmtime, reverse=True)
    for d in dirs[KEEP:]:
        if d != keep:
            shutil.rmtree(d, ignore_errors=True)


def last(key, width):
    # 이 문서를 이 폭으로 마지막에 그린 것(meta). 없으면 None.
    try:
        dirs = [os.path.join(SHOTS, d) for d in os.listdir(SHOTS) if d.startswith(key + "-") and not d.endswith(".tmp")]
    except OSError:
        return None
    for d in sorted(dirs, key=os.path.getmtime, reverse=True):
        try:
            with open(os.path.join(d, "meta.json"), encoding="utf-8") as f:
                meta = json.load(f)
        except (OSError, ValueError):
            continue
        if meta.get("v") == RENDER_V and (meta.get("kind") == "image" or meta.get("width") == width):
            return dict(meta, dir=d)
    return None


def peek(key, width):
    seen = last(key, width)
    if seen:
        seen.pop("dir", None)
        done(**seen)
    done(ok=False, why="none")


def main():
    machine, path, width, mode = (sys.argv[1:] + ["", "", "", ""])[:4]
    try:
        width = max(480, min(1600, int(float(width))))
    except ValueError:
        width = 1000
    key = hashlib.sha1((machine + "\0" + path).encode("utf-8", "replace")).hexdigest()[:12]
    if mode == "peek":
        peek(key, width)
    seen = last(key, width)
    got = fetch(machine, path, seen)
    if got.get("ok") and got.get("same") and seen:
        os.utime(seen.pop("dir"))
        done(**seen)  # 그대로다: 그려 둔 것을 쓴다
    if not got.get("ok"):
        done(ok=False, why=got.get("why") or "error")
    files = got.get("files") if isinstance(got.get("files"), dict) else {}
    name = os.path.basename(got.get("name") or path)
    if name not in files:
        done(ok=False, why="error")
    sig = hashlib.sha1(("%d|%d" % (RENDER_V, width)).encode())
    for k in sorted(files):
        sig.update(k.encode("utf-8", "replace") + b"\0" + str(files[k]).encode("ascii", "replace"))
    shot = os.path.join(SHOTS, key + "-" + sig.hexdigest()[:12])
    src_dir = os.path.join(CACHE, "docs", key)
    main_file = os.path.join(src_dir, name)
    try:
        with open(os.path.join(shot, "meta.json"), encoding="utf-8") as f:
            meta = json.load(f)
        if os.path.isfile(main_file):
            os.utime(shot)
            done(**meta)
    except (OSError, ValueError):
        pass
    # 펼치기: 문서 폴더 밖을 가리키는 이름은 버린다.
    shutil.rmtree(src_dir, ignore_errors=True)
    os.makedirs(src_dir, exist_ok=True)
    for rel, data in files.items():
        rel = os.path.normpath(str(rel))
        if rel.startswith("..") or os.path.isabs(rel):
            continue
        dest = os.path.join(src_dir, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        try:
            with open(dest, "wb") as f:
                f.write(base64.b64decode(data))
        except (OSError, ValueError):
            done(ok=False, why="error")
    tmp = "%s.%d.tmp" % (shot, os.getpid())
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    ext = os.path.splitext(name)[1].lower()
    if ext in (".html", ".htm"):
        utf8(main_file)
    title = ""
    if ext in IMAGES:
        size = image_size(main_file)
        if not size:
            done(ok=False, why="render")
        shutil.copyfile(main_file, os.path.join(tmp, "0" + ext))
        page_w, page_h = size
        tiles = [{"file": "0" + ext, "w": size[0], "h": size[1], "pt": size[1]}]
        kind = "image"
    else:
        exe = renderer()
        if not exe:
            done(ok=False, why="swift")
        try:
            r = subprocess.run([exe, main_file, tmp, str(width), src_dir], capture_output=True, timeout=60, stdin=subprocess.DEVNULL)
            res = json.loads((r.stdout.decode("utf-8", "replace").strip().splitlines() or ["null"])[-1])
        except (OSError, subprocess.TimeoutExpired, ValueError):
            res = None
        if not isinstance(res, dict) or not res.get("ok") or not res.get("tiles"):
            shutil.rmtree(tmp, ignore_errors=True)
            done(ok=False, why="render")
        title = res.get("title") or ""
        page_w, page_h, tiles, kind = res.get("width") or width, res.get("height") or 0, res["tiles"], "page"
    base = os.path.relpath(shot, APP)
    meta = {"ok": True, "v": RENDER_V, "kind": kind, "title": title.strip(), "name": name, "path": got.get("path") or path,
            "machine": machine or None, "mtime": got.get("mtime"), "size": got.get("size"), "skipped": got.get("skipped") or 0,
            "width": page_w, "height": page_h, "local": main_file,
            "tiles": [{"src": base + "/" + t["file"], "w": t["w"], "h": t["h"], "pt": t["pt"]} for t in tiles]}
    with open(os.path.join(tmp, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    shutil.rmtree(shot, ignore_errors=True)
    os.replace(tmp, shot)
    prune(shot)
    done(**meta)


main()
