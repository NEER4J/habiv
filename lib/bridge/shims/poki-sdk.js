/* Poki SDK v2 shim: maps PokiSDK calls onto the Habiv bridge. No ads are shown. */
(function () {
  if (window.PokiSDK) return;
  var H = function () { return window.Habiv; };
  var started = false;
  window.PokiSDK = {
    init: function () { return Promise.resolve(); },
    setDebug: function () {},
    gameLoadingStart: function () {},
    gameLoadingProgress: function () {},
    gameLoadingFinished: function () { if (H()) H().ready(); },
    gameplayStart: function () { if (H()) { H().gameplayStart(); if (!started) { started = true; H().runStart(); } } },
    gameplayStop: function () { if (H()) H().gameplayStop(); },
    happyTime: function () { if (H()) H().happytime(); },
    commercialBreak: function () { return Promise.resolve(); },
    rewardedBreak: function () { return Promise.resolve(true); },
    displayAd: function () {}, destroyAd: function () {},
    shareableURL: function (params) { var u = new URL(window.location.href); Object.keys(params || {}).forEach(function (k) { u.searchParams.set(k, params[k]); }); return Promise.resolve(u.toString()); },
    getURLParam: function (k) { return new URLSearchParams(window.location.search).get(k) || ""; },
    getLanguage: function () { return (navigator.language || "en").slice(0, 2); },
    isAdBlocked: function () { return false; },
    muteAd: function () {},
    captureError: function (e) { if (H()) H().error(e && e.message ? e.message : String(e)); },
    customEvent: function (name, value) { if (H()) H().design({ key: "poki:" + name, value: value }); }
  };
})();
