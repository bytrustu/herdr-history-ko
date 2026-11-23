import Cocoa
import WebKit

// 문서 보기(doc-view)의 그림 그리기: HTML · SVG 파일 하나를 macOS 의 WebKit 으로 열어 페이지 전체를 세로 조각 PNG 로 찍는다.
// 창은 화면 밖에 두고 앱은 Dock 에 나오지 않는다(accessory). 키보드를 가져가지 않는다.
// 쓰는 법: render <html 파일> <출력 폴더> <폭(pt)> <읽어도 되는 폴더>
// 내는 것(한 줄 JSON): {"ok", "title", "width", "height", "tiles": [{"file", "w", "h", "pt"}]}. 조각은 2배 해상도.
// 25초 안에 끝나지 않으면 {"ok": false, "why": "slow"}.
let args = CommandLine.arguments
func finish(_ obj: [String: Any], _ code: Int32) -> Never {
  if let d = try? JSONSerialization.data(withJSONObject: obj), let s = String(data: d, encoding: .utf8) { print(s) }
  exit(code)
}
guard args.count >= 5 else { finish(["ok": false, "why": "args"], 2) }
let src = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2], isDirectory: true)
let width = CGFloat(Double(args[3]) ?? 1000)
let readDir = URL(fileURLWithPath: args[4], isDirectory: true)
let TILE: CGFloat = 1600
let MAXH: CGFloat = 60000
let SCALE: CGFloat = 2

final class Shooter: NSObject, WKNavigationDelegate {
  let web: WKWebView
  let window: NSWindow
  var tiles: [[String: Any]] = []
  var title = ""
  override init() {
    let cfg = WKWebViewConfiguration()
    web = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: 900), configuration: cfg)
    window = NSWindow(contentRect: NSRect(x: -40000, y: -40000, width: width, height: 900), styleMask: [.borderless], backing: .buffered, defer: false)
    super.init()
    window.isReleasedWhenClosed = false
    window.contentView = web
    window.orderBack(nil)
    web.navigationDelegate = self
  }
  func start() { web.loadFileURL(src, allowingReadAccessTo: readDir) }
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.measure(again: true) }
  }
  func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { finish(["ok": false, "why": "load"], 1) }
  func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { finish(["ok": false, "why": "load"], 1) }
  func measure(again: Bool) {
    let body = "if (document.fonts) { await document.fonts.ready; } return [Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0), document.title || ''];"
    web.callAsyncJavaScript(body, arguments: [:], in: nil, in: .page) { r in
      var h: CGFloat = 900
      if case .success(let v) = r, let a = v as? [Any] {
        if let n = a.first as? NSNumber { h = CGFloat(n.doubleValue) }
        if a.count > 1, let t = a[1] as? String { self.title = t }
      }
      h = max(200, min(MAXH, ceil(h)))
      self.window.setContentSize(NSSize(width: width, height: h))
      self.web.frame = NSRect(x: 0, y: 0, width: width, height: h)
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
        if again { self.measure(again: false) } else { self.shoot(h, 0, 0) }
      }
    }
  }
  func shoot(_ h: CGFloat, _ y: CGFloat, _ i: Int) {
    if y >= h {
      finish(["ok": true, "title": title, "width": Double(width), "height": Double(h), "backing": Double(window.backingScaleFactor), "tiles": tiles], 0)
    }
    let th = min(TILE, h - y)
    let cfg = WKSnapshotConfiguration()
    cfg.rect = CGRect(x: 0, y: y, width: width, height: th)
    cfg.snapshotWidth = NSNumber(value: Double(width * SCALE / max(1, window.backingScaleFactor)))
    cfg.afterScreenUpdates = true
    web.takeSnapshot(with: cfg) { image, _ in
      guard let img = image, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
            let png = rep.representation(using: .png, properties: [:]) else { finish(["ok": false, "why": "shot"], 1) }
      let name = "\(i).png"
      do { try png.write(to: out.appendingPathComponent(name)) } catch { finish(["ok": false, "why": "write"], 1) }
      self.tiles.append(["file": name, "w": rep.pixelsWide, "h": rep.pixelsHigh, "pt": Double(th)])
      self.shoot(h, y + th, i + 1)
    }
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let shooter = Shooter()
shooter.start()
DispatchQueue.main.asyncAfter(deadline: .now() + 25) { finish(["ok": false, "why": "slow"], 1) }
app.run()
