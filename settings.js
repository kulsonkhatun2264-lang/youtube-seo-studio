/* ==========================================================================
 * settings.js — YouTube Auto-Pilot SEO Studio — Config / Storage Layer
 *
 * Exposes window.YTSeoSettings (aliased as "Cfg" inside dashboard.js).
 * Everything is stored in localStorage on the visitor's own browser —
 * nothing is ever sent to any server other than Google's own APIs.
 * ========================================================================== */
(function (global) {
  "use strict";

  var CFG_KEY      = "ytSeoStudio.cfg.v1";
  var AP_STATE_KEY  = "ytSeoStudio.autopilotState.v1";
  var HISTORY_KEY   = "ytSeoStudio.history.v1";

  var DEFAULT_CFG = {
    geminiKey: "",
    geminiModel: "gemini-1.5-flash",
    defaultCountry: "US",
    oauth: {
      accessToken: null,
      expiresAt: 0,      // epoch ms
      scope: ""
    },
    autoPilotScoreThreshold: 65,
    autoPilotMaxVideosPerRun: 5,
    autoPilotIntervalMinutes: 60,
    autoPilotEnabled: false
  };

  /* ------------------------------------------------------------------ *
   * Low-level storage helpers
   * ------------------------------------------------------------------ */
  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function readCfgRaw() {
    var stored = safeParse(localStorage.getItem(CFG_KEY), {});
    // shallow + one-level merge so new default fields appear automatically
    var merged = Object.assign({}, DEFAULT_CFG, stored);
    merged.oauth = Object.assign({}, DEFAULT_CFG.oauth, stored.oauth || {});
    return merged;
  }

  function writeCfgRaw(cfg) {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }

  /* ------------------------------------------------------------------ *
   * Public: general config
   * ------------------------------------------------------------------ */
  function loadCfg() {
    return readCfgRaw();
  }

  function saveCfg(partial) {
    var cfg = readCfgRaw();
    cfg = Object.assign({}, cfg, partial || {});
    if (partial && partial.oauth) cfg.oauth = Object.assign({}, cfg.oauth, partial.oauth);
    writeCfgRaw(cfg);
    return cfg;
  }

  function hasGeminiKey() {
    var cfg = readCfgRaw();
    return !!(cfg.geminiKey && cfg.geminiKey.trim().length > 10);
  }

  function getGeminiModel() {
    var cfg = readCfgRaw();
    return cfg.geminiModel || DEFAULT_CFG.geminiModel;
  }

  /* ------------------------------------------------------------------ *
   * Public: OAuth token
   * ------------------------------------------------------------------ */
  function saveOAuthToken(accessToken, expiresInSeconds, scope) {
    var cfg = readCfgRaw();
    cfg.oauth = {
      accessToken: accessToken,
      expiresAt: Date.now() + (Math.max(60, (expiresInSeconds || 3600) - 60)) * 1000, // 60s safety margin
      scope: scope || cfg.oauth.scope || ""
    };
    writeCfgRaw(cfg);
    return cfg.oauth;
  }

  function clearOAuthToken() {
    var cfg = readCfgRaw();
    cfg.oauth = Object.assign({}, DEFAULT_CFG.oauth);
    writeCfgRaw(cfg);
  }

  function isOAuthValid() {
    var cfg = readCfgRaw();
    return !!(cfg.oauth && cfg.oauth.accessToken && cfg.oauth.expiresAt > Date.now());
  }

  function getAccessToken() {
    var cfg = readCfgRaw();
    return (cfg.oauth && cfg.oauth.accessToken) || null;
  }

  /* ------------------------------------------------------------------ *
   * Public: Auto-Pilot config + runtime state
   * ------------------------------------------------------------------ */
  function getAutoPilotConfig() {
    var cfg = readCfgRaw();
    return {
      enabled: !!cfg.autoPilotEnabled,
      scoreThreshold: cfg.autoPilotScoreThreshold || DEFAULT_CFG.autoPilotScoreThreshold,
      maxVideosPerRun: cfg.autoPilotMaxVideosPerRun || DEFAULT_CFG.autoPilotMaxVideosPerRun,
      intervalMinutes: cfg.autoPilotIntervalMinutes || DEFAULT_CFG.autoPilotIntervalMinutes
    };
  }

  function setAutoPilotEnabled(enabled) {
    saveCfg({ autoPilotEnabled: !!enabled });
  }

  function loadAutoPilotState() {
    return safeParse(localStorage.getItem(AP_STATE_KEY), {
      totalProcessed: 0,
      totalUpdated: 0,
      lastRunAt: null,
      lastCycleResults: { errors: [] }
    });
  }

  function saveAutoPilotState(state) {
    localStorage.setItem(AP_STATE_KEY, JSON.stringify(state));
    return state;
  }

  /* ------------------------------------------------------------------ *
   * Public: optimization history
   * ------------------------------------------------------------------ */
  function loadHistory() {
    return safeParse(localStorage.getItem(HISTORY_KEY), []);
  }

  function addHistory(entry) {
    var hist = loadHistory();
    hist.unshift(Object.assign({ timestamp: Date.now() }, entry));
    if (hist.length > 100) hist.length = 100;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    return hist;
  }

  /* ------------------------------------------------------------------ *
   * Export
   * ------------------------------------------------------------------ */
  global.YTSeoSettings = {
    loadCfg: loadCfg,
    saveCfg: saveCfg,
    hasGeminiKey: hasGeminiKey,
    getGeminiModel: getGeminiModel,

    saveOAuthToken: saveOAuthToken,
    clearOAuthToken: clearOAuthToken,
    isOAuthValid: isOAuthValid,
    getAccessToken: getAccessToken,

    getAutoPilotConfig: getAutoPilotConfig,
    setAutoPilotEnabled: setAutoPilotEnabled,
    loadAutoPilotState: loadAutoPilotState,
    saveAutoPilotState: saveAutoPilotState,

    loadHistory: loadHistory,
    addHistory: addHistory
  };

})(window);
