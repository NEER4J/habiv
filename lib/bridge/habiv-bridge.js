/* Habiv bridge SDK. Injected into every game at ingest; also callable explicitly.
 * Game side is nothing but parent.postMessage({ v: 1, type, ... }, PARENT_ORIGIN).
 * Inert unless the page is embedded by habiv.com (or a preview / localhost origin). */
(function () {
  if (typeof window === "undefined" || window.Habiv) return;

  var ALLOWED = /^(https:\/\/([a-z0-9-]+\.)?habiv\.com|https:\/\/[a-z0-9-]+\.vercel\.app|http:\/\/localhost(:\d+)?)$/i;

  function originOf(u) {
    try { return new URL(u).origin; } catch (e) { return null; }
  }
  var params = new URLSearchParams(window.location.search);
  var parentOrigin = originOf(params.get("origin") || "") || originOf(document.referrer || "");
  var enabled = !!(parentOrigin && ALLOWED.test(parentOrigin) && window.parent && window.parent !== window);
  var mode = params.get("mode") || "play";

  var listeners = {};
  var pendingLoads = {};
  var reqSeq = 0;
  var readySent = false;
  var player = null;

  function post(type, payload) {
    if (!enabled) return;
    var msg = { v: 1, type: type, t: Date.now() };
    if (payload) for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload, k)) msg[k] = payload[k];
    try { window.parent.postMessage(msg, parentOrigin); } catch (e) { /* ignore */ }
  }
  function emit(type, msg) {
    var fns = listeners[type] || [];
    for (var i = 0; i < fns.length; i++) { try { fns[i](msg); } catch (e) { /* ignore */ } }
  }

  window.addEventListener("message", function (ev) {
    if (!enabled || ev.origin !== parentOrigin || !ev.data || ev.data.v !== 1) return;
    var d = ev.data;
    if (d.type === "init") { player = { id: d.player_id || null, handle: d.handle || null, runToken: d.run_token || null, muted: !!d.muted, locale: d.locale || "en" }; }
    if (d.type === "load_result" && pendingLoads[d.req_id]) { pendingLoads[d.req_id](d.value === undefined ? null : d.value); delete pendingLoads[d.req_id]; return; }
    emit(d.type, d);
  });

  var Habiv = {
    enabled: enabled,
    mode: mode,
    get player() { return player; },
    on: function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); return Habiv; },
    off: function (type, fn) { listeners[type] = (listeners[type] || []).filter(function (f) { return f !== fn; }); return Habiv; },
    ready: function () { if (readySent) return; readySent = true; post("ready"); },
    runStart: function (o) { post("run_start", { level: o && o.level != null ? String(o.level) : undefined }); },
    runEnd: function (o) {
      o = o || {};
      post("run_end", { outcome: o.outcome === "complete" || o.outcome === "fail" ? o.outcome : "quit", score: num(o.score), level: str(o.level), progress_pct: num(o.progress_pct) });
    },
    levelStart: function (o) { post("level_start", { level: str(o && o.level) }); },
    levelComplete: function (o) { post("level_complete", { level: str(o && o.level), score: num(o && o.score) }); },
    levelFail: function (o) { post("level_fail", { level: str(o && o.level), score: num(o && o.score) }); },
    beatGame: function () { post("beat_game"); },
    scoreSubmit: function (o) { post("score_submit", { board: str(o && o.board) || "main", value: num(o && (o.value != null ? o.value : o.score)) }); },
    gameplayStart: function () { post("gameplay_start"); },
    gameplayStop: function () { post("gameplay_stop"); },
    happytime: function () { post("happytime"); },
    save: function (o) { post("save", { key: str(o && o.key) || "default", value: o && o.value }); },
    load: function (o) {
      var id = String(++reqSeq);
      return new Promise(function (resolve) {
        if (!enabled) return resolve(null);
        pendingLoads[id] = resolve;
        post("load", { key: str(o && o.key) || "default", req_id: id });
        setTimeout(function () { if (pendingLoads[id]) { delete pendingLoads[id]; resolve(null); } }, 5000);
      });
    },
    design: function (o) { post("design", { key: str(o && o.key), value: o && o.value }); },
    error: function (message) { post("error", { message: String(message).slice(0, 500) }); }
  };

  function num(v) { var n = Number(v); return isFinite(n) ? n : undefined; }
  function str(v) { return v == null ? undefined : String(v).slice(0, 64); }

  // Browsers chain unconsumed keyboard scrolling to the parent frame, so arrows / Space in a game
  // that can't scroll itself would scroll the Habiv page. Bubble phase: the game's handlers run first.
  var SCROLL_KEYS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, " ": 1, PageUp: 1, PageDown: 1, Home: 1, End: 1 };
  window.addEventListener("keydown", function (e) {
    if (!enabled || e.defaultPrevented || !SCROLL_KEYS[e.key]) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))) return;
    var se = document.scrollingElement;
    if (se && se.scrollHeight > se.clientHeight + 1) return;
    e.preventDefault();
  });

  window.addEventListener("error", function (e) { if (e && e.message) post("error", { message: String(e.message).slice(0, 500) }); });
  window.addEventListener("load", function () { setTimeout(function () { if (!readySent) Habiv.ready(); }, 100); });

  Object.defineProperty(window, "Habiv", { value: Habiv, writable: false, configurable: false });
  window.habiv = Habiv;
})();
