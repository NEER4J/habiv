/* Newgrounds.io shim: scoreboards and medals map onto the Habiv bridge; everything else succeeds silently. */
(function () {
  if (window.Newgrounds && window.Newgrounds.io) return;
  var H = function () { return window.Habiv; };
  function Core(app_id, aes_key) {
    this.app_id = app_id; this.aes_key = aes_key; this.session_id = null; this.user = null; this.queue = [];
  }
  Core.prototype.setSessionId = function () {};
  Core.prototype.getValidSession = function (cb) { if (cb) cb(); };
  Core.prototype.requestLogin = function (cb) { if (cb) cb(); };
  Core.prototype.hasUser = function () { return !!(H() && H().player && H().player.handle); };
  Core.prototype.callComponent = function (component, params, callback) {
    params = params || {};
    var result = { component: component, success: true, data: {} };
    if (component === "ScoreBoard.postScore" && H()) { H().scoreSubmit({ board: String(params.id || "main"), value: params.value }); result.data = { score: { value: params.value, formatted_value: String(params.value) } }; }
    else if (component === "Medal.unlock" && H()) { H().design({ key: "medal:" + params.id, value: 1 }); result.data = { medal: { id: params.id, unlocked: true } }; }
    else if (component === "Event.logEvent" && H()) { H().design({ key: "ng:" + params.event_name }); }
    else if (component === "App.startSession") { result.data = { session: { id: "habiv", user: null } }; }
    else if (component === "App.checkSession") { result.data = { session: { id: "habiv", user: null } }; }
    else if (component === "Medal.getList") { result.data = { medals: [] }; }
    else if (component === "ScoreBoard.getBoards") { result.data = { scoreboards: [] }; }
    else if (component === "ScoreBoard.getScores") { result.data = { scores: [] }; }
    if (callback) setTimeout(function () { callback(result); }, 0);
  };
  Core.prototype.queueComponent = function (component, params, callback) { this.queue.push([component, params, callback]); };
  Core.prototype.executeQueue = function () { var q = this.queue; this.queue = []; for (var i = 0; i < q.length; i++) this.callComponent.apply(this, q[i]); };
  window.Newgrounds = window.Newgrounds || {};
  window.Newgrounds.io = { core: Core, Core: Core };
  window.NGIO = window.NGIO || { init: function () {}, getSessionReady: function () {}, keepSessionAlive: function () {}, isReady: true, hasUser: false, postScore: function (id, value) { if (H()) H().scoreSubmit({ board: String(id), value: value }); }, unlockMedal: function (id) { if (H()) H().design({ key: "medal:" + id, value: 1 }); } };
})();
