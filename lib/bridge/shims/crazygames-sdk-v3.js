/* CrazyGames SDK v3 shim: window.CrazyGames.SDK on top of the Habiv bridge. */
(function () {
  if (window.CrazyGames && window.CrazyGames.SDK) return;
  var H = function () { return window.Habiv; };
  var store = {};
  var started = false;
  function save(key, value) { store[key] = value; try { localStorage.setItem("cg:" + key, JSON.stringify(value)); } catch (e) {} if (H()) H().save({ key: key, value: value }); }
  function load(key) { try { var v = localStorage.getItem("cg:" + key); return v == null ? null : JSON.parse(v); } catch (e) { return store[key] == null ? null : store[key]; } }
  var SDK = {
    environment: "crazygames",
    init: function () { return Promise.resolve(); },
    game: {
      gameplayStart: function () { if (H()) { H().gameplayStart(); if (!started) { started = true; H().runStart(); } } },
      gameplayStop: function () { if (H()) H().gameplayStop(); },
      happytime: function () { if (H()) H().happytime(); },
      loadingStart: function () {}, loadingStop: function () { if (H()) H().ready(); },
      sdkGameLoadingStart: function () {}, sdkGameLoadingStop: function () { if (H()) H().ready(); },
      inviteLink: function (params) { var u = new URL(window.location.href); Object.keys(params || {}).forEach(function (k) { u.searchParams.set(k, params[k]); }); return Promise.resolve(u.toString()); },
      showInviteButton: function () { return Promise.resolve(window.location.href); },
      hideInviteButton: function () {},
      getInviteParam: function (k) { return Promise.resolve(new URLSearchParams(window.location.search).get(k)); },
      settings: { disableChat: false },
      isInstantMultiplayer: false
    },
    ad: {
      requestAd: function (type, cb) { cb = cb || {}; if (cb.adStarted) cb.adStarted(); if (cb.adFinished) setTimeout(cb.adFinished, 0); },
      hasAdblock: function () { return Promise.resolve(false); },
      requestBanner: function () { return Promise.resolve(); }, clearBanner: function () {}, clearAllBanners: function () {}
    },
    banner: { requestBanner: function () { return Promise.resolve(); }, requestResponsiveBanner: function () { return Promise.resolve(); }, clearBanner: function () {}, clearAllBanners: function () {} },
    user: {
      isUserAccountAvailable: true,
      getUser: function () { var p = H() && H().player; return Promise.resolve(p && p.handle ? { username: p.handle, profilePictureUrl: "" } : null); },
      showAuthPrompt: function () { return Promise.reject(new Error("Use the Habiv sign-in button")); },
      getUserToken: function () { return Promise.resolve(null); },
      addAuthListener: function () {}, removeAuthListener: function () {},
      getSystemInfo: function () { return Promise.resolve({ countryCode: "", browser: {}, os: {}, device: {} }); }
    },
    data: {
      setItem: function (k, v) { save(k, v); }, getItem: function (k) { return load(k); },
      removeItem: function (k) { delete store[k]; try { localStorage.removeItem("cg:" + k); } catch (e) {} },
      clear: function () { store = {}; }
    },
    analytics: { trackOrder: function () {} },
    isQaTool: false
  };
  window.CrazyGames = window.CrazyGames || {};
  window.CrazyGames.SDK = SDK;
})();
