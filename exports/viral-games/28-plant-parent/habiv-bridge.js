/* Habiv bridge SDK. Injected into every game at ingest; also callable explicitly.
 * Game side is nothing but parent.postMessage({ v: 1, type, ... }, PARENT_ORIGIN).
 * Inert unless the page is embedded by habiv.com (or a preview / localhost origin). */
(function () {
  if (typeof window === "undefined" || window.Habiv) return;

  var ALLOWED = /^(https:\/\/([a-z0-9-]+\.)?habiv\.com|https:\/\/[a-z0-9-]+\.vercel\.app|https:\/\/(?:[a-z0-9-]+\.)*chatgpt\.site|http:\/\/localhost(:\d+)?)$/i;

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

  // ——— Sound off ———
  // The player's Sound off can't reach into this cross-origin frame, and most games never listen
  // for "mute", so the bridge enforces it. Every AudioContext plays through a gain node the bridge
  // owns (ctx.destination returns it), and media elements are held muted while sound is off. The
  // contexts keep running, so games timed on the audio clock carry on silently. The bridge loads
  // before the game's first script, so these hooks are in place before any sound is made.
  var soundMuted = params.get("muted") === "1";
  var gains = [];
  var media = new Set();
  var mediaProto = window.HTMLMediaElement && HTMLMediaElement.prototype;
  var mutedDesc = mediaProto && Object.getOwnPropertyDescriptor(mediaProto, "muted");

  function applyMedia(el) {
    // __hvWant is the game's own muted setting, restored when sound comes back on.
    if (el.__hvWant === undefined) el.__hvWant = mutedDesc.get.call(el);
    mutedDesc.set.call(el, soundMuted || el.__hvWant);
  }
  function trackMedia(el) {
    if (!(el instanceof HTMLMediaElement) || media.has(el)) return;
    media.add(el);
    // A fire-and-forget `new Audio(src).play()` shouldn't be kept alive after it ends.
    el.addEventListener("ended", function () { if (!el.isConnected && !el.loop) media.delete(el); });
    applyMedia(el);
  }
  function setSoundMuted(on) {
    soundMuted = !!on;
    for (var i = 0; i < gains.length; i++) { try { gains[i].gain.value = soundMuted ? 0 : 1; } catch (e) { /* closed */ } }
    if (!mutedDesc) return;
    var els = document.querySelectorAll("audio,video");
    for (var j = 0; j < els.length; j++) trackMedia(els[j]);
    media.forEach(applyMedia);
  }

  if (enabled && mutedDesc && mutedDesc.get && mutedDesc.set) {
    Object.defineProperty(mediaProto, "muted", {
      configurable: true,
      enumerable: mutedDesc.enumerable,
      get: function () { return this.__hvWant !== undefined ? this.__hvWant : mutedDesc.get.call(this); },
      set: function (v) { this.__hvWant = !!v; trackMedia(this); mutedDesc.set.call(this, soundMuted || !!v); }
    });
    var mediaPlay = mediaProto.play;
    mediaProto.play = function () { trackMedia(this); return mediaPlay.apply(this, arguments); };
    // Elements with the autoplay attribute start without play() being called.
    document.addEventListener("play", function (e) { trackMedia(e.target); }, true);
  } else {
    mutedDesc = null;
  }

  var AC = window.AudioContext || window.webkitAudioContext;
  var acProto = window.BaseAudioContext ? window.BaseAudioContext.prototype : AC && AC.prototype;
  var destDesc = acProto && Object.getOwnPropertyDescriptor(acProto, "destination");
  if (enabled && AC && destDesc && destDesc.get) {
    Object.defineProperty(acProto, "destination", {
      configurable: true,
      enumerable: destDesc.enumerable,
      get: function () {
        var real = destDesc.get.call(this);
        // OfflineAudioContext renders buffers the game plays later: leave it alone.
        if (!(this instanceof AC)) return real;
        if (!this.__hvGain) {
          try {
            var g = this.createGain();
            g.connect(real);
            g.gain.value = soundMuted ? 0 : 1;
            try { Object.defineProperty(g, "maxChannelCount", { get: function () { return real.maxChannelCount; } }); } catch (e) { /* ignore */ }
            this.__hvGain = g;
            gains.push(g);
          } catch (e) {
            return real;
          }
        }
        return this.__hvGain;
      }
    });
  }

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
    if (d.type === "init") { player = { id: d.player_id || null, handle: d.handle || null, runToken: d.run_token || null, muted: !!d.muted, locale: d.locale || "en" }; setSoundMuted(d.muted); }
    if (d.type === "mute") setSoundMuted(d.on);
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
      // The end screen usually appears now, often taller than the play area.
      scheduleFit(700);
    },
    levelStart: function (o) { post("level_start", { level: str(o && o.level) }); },
    levelComplete: function (o) { post("level_complete", { level: str(o && o.level), score: num(o && o.score) }); },
    levelFail: function (o) { post("level_fail", { level: str(o && o.level), score: num(o && o.score) }); },
    beatGame: function () { post("beat_game"); },
    scoreSubmit: function (o) {
      // Games written as scoreSubmit(1840) would otherwise send no value and the score is dropped.
      if (typeof o === "number" || typeof o === "string") o = { value: o };
      post("score_submit", { board: str(o && o.board) || "main", value: num(o && (o.value != null ? o.value : o.score)) });
    },
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

  // ——— Fit ———
  // A phone-sized frame can be shorter than a game's title card or menu, which then gets clipped.
  // The bridge measures how far visible content reaches past the frame and reports the height it
  // needs; the player grows to fit (never shrinks, capped at the screen). It measures after load,
  // resizes, input and a run's end, since that is when screens change, and never per frame.
  var lastFit = 0;
  var fitTimer = null;
  function measureFit() {
    fitTimer = null;
    var vh = window.innerHeight, vw = window.innerWidth;
    if (!vh || !vw || !document.body) return;
    var top = 0, bottom = vh;
    var els = document.body.getElementsByTagName("*");
    for (var i = 0, n = Math.min(els.length, 1500); i < n; i++) {
      var el = els[i];
      var r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.right <= 0 || r.left >= vw) continue;
      if (r.top >= 0 && r.bottom <= vh) continue;
      // Hidden screens (an end card at opacity 0) sit in the same place and must not count.
      if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
    }
    var need = Math.ceil(bottom - top);
    if (need > vh + 8 && Math.abs(need - lastFit) > 4) {
      lastFit = need;
      post("size", { height: need });
    }
  }
  function scheduleFit(ms) {
    if (!enabled) return;
    if (fitTimer) clearTimeout(fitTimer);
    fitTimer = setTimeout(measureFit, ms);
  }
  window.addEventListener("resize", function () { scheduleFit(250); });
  window.addEventListener("pointerup", function () { scheduleFit(400); }, true);
  window.addEventListener("keyup", function () { scheduleFit(400); }, true);

  window.addEventListener("error", function (e) { if (e && e.message) post("error", { message: String(e.message).slice(0, 500) }); });
  window.addEventListener("load", function () {
    setTimeout(function () { if (!readySent) Habiv.ready(); }, 100);
    scheduleFit(300);
    // Fonts and late layout can change the title screen after load.
    setTimeout(function () { scheduleFit(0); }, 1500);
  });

  Object.defineProperty(window, "Habiv", { value: Habiv, writable: false, configurable: false });
  window.habiv = Habiv;
})();
