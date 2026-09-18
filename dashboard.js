/* ==========================================================================
 * dashboard.js — YouTube Auto-Pilot SEO Studio — UI Controller
 *
 * Handles all DOM interactions:
 *   - Channel load & video grid rendering
 *   - Edit Mode modal lifecycle
 *   - Real-time SEO Score updates (live input listeners)
 *   - Keyword Research panel (YouTube data)
 *   - Optimization result rendering (Gemini output from YouTube data)
 *   - Auto-Pilot panel binding
 *   - Filter / sort / search in video list
 * ========================================================================== */
(function (global) {
  "use strict";

  var App = global.YTSeoApp;
  var Cfg = global.YTSeoSettings;

  /* =========================================================================
   * SECTION 1: DOM ELEMENT CACHE
   * ======================================================================= */
  var DOM = {};

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  function cacheDOM() {
    DOM.tickerTrack     = $("#tickerTrack");
    DOM.geminiKeyInput  = $("#geminiKeyInput");
    DOM.geminiRevealBtn = $("#geminiRevealBtn");
    DOM.geminiSaveBtn   = $("#geminiSaveBtn");
    DOM.geminiStatus    = $("#geminiStatus");
    DOM.geminiDot       = $("#geminiDot");
    DOM.geminiPanel     = $("#geminiPanel");
    DOM.connectYTBtn    = $("#connectYTBtn");
    DOM.disconnectYTBtn = $("#disconnectYTBtn");
    DOM.authSection     = $("#authSection");
    DOM.channelSection  = $("#channelSection");
    DOM.channelAvatar   = $("#channelAvatar");
    DOM.channelName     = $("#channelName");
    DOM.channelSubs     = $("#channelSubs");
    DOM.channelViews    = $("#channelViews");
    DOM.channelVidCount = $("#channelVidCount");
    DOM.refreshVideosBtn= $("#refreshVideosBtn");
    DOM.videoGrid       = $("#videoGrid");
    DOM.videoCount      = $("#videoCount");
    DOM.filterInput     = $("#filterInput");
    DOM.sortSelect      = $("#sortSelect");
    DOM.filterBtns      = $$("[data-filter-score]");
    DOM.gridViewBtn     = $("#gridViewBtn");
    DOM.listViewBtn     = $("#listViewBtn");
    DOM.modalScrim      = $("#modalScrim");
    DOM.modal           = $("#editModal");
    DOM.modalClose      = $("#modalClose");
    DOM.modalVidTitle   = $("#modalVidTitle");
    DOM.modalThumb      = $("#modalThumb");
    DOM.modalViewCount  = $("#modalViewCount");
    DOM.modalLikeCount  = $("#modalLikeCount");
    DOM.modalPubDate    = $("#modalPubDate");
    DOM.editTitle       = $("#editTitle");
    DOM.editTitleLen    = $("#editTitleLen");
    DOM.editDesc        = $("#editDesc");
    DOM.editDescLen     = $("#editDescLen");
    DOM.editTags        = $("#editTags");
    DOM.editTagCount    = $("#editTagCount");
    DOM.privacySeg      = $("#privacySeg");
    DOM.optimizeBtn     = $("#optimizeBtn");
    DOM.saveYTBtn       = $("#saveYTBtn");
    DOM.saveYTStatus    = $("#saveYTStatus");
    DOM.progressTrack   = $("#progressTrack");
    DOM.progressFill    = $("#progressFill");
    DOM.progressMsg     = $("#progressMsg");
    DOM.optSkeleton     = $("#optSkeleton");
    DOM.optResult       = $("#optResult");
    DOM.seoScorePanel   = $("#seoScorePanel");
    DOM.seoScoreNum     = $("#seoScoreNum");
    DOM.seoScoreGrade   = $("#seoScoreGrade");
    DOM.seoRingCircle   = $("#seoRingCircle");
    DOM.seoBreakdown    = $("#seoBreakdown");
    DOM.optTitles       = $("#optTitles");
    DOM.optDesc         = $("#optDesc");
    DOM.optTags         = $("#optTags");
    DOM.optHashtags     = $("#optHashtags");
    DOM.optStrategy     = $("#optStrategy");
    DOM.copyTitleBtn    = $("#copyTitleBtn");
    DOM.copyDescBtn     = $("#copyDescBtn");
    DOM.copyTagsBtn     = $("#copyTagsBtn");
    DOM.kwInput         = $("#kwInput");
    DOM.kwSearchBtn     = $("#kwSearchBtn");
    DOM.kwResults       = $("#kwResults");
    DOM.kwSkeleton      = $("#kwSkeleton");
    DOM.kwRelated       = $("#kwRelated");
    DOM.tabOptimize     = $("#tabOptimize");
    DOM.tabKeywords     = $("#tabKeywords");
    DOM.tabHistory      = $("#tabHistory");
    DOM.panelOptimize   = $("#panelOptimize");
    DOM.panelKeywords   = $("#panelKeywords");
    DOM.panelHistory    = $("#panelHistory");
    DOM.apCard          = $("#apCard");
    DOM.apToggle        = $("#apToggle");
    DOM.apState         = $("#apState");
    DOM.apDot           = $("#apDot");
    DOM.apLog           = $("#apLog");
    DOM.apRunNowBtn     = $("#apRunNowBtn");
    DOM.apStatProcessed = $("#apStatProcessed");
    DOM.apStatUpdated   = $("#apStatUpdated");
    DOM.apStatErrors    = $("#apStatErrors");
    DOM.apThreshold     = $("#apThreshold");
    DOM.apMaxVideos     = $("#apMaxVideos");
    DOM.apInterval      = $("#apInterval");
    DOM.apSaveCfgBtn    = $("#apSaveCfgBtn");
  }

  /* =========================================================================
   * SECTION 2: IN-MEMORY STATE
   * ======================================================================= */
  var state = {
    channel: null,
    videos: [],
    filteredVideos: [],
    activeVideoId: null,
    activeVideoData: null,
    activeOptResult: null,
    activeKwData: null,
    activePrivacy: "public",
    filterText: "",
    filterScore: "all",
    sortBy: "views",
    viewMode: "grid",
    autoPilotActive: false,
    seoScoreTimer: null
  };

  /* =========================================================================
   * SECTION 3: UTILITY HELPERS
   * ======================================================================= */
  function fmtNum(n) {
    var num = parseInt(n || "0", 10);
    if (isNaN(num)) return "0";
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000)    return (num / 1000).toFixed(1) + "K";
    return String(num);
  }

  function formatDuration(iso) {
    if (!iso) return "";
    var match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return "";
    var h = parseInt(match[1] || "0", 10);
    var m = parseInt(match[2] || "0", 10);
    var s = parseInt(match[3] || "0", 10);
    if (h) return h + ":" + pad2(m) + ":" + pad2(s);
    return m + ":" + pad2(s);
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  function formatBreakdownKey(k) {
    return ({ titleLength: "Title Length", keywordInTitle: "Keyword", description: "Description", tags: "Tags", hashtag: "Hashtag" })[k] || k;
  }

  function privacyColor(p) { return p === "public" ? "green" : p === "unlisted" ? "amber" : "red"; }
  function gradeColor(g)   { return g === "A" ? "green" : g === "B" ? "cyan"  : g === "C" ? "amber" : "red"; }

  /* =========================================================================
   * SECTION 4: GEMINI KEY PANEL
   * ======================================================================= */
  function initGeminiPanel() {
    var cfg = Cfg.loadCfg();
    if (cfg.geminiKey) {
      DOM.geminiKeyInput.value = cfg.geminiKey;
      setGeminiStatus(true, "Connected \u2022 " + (cfg.geminiModel || "gemini-1.5-flash"));
      DOM.geminiPanel.classList.add("connected");
    }

    DOM.geminiKeyInput.addEventListener("input", function () {
      var v = DOM.geminiKeyInput.value.trim();
      if (v.length > 10) setGeminiStatus(null, "Press Save to validate");
      else               setGeminiStatus(false, "Enter your Gemini API key");
      DOM.geminiPanel.classList.remove("connected");
    });

    DOM.geminiKeyInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") DOM.geminiSaveBtn.click();
    });

    DOM.geminiRevealBtn.addEventListener("click", function () {
      var t = DOM.geminiKeyInput.type === "password" ? "text" : "password";
      DOM.geminiKeyInput.type = t;
      DOM.geminiRevealBtn.innerHTML = App.icon(t === "password" ? "eye" : "lock", "icon-sm");
    });

    DOM.geminiSaveBtn.addEventListener("click", function () {
      var key = DOM.geminiKeyInput.value.trim();
      if (!key) { App.toast("Enter a Gemini API key.", "warn"); return; }
      DOM.geminiSaveBtn.disabled = true;
      DOM.geminiSaveBtn.innerHTML = '<span class="loader-ring" style="width:14px;height:14px;border-width:2px;"></span> Validating...';
      setGeminiStatus(null, "Validating with Google...");

      var model = Cfg.getGeminiModel();
      fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Reply: OK" }] }] })
      }).then(function (res) {
        DOM.geminiSaveBtn.disabled = false;
        DOM.geminiSaveBtn.innerHTML = App.icon("check", "icon-sm") + " Save Key";
        if (res.ok) {
          Cfg.saveCfg({ geminiKey: key });
          setGeminiStatus(true, "Connected \u2022 " + model);
          DOM.geminiPanel.classList.add("connected");
          App.toast("Gemini API key saved & validated!");
          App.applyGlitchEffect(DOM.geminiPanel.querySelector(".gemini-panel__label"), 700);
        } else {
          setGeminiStatus(false, "Invalid key (HTTP " + res.status + ")");
          DOM.geminiPanel.classList.remove("connected");
          App.toast("Invalid Gemini API key.", "err");
        }
      }).catch(function (err) {
        DOM.geminiSaveBtn.disabled = false;
        DOM.geminiSaveBtn.innerHTML = App.icon("check", "icon-sm") + " Save Key";
        setGeminiStatus(false, "Network error");
        App.toast("Validation failed: " + err.message, "err");
      });
    });
  }

  function setGeminiStatus(ok, msg) {
    if (!DOM.geminiDot) return;
    DOM.geminiDot.className = "status-dot" + (ok === true ? " live" : ok === false ? " error" : "");
    if (DOM.geminiStatus) {
      DOM.geminiStatus.textContent = msg || "";
      DOM.geminiStatus.className   = "gemini-panel__status" + (ok === true ? " ok" : ok === false ? " err" : "");
    }
  }

  /* =========================================================================
   * SECTION 5: YOUTUBE OAUTH FLOW
   * ======================================================================= */
  function initOAuthButtons() {
    DOM.connectYTBtn.addEventListener("click", function () {
      DOM.connectYTBtn.disabled = true;
      DOM.connectYTBtn.innerHTML = '<span class="loader-ring" style="width:16px;height:16px;border-width:2px;margin-right:8px;"></span> Opening Google Auth...';
      App.initiateOAuth()
        .then(function () {
          App.toast("YouTube Connected!", "info");
          showChannelSection();
          loadChannelData();
        })
        .catch(function (err) {
          App.toast("Auth failed: " + err.message, "err");
          DOM.connectYTBtn.disabled = false;
          DOM.connectYTBtn.innerHTML = App.icon("play", "icon-sm") + " Connect YouTube Channel";
        });
    });

    DOM.disconnectYTBtn && DOM.disconnectYTBtn.addEventListener("click", function () {
      if (!confirm("Disconnect YouTube?")) return;
      App.revokeOAuth();
      App.toast("YouTube disconnected.", "warn");
      showAuthSection();
      state.channel = null;
      state.videos = [];
      state.filteredVideos = [];
      if (DOM.videoGrid) DOM.videoGrid.innerHTML = "";
    });
  }

  function showAuthSection() {
    if (DOM.authSection)    DOM.authSection.classList.remove("hidden");
    if (DOM.channelSection) DOM.channelSection.classList.add("hidden");
    DOM.connectYTBtn.disabled = false;
    DOM.connectYTBtn.innerHTML = App.icon("play", "icon-sm") + " Connect YouTube Channel";
  }

  function showChannelSection() {
    if (DOM.authSection)    DOM.authSection.classList.add("hidden");
    if (DOM.channelSection) DOM.channelSection.classList.remove("hidden");
  }

  /* =========================================================================
   * SECTION 6: CHANNEL & VIDEO LOADING
   * ======================================================================= */
  function loadChannelData() {
    DOM.refreshVideosBtn.disabled = true;
    DOM.refreshVideosBtn.innerHTML = '<span class="loader-ring" style="width:14px;height:14px;border-width:2px;"></span>';
    if (DOM.videoGrid) DOM.videoGrid.innerHTML = renderSkeletonCards(8);

    App.loadChannelAndVideos(function (fetched, total) {
      if (DOM.channelVidCount) DOM.channelVidCount.innerHTML = "<b>" + fetched + (total ? "/" + total : "") + "</b> loading...";
    }).then(function (result) {
      state.channel = result.channel;
      state.videos  = result.videos;
      renderChannelBar(result.channel);
      applyFiltersAndSort();
      DOM.refreshVideosBtn.disabled = false;
      DOM.refreshVideosBtn.innerHTML = App.icon("refresh", "icon-sm") + " Refresh";
      App.toast("Loaded " + result.videos.length + " videos.", "info");
    }).catch(function (err) {
      DOM.refreshVideosBtn.disabled = false;
      DOM.refreshVideosBtn.innerHTML = App.icon("refresh", "icon-sm") + " Refresh";
      if (DOM.videoGrid) {
        DOM.videoGrid.innerHTML = '<div class="info-box" style="grid-column:1/-1;">' +
          App.icon("alert", "icon-sm") + '<span>Failed: ' + App.esc(err.message) + '</span></div>';
      }
      App.toast("Channel load failed: " + err.message, "err", 6000);
    });
  }

  function renderChannelBar(channel) {
    var s    = channel.snippet    || {};
    var stat = channel.statistics || {};
    var thumb = s.thumbnails && (s.thumbnails.medium || s.thumbnails.default);
    if (thumb && thumb.url) { DOM.channelAvatar.src = thumb.url; DOM.channelAvatar.style.display = "block"; }
    DOM.channelName.textContent = s.title || "My Channel";
    if (DOM.channelSubs)     DOM.channelSubs.innerHTML  = "<b>" + fmtNum(stat.subscriberCount) + "</b> subscribers";
    if (DOM.channelViews)    DOM.channelViews.innerHTML = "<b>" + fmtNum(stat.viewCount) + "</b> total views";
    if (DOM.channelVidCount) DOM.channelVidCount.innerHTML = "<b>" + fmtNum(stat.videoCount) + "</b> videos";
  }

  /* =========================================================================
   * SECTION 7: FILTER, SORT & SEARCH
   * ======================================================================= */
  function initFilterSort() {
    if (DOM.filterInput) {
      DOM.filterInput.addEventListener("input", function () {
        state.filterText = DOM.filterInput.value.trim().toLowerCase();
        applyFiltersAndSort();
      });
    }
    if (DOM.sortSelect) {
      DOM.sortSelect.addEventListener("change", function () {
        state.sortBy = DOM.sortSelect.value;
        applyFiltersAndSort();
      });
    }
    DOM.filterBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        DOM.filterBtns.forEach(function (b) { b.classList.remove("btn--primary"); b.classList.add("btn--ghost"); });
        btn.classList.add("btn--primary"); btn.classList.remove("btn--ghost");
        state.filterScore = btn.dataset.filterScore || "all";
        applyFiltersAndSort();
      });
    });
    if (DOM.gridViewBtn) {
      DOM.gridViewBtn.addEventListener("click", function () {
        state.viewMode = "grid";
        DOM.videoGrid.classList.remove("video-grid--list");
        DOM.gridViewBtn.classList.add("btn--primary"); DOM.listViewBtn.classList.remove("btn--primary");
      });
    }
    if (DOM.listViewBtn) {
      DOM.listViewBtn.addEventListener("click", function () {
        state.viewMode = "list";
        DOM.videoGrid.classList.add("video-grid--list");
        DOM.listViewBtn.classList.add("btn--primary"); DOM.gridViewBtn.classList.remove("btn--primary");
      });
    }
    if (DOM.refreshVideosBtn) {
      DOM.refreshVideosBtn.addEventListener("click", function () {
        if (Cfg.isOAuthValid()) loadChannelData();
        else App.toast("Connect YouTube first.", "warn");
      });
    }
  }

  function applyFiltersAndSort() {
    var videos = state.videos.slice();
    if (state.filterText) {
      videos = videos.filter(function (v) {
        var s = v.snippet || {};
        var haystack = [(s.title||""), (s.description||""), (s.tags||[]).join(" ")].join(" ").toLowerCase();
        return haystack.indexOf(state.filterText) >= 0;
      });
    }
    if (state.filterScore !== "all") {
      videos = videos.filter(function (v) {
        var sc = computeQuickScore(v);
        if (state.filterScore === "poor")   return sc < 40;
        if (state.filterScore === "weak")   return sc >= 40 && sc < 65;
        if (state.filterScore === "decent") return sc >= 65 && sc < 80;
        if (state.filterScore === "strong") return sc >= 80;
        return true;
      });
    }
    videos.sort(function (a, b) {
      var as = a.snippet||"{}", bs = b.snippet||"{}";
      var aSt = a.statistics||{}, bSt = b.statistics||{};
      if (state.sortBy === "views")      return parseInt(bSt.viewCount||0,10) - parseInt(aSt.viewCount||0,10);
      if (state.sortBy === "likes")      return parseInt(bSt.likeCount||0,10) - parseInt(aSt.likeCount||0,10);
      if (state.sortBy === "comments")   return parseInt(bSt.commentCount||0,10) - parseInt(aSt.commentCount||0,10);
      if (state.sortBy === "date")       return new Date((b.snippet||{}).publishedAt||0) - new Date((a.snippet||{}).publishedAt||0);
      if (state.sortBy === "score_asc")  return computeQuickScore(a) - computeQuickScore(b);
      if (state.sortBy === "score_desc") return computeQuickScore(b) - computeQuickScore(a);
      if (state.sortBy === "alpha")      return ((a.snippet||{}).title||"").localeCompare(((b.snippet||{}).title||""));
      return 0;
    });
    state.filteredVideos = videos;
    if (DOM.videoCount) DOM.videoCount.textContent = videos.length;
    renderVideoGrid(videos);
  }

  function computeQuickScore(video) {
    var s = video.snippet || {};
    return App.calculateSEOScore(s.title||"", s.description||"", s.tags||[], []).total;
  }

  /* =========================================================================
   * SECTION 8: VIDEO GRID RENDERING
   * ======================================================================= */
  function renderSkeletonCards(n) {
    var html = "";
    for (var i = 0; i < n; i++) {
      html += '<div class="video-card" style="pointer-events:none;"><div class="video-card__thumb">' +
        '<div class="sk" style="height:100%;width:100%;"></div></div>' +
        '<div class="video-card__body"><div class="sk sk--h1" style="margin-bottom:10px;"></div>' +
        '<div class="sk sk--h4"></div></div></div>';
    }
    return html;
  }

  function renderVideoGrid(videos) {
    if (!DOM.videoGrid) return;
    if (!videos.length) {
      DOM.videoGrid.innerHTML = '<div class="info-box" style="grid-column:1/-1;">' +
        App.icon("search", "icon-sm") + '<span>No videos match your filters.</span></div>';
      return;
    }
    DOM.videoGrid.innerHTML = "";
    videos.forEach(function (video, idx) {
      var el = buildVideoCard(video, idx);
      DOM.videoGrid.appendChild(el);
    });
  }

  function buildVideoCard(video, idx) {
    var s     = video.snippet    || {};
    var stats = video.statistics || {};
    var seo   = App.calculateSEOScore(s.title||"", s.description||"", s.tags||[], []);
    var score = seo.total;
    var thumb = s.thumbnails && ((s.thumbnails.medium || s.thumbnails.default) || {});
    var thumbUrl  = (thumb && thumb.url) ? thumb.url : "";
    var duration  = formatDuration(video.contentDetails && video.contentDetails.duration);
    var tags      = (s.tags || []).slice(0, 4);
    var privacy   = (video.status && video.status.privacyStatus) || "public";
    var scoreColor = seo.color || "#00FF41";
    var circ = 2 * Math.PI * 18;
    var offset = circ - (score / 100) * circ;

    var card = document.createElement("article");
    card.className = "video-card" + (score < 55 ? " video-card--poor-seo" : "");
    card.style.animationDelay = (idx * 35) + "ms";
    card.dataset.videoId = video.id;

    card.innerHTML = [
      '<div class="video-card__thumb">',
        thumbUrl
          ? '<img src="' + App.esc(thumbUrl) + '" alt="' + App.esc(s.title||"Video") + '" loading="lazy">'
          : '<div style="height:100%;background:var(--bg-deep);display:grid;place-items:center;color:var(--text-muted);">' + App.icon("play", "icon-lg") + '</div>',
        '<div class="video-card__thumb-overlay">',
          '<div class="score-ring-wrap">',
            '<svg viewBox="0 0 44 44" width="44" height="44">',
              '<circle cx="22" cy="22" r="18" stroke="rgba(0,0,0,0.55)" stroke-width="3" fill="rgba(0,0,0,0.45)"/>',
              '<circle cx="22" cy="22" r="18" stroke="' + scoreColor + '" stroke-width="3" fill="none"',
                ' stroke-dasharray="' + circ.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"',
                ' stroke-linecap="round" style="filter:drop-shadow(0 0 3px ' + scoreColor + ');"/>',
            '</svg>',
            '<div class="score-ring-val">' + score + '</div>',
          '</div>',
          duration ? '<span class="video-card__duration">' + App.esc(duration) + '</span>' : "",
          '<span class="video-card__edit-hint">' + App.icon("bolt", "icon-sm") + ' EDIT SEO</span>',
        '</div>',
      '</div>',
      '<div class="video-card__body">',
        '<div class="video-card__title">' + App.esc(s.title || "Untitled") + '</div>',
        '<div class="video-card__meta">',
          '<span class="video-stat">' + App.icon("eye", "icon-sm") + ' ' + fmtNum(stats.viewCount) + '</span>',
          '<span class="video-stat">' + App.icon("trending", "icon-sm") + ' ' + fmtNum(stats.likeCount) + '</span>',
          '<span class="video-stat" style="margin-left:auto;">' + App.icon("tag", "icon-sm") + ' ' + ((s.tags && s.tags.length) || 0) + ' tags</span>',
        '</div>',
        tags.length
          ? '<div class="flex gap-2" style="flex-wrap:wrap;margin-bottom:10px;">' + tags.map(function (t) {
              return '<span class="tag-chip">' + App.esc(t) + '</span>';
            }).join("") + '</div>'
          : "",
        '<div class="video-card__foot">',
          '<span class="tag-chip tag-chip--' + privacyColor(privacy) + '">' + App.esc(privacy) + '</span>',
          '<span style="flex:1;"></span>',
          '<span class="tag-chip tag-chip--' + gradeColor(seo.grade) + '">SEO ' + seo.grade + '</span>',
        '</div>',
      '</div>'
    ].join("");

    card.addEventListener("click", function () { openEditModal(video); });
    return card;
  }

  /* =========================================================================
   * SECTION 9: EDIT MODAL OPEN / CLOSE
   * ======================================================================= */
  function openEditModal(video) {
    state.activeVideoId   = video.id;
    state.activeVideoData = video;
    state.activeOptResult = null;
    state.activePrivacy   = (video.status && video.status.privacyStatus) || "public";

    var s     = video.snippet    || {};
    var stats = video.statistics || {};
    var thumb = s.thumbnails && (s.thumbnails.medium || s.thumbnails.default);

    if (DOM.modalVidTitle)   DOM.modalVidTitle.textContent = s.title || "Untitled";
    if (DOM.modalThumb && thumb && thumb.url) DOM.modalThumb.src = thumb.url;
    if (DOM.modalViewCount)  DOM.modalViewCount.textContent = fmtNum(stats.viewCount);
    if (DOM.modalLikeCount)  DOM.modalLikeCount.textContent = fmtNum(stats.likeCount);
    if (DOM.modalPubDate)    DOM.modalPubDate.textContent   = s.publishedAt ? new Date(s.publishedAt).toLocaleDateString() : "";

    if (DOM.editTitle) DOM.editTitle.value = s.title       || "";
    if (DOM.editDesc)  DOM.editDesc.value  = s.description || "";
    if (DOM.editTags)  DOM.editTags.value  = (s.tags || []).join(", ");

    updateCharCount(DOM.editTitle, DOM.editTitleLen, 50, 70);
    updateCharCount(DOM.editDesc,  DOM.editDescLen,  200, 1200);
    updateTagCount();
    updatePrivacySeg(state.activePrivacy);

    if (DOM.optSkeleton)  DOM.optSkeleton.classList.remove("show");
    if (DOM.optResult)    DOM.optResult.classList.remove("show");
    if (DOM.progressTrack) DOM.progressTrack.classList.remove("show");
    if (DOM.saveYTStatus) DOM.saveYTStatus.textContent = "";
    if (DOM.saveYTBtn)    { DOM.saveYTBtn.disabled = false; DOM.saveYTBtn.innerHTML = App.icon("save", "icon-sm") + " Save to YouTube"; }

    triggerSeoScoreUpdate();
    switchModalTab("optimize");

    if (DOM.kwInput) DOM.kwInput.value = (s.title || "").split(" ").slice(0, 4).join(" ");

    DOM.modalScrim.classList.add("open");
    DOM.modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeEditModal() {
    DOM.modalScrim.classList.remove("open");
    DOM.modal.classList.remove("open");
    document.body.style.overflow = "";
    clearTimeout(state.seoScoreTimer);
    state.activeVideoId = null;
    state.activeVideoData = null;
    state.activeOptResult = null;
  }

  function initModalEvents() {
    DOM.modalClose.addEventListener("click", closeEditModal);
    DOM.modalScrim.addEventListener("click", function (e) { if (e.target === DOM.modalScrim) closeEditModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && DOM.modal.classList.contains("open")) closeEditModal(); });
  }

  /* =========================================================================
   * SECTION 10: MODAL TABS
   * ======================================================================= */
  function switchModalTab(tab) {
    var map = { optimize: [DOM.tabOptimize, DOM.panelOptimize], keywords: [DOM.tabKeywords, DOM.panelKeywords], history: [DOM.tabHistory, DOM.panelHistory] };
    Object.keys(map).forEach(function (k) {
      var tab_el = map[k][0]; var panel_el = map[k][1];
      if (!tab_el || !panel_el) return;
      var active = k === tab;
      tab_el.setAttribute("aria-selected", String(active));
      panel_el.classList.toggle("active", active);
    });
  }

  function initModalTabs() {
    if (DOM.tabOptimize) DOM.tabOptimize.addEventListener("click", function () { switchModalTab("optimize"); });
    if (DOM.tabKeywords) DOM.tabKeywords.addEventListener("click", function () { switchModalTab("keywords"); loadKeywordResearch(); });
    if (DOM.tabHistory)  DOM.tabHistory.addEventListener("click",  function () { switchModalTab("history");  renderOptHistory(); });
  }

  /* =========================================================================
   * SECTION 11: REAL-TIME SEO SCORE CALCULATOR
   * ======================================================================= */
  function initSeoScoreListeners() {
    [DOM.editTitle, DOM.editDesc, DOM.editTags].forEach(function (el) {
      if (el) el.addEventListener("input", function () { scheduleSeoUpdate(); });
    });
  }

  function scheduleSeoUpdate() {
    clearTimeout(state.seoScoreTimer);
    state.seoScoreTimer = setTimeout(triggerSeoScoreUpdate, 160);
  }

  function triggerSeoScoreUpdate() {
    var title   = DOM.editTitle ? DOM.editTitle.value : "";
    var desc    = DOM.editDesc  ? DOM.editDesc.value  : "";
    var tagsRaw = DOM.editTags  ? DOM.editTags.value  : "";
    var tags    = tagsRaw.split(",").map(function (t) { return t.trim(); }).filter(Boolean);

    updateCharCount(DOM.editTitle, DOM.editTitleLen, 50, 70);
    updateCharCount(DOM.editDesc,  DOM.editDescLen,  200, 1200);
    updateTagCount();

    var kwTargets = [];
    if (state.activeKwData && state.activeKwData.keywords) {
      kwTargets = state.activeKwData.keywords.slice(0, 5).map(function (k) { return k.keyword || k; });
    } else if (state.activeOptResult && state.activeOptResult.primaryKeyword) {
      kwTargets = [state.activeOptResult.primaryKeyword];
    }

    var seo = App.calculateSEOScore(title, desc, tags, kwTargets);
    updateSeoScoreDisplay(seo);
  }

  function updateSeoScoreDisplay(seo) {
    if (!DOM.seoScoreNum) return;
    var score = seo.total;
    var color = seo.color;
    var grade = seo.grade;

    DOM.seoScoreNum.textContent = score;
    DOM.seoScoreNum.style.color = color;
    if (DOM.seoScoreGrade) DOM.seoScoreGrade.textContent = grade;
    if (DOM.seoScorePanel) DOM.seoScorePanel.dataset.grade = grade;

    /* Animated ring */
    if (DOM.seoRingCircle) {
      var r    = 48;
      var circ = 2 * Math.PI * r;
      var offset = circ - (score / 100) * circ;
      DOM.seoRingCircle.setAttribute("stroke-dasharray",  String(circ.toFixed(2)));
      DOM.seoRingCircle.setAttribute("stroke-dashoffset", String(offset.toFixed(2)));
      DOM.seoRingCircle.setAttribute("stroke", color);
      DOM.seoRingCircle.style.filter = "drop-shadow(0 0 6px " + color + ")";
    }

    /* Breakdown rows */
    if (DOM.seoBreakdown) {
      var bd   = seo.breakdown || {};
      var html = Object.keys(bd).map(function (k) {
        var row = bd[k];
        var pct = Math.round((row.score / (row.max || 1)) * 100);
        return '<div class="seo-breakdown-row">' +
          '<div class="seo-breakdown-top">' +
            '<span class="seo-breakdown-key">' + App.esc(formatBreakdownKey(k)) + '</span>' +
            '<span class="seo-breakdown-val">' + row.score + '/' + row.max + '</span>' +
          '</div>' +
          '<div class="seo-bar-track"><div class="seo-bar-fill" style="width:' + pct + '%;"></div></div>' +
        '</div>';
      }).join("");
      DOM.seoBreakdown.innerHTML = html;
    }
  }

  function updateCharCount(inputEl, countEl, min, max) {
    if (!inputEl || !countEl) return;
    var len = (inputEl.value || "").length;
    countEl.textContent = len + " chars";
    countEl.className = "char-count" + (len >= min && len <= max ? " good" : len > 0 ? " warn" : "");
  }

  function updateTagCount() {
    if (!DOM.editTags || !DOM.editTagCount) return;
    var tags = DOM.editTags.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    DOM.editTagCount.textContent = tags.length + " tags";
    DOM.editTagCount.className = "char-count" + (tags.length >= 10 && tags.length <= 30 ? " good" : " warn");
  }

  /* =========================================================================
   * SECTION 12: PRIVACY SEGMENT
   * ======================================================================= */
  function initPrivacySeg() {
    if (!DOM.privacySeg) return;
    DOM.privacySeg.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.activePrivacy = btn.dataset.v;
        updatePrivacySeg(state.activePrivacy);
      });
    });
  }

  function updatePrivacySeg(val) {
    if (!DOM.privacySeg) return;
    DOM.privacySeg.querySelectorAll("button").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.v === val));
    });
  }

  /* =========================================================================
   * SECTION 13: OPTIMIZE BUTTON — YOUTUBE DATA → GEMINI PIPELINE
   * ======================================================================= */
  function initOptimizeButton() {
    if (!DOM.optimizeBtn) return;
    DOM.optimizeBtn.addEventListener("click", function () {
      if (!Cfg.hasGeminiKey()) {
        App.toast("Enter Gemini API key first.", "warn");
        DOM.geminiKeyInput && DOM.geminiKeyInput.focus();
        return;
      }
      if (!state.activeVideoId) return;

      if (DOM.optSkeleton)  DOM.optSkeleton.classList.add("show");
      if (DOM.optResult)    DOM.optResult.classList.remove("show");
      if (DOM.progressTrack) DOM.progressTrack.classList.add("show");

      DOM.optimizeBtn.disabled = true;
      DOM.optimizeBtn.innerHTML = '<span class="loader-ring" style="width:14px;height:14px;border-width:2px;"></span> Fetching YouTube Data...';
      setProgress(5, "Connecting to YouTube API...");

      App.runFullOptimization(
        state.activeVideoId,
        { regionCode: Cfg.loadCfg().defaultCountry || "US" },
        function (msg, pct) {
          setProgress(pct, msg);
          DOM.optimizeBtn.innerHTML = '<span class="loader-ring" style="width:14px;height:14px;border-width:2px;"></span> ' + App.esc(msg);
        }
      ).then(function (result) {
        state.activeOptResult = result.optimized;
        state.activeKwData    = result.keywordResearch;

        if (DOM.optSkeleton)  DOM.optSkeleton.classList.remove("show");
        if (DOM.progressTrack) DOM.progressTrack.classList.remove("show");
        DOM.optimizeBtn.disabled = false;
        DOM.optimizeBtn.innerHTML = App.icon("sparkles", "icon-sm") + " Re-Optimize";

        renderOptimizationResult(result);
        updateSeoScoreDisplay(result.seoScore);
        App.toast("\u26a1 Optimized! New SEO Score: " + result.seoScore.total, "info");
      }).catch(function (err) {
        if (DOM.optSkeleton)  DOM.optSkeleton.classList.remove("show");
        if (DOM.progressTrack) DOM.progressTrack.classList.remove("show");
        DOM.optimizeBtn.disabled = false;
        DOM.optimizeBtn.innerHTML = App.icon("sparkles", "icon-sm") + " Optimize with AI";
        var msg = err.message === "NO_GEMINI_KEY" ? "No Gemini API key." : err.message;
        App.toast("Optimization failed: " + msg, "err", 6000);
        setProgress(0, "");
      });
    });
  }

  function setProgress(pct, msg) {
    if (DOM.progressFill) DOM.progressFill.style.width = Math.max(2, pct) + "%";
    if (DOM.progressMsg)  DOM.progressMsg.textContent = msg || "";
  }

  /* =========================================================================
   * SECTION 14: OPTIMIZATION RESULT RENDERING
   * ======================================================================= */
  function renderOptimizationResult(result) {
    var opt = result.optimized || {};

    /* Titles block */
    if (DOM.optTitles) {
      var allTitles = [opt.optimizedTitle].concat(opt.alternativeTitles || []).filter(Boolean);
      DOM.optTitles.innerHTML = allTitles.map(function (title, idx) {
        var len    = (title || "").length;
        var lenCls = (len >= 50 && len <= 70) ? "good" : "warn";
        return '<button class="title-option' + (idx === 0 ? " selected" : "") + '" data-title="' + App.esc(title) + '">' +
          '<span class="title-option__num">' + (idx + 1) + '</span>' +
          '<span class="title-option__text">' + App.esc(title) + '</span>' +
          '<span class="title-option__len ' + lenCls + '">' + len + 'ch</span>' +
        '</button>';
      }).join("");

      DOM.optTitles.querySelectorAll(".title-option").forEach(function (btn) {
        btn.addEventListener("click", function () {
          DOM.optTitles.querySelectorAll(".title-option").forEach(function (b) { b.classList.remove("selected"); });
          btn.classList.add("selected");
          if (DOM.editTitle) DOM.editTitle.value = btn.dataset.title || "";
          scheduleSeoUpdate();
          App.toast("Title applied.", "info");
        });
      });
    }

    /* Description */
    if (DOM.optDesc) DOM.optDesc.textContent = opt.optimizedDescription || "";
    if (DOM.copyDescBtn) {
      DOM.copyDescBtn.onclick = function () {
        if (DOM.editDesc) { DOM.editDesc.value = opt.optimizedDescription || ""; scheduleSeoUpdate(); }
        App.copyToClipboard(opt.optimizedDescription || "");
        App.toast("Description applied & copied!");
      };
    }
    if (DOM.copyTitleBtn) {
      DOM.copyTitleBtn.onclick = function () {
        var sel   = DOM.optTitles && DOM.optTitles.querySelector(".title-option.selected");
        var title = (sel && sel.dataset.title) || opt.optimizedTitle || "";
        if (DOM.editTitle) { DOM.editTitle.value = title; scheduleSeoUpdate(); }
        App.copyToClipboard(title);
        App.toast("Title applied & copied!");
      };
    }

    /* Tags */
    if (DOM.optTags) {
      var tags = opt.optimizedTags || [];
      DOM.optTags.innerHTML = tags.map(function (tag) {
        return '<span class="pill pill--tag">' + App.esc(tag) + '</span>';
      }).join("");
      DOM.optTags.querySelectorAll(".pill").forEach(function (pill) {
        pill.addEventListener("click", function () {
          if (!DOM.editTags) return;
          var text    = pill.textContent.trim();
          var current = DOM.editTags.value.trim();
          var existing = current.split(",").map(function (t) { return t.trim(); });
          if (existing.indexOf(text) < 0) {
            DOM.editTags.value = current ? current + ", " + text : text;
          }
          pill.classList.toggle("selected");
          scheduleSeoUpdate();
          App.toast('Tag "' + text + '" added.', "info");
        });
      });
    }
    if (DOM.copyTagsBtn) {
      DOM.copyTagsBtn.onclick = function () {
        var tagStr = (opt.optimizedTags || []).join(", ");
        if (DOM.editTags) { DOM.editTags.value = tagStr; scheduleSeoUpdate(); }
        App.copyToClipboard(tagStr);
        App.toast("All tags applied & copied!");
      };
    }

    /* Hashtags */
    if (DOM.optHashtags) {
      var hashes = [opt.hashtag].concat(opt.supportingHashtags || []).filter(Boolean);
      DOM.optHashtags.innerHTML = hashes.map(function (h) {
        return '<span class="pill pill--hash">' + App.esc(h) + '</span>';
      }).join("");
    }

    /* Strategy note */
    if (DOM.optStrategy) DOM.optStrategy.textContent = opt.keywordStrategy || "";

    if (DOM.optResult) DOM.optResult.classList.add("show");
  }

  /* =========================================================================
   * SECTION 15: SAVE TO YOUTUBE BUTTON
   * ======================================================================= */
  function initSaveToYouTubeButton() {
    if (!DOM.saveYTBtn) return;
    DOM.saveYTBtn.addEventListener("click", function () {
      if (!state.activeVideoId) return;
      var title = DOM.editTitle ? DOM.editTitle.value.trim() : "";
      var desc  = DOM.editDesc  ? DOM.editDesc.value.trim()  : "";
      var tags  = DOM.editTags  ? DOM.editTags.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean) : [];

      if (!title) { App.toast("Title cannot be empty.", "warn"); return; }

      DOM.saveYTBtn.disabled = true;
      DOM.saveYTBtn.innerHTML = '<span class="loader-ring" style="width:14px;height:14px;border-width:2px;"></span> Saving...';
      if (DOM.saveYTStatus) DOM.saveYTStatus.textContent = "Uploading to YouTube API...";

      var catId = (state.activeVideoData && state.activeVideoData.snippet && state.activeVideoData.snippet.categoryId) || "22";
      App.updateVideoOnYouTube(state.activeVideoId, { title: title, description: desc, tags: tags, categoryId: catId })
        .then(function () {
          var origPrivacy = (state.activeVideoData && state.activeVideoData.status && state.activeVideoData.status.privacyStatus) || "public";
          if (state.activePrivacy !== origPrivacy) {
            return App.updateVideoPrivacy(state.activeVideoId, state.activePrivacy);
          }
        })
        .then(function () {
          DOM.saveYTBtn.disabled = false;
          DOM.saveYTBtn.innerHTML = App.icon("check", "icon-sm") + " Saved!";
          if (DOM.saveYTStatus) DOM.saveYTStatus.textContent = "\u2713 Updated on YouTube successfully.";
          App.toast("\u2713 Video updated on YouTube!");

          /* Patch local state so the card in the grid reflects changes */
          if (state.activeVideoData) {
            if (!state.activeVideoData.snippet) state.activeVideoData.snippet = {};
            state.activeVideoData.snippet.title       = title;
            state.activeVideoData.snippet.description = desc;
            state.activeVideoData.snippet.tags        = tags;
            if (!state.activeVideoData.status) state.activeVideoData.status = {};
            state.activeVideoData.status.privacyStatus = state.activePrivacy;
          }

          /* Replace the card in the grid */
          var cardEl = DOM.videoGrid && DOM.videoGrid.querySelector('[data-video-id="' + state.activeVideoId + '"]');
          if (cardEl && state.activeVideoData) {
            var newCard = buildVideoCard(state.activeVideoData, 0);
            cardEl.parentNode.replaceChild(newCard, cardEl);
          }

          setTimeout(function () {
            DOM.saveYTBtn.innerHTML = App.icon("save", "icon-sm") + " Save to YouTube";
          }, 3500);
        })
        .catch(function (err) {
          DOM.saveYTBtn.disabled = false;
          DOM.saveYTBtn.innerHTML = App.icon("save", "icon-sm") + " Save to YouTube";
          if (DOM.saveYTStatus) DOM.saveYTStatus.textContent = "\u2717 Error: " + err.message;
          App.toast("Save failed: " + err.message, "err", 5000);
        });
    });
  }

  /* =========================================================================
   * SECTION 16: KEYWORD RESEARCH PANEL
   * ======================================================================= */
  function loadKeywordResearch() {
    if (!state.activeVideoId) return;
    var query = DOM.kwInput ? DOM.kwInput.value.trim() : "";
    if (!query) {
      var s = (state.activeVideoData && state.activeVideoData.snippet) || {};
      query = (s.title || "").split(" ").slice(0, 4).join(" ");
      if (DOM.kwInput) DOM.kwInput.value = query;
    }
    if (query) runKwResearch(query);
  }

  function initKwPanel() {
    if (!DOM.kwSearchBtn || !DOM.kwInput) return;
    DOM.kwSearchBtn.addEventListener("click", function () {
      var q = DOM.kwInput.value.trim();
      if (!q) { App.toast("Enter a keyword.", "warn"); return; }
      runKwResearch(q);
    });
    DOM.kwInput.addEventListener("keydown", function (e) { if (e.key === "Enter") DOM.kwSearchBtn.click(); });
  }

  function runKwResearch(query) {
    if (DOM.kwSkeleton) DOM.kwSkeleton.classList.add("show");
    if (DOM.kwResults)  DOM.kwResults.innerHTML = "";
    if (DOM.kwRelated)  DOM.kwRelated.innerHTML = "";
    if (DOM.kwSearchBtn) { DOM.kwSearchBtn.disabled = true; DOM.kwSearchBtn.innerHTML = '<span class="loader-ring" style="width:14px;height:14px;border-width:2px;"></span>'; }

    var catId = state.activeVideoData && state.activeVideoData.snippet && state.activeVideoData.snippet.categoryId;
    App.runKeywordResearch(query, { categoryId: catId })
      .then(function (data) {
        state.activeKwData = data;
        if (DOM.kwSkeleton) DOM.kwSkeleton.classList.remove("show");
        if (DOM.kwSearchBtn) { DOM.kwSearchBtn.disabled = false; DOM.kwSearchBtn.innerHTML = App.icon("search", "icon-sm") + " Search"; }
        renderKwResults(data);
        triggerSeoScoreUpdate();
      })
      .catch(function (err) {
        if (DOM.kwSkeleton) DOM.kwSkeleton.classList.remove("show");
        if (DOM.kwSearchBtn) { DOM.kwSearchBtn.disabled = false; DOM.kwSearchBtn.innerHTML = App.icon("search", "icon-sm") + " Search"; }
        if (DOM.kwResults) DOM.kwResults.innerHTML = '<div class="info-box"><span>' + App.esc(err.message) + '</span></div>';
        App.toast("Keyword research failed: " + err.message, "err");
      });
  }

  function renderKwResults(data) {
    var kws = data.keywords || [];
    if (!kws.length) {
      if (DOM.kwResults) DOM.kwResults.innerHTML = '<p class="text-muted" style="padding:12px;font-size:12px;">No keywords found.</p>';
      return;
    }
    var rows = kws.map(function (kw) {
      var vol  = kw.searchVolume  || "?";
      var comp = kw.competition   || "?";
      var volCls  = vol === "High" || vol === "Very High" ? "kw-badge--high-vol"  : vol === "Medium" ? "kw-badge--med-vol"  : "kw-badge--low-vol";
      var compCls = comp === "High"                       ? "kw-badge--high-comp" : comp === "Medium" ? "kw-badge--med-comp" : "kw-badge--low-comp";
      var opp = kw.opportunityScore || 0;
      return '<tr>' +
        '<td><span class="kw-kw">' + App.esc(kw.keyword) + '</span>' +
          (kw.inTrending ? ' <span class="kw-badge kw-badge--trending">#trend</span>' : "") + '</td>' +
        '<td><span class="kw-badge ' + volCls + '">' + App.esc(vol) + '</span></td>' +
        '<td><span class="kw-badge ' + compCls + '">' + App.esc(comp) + '</span></td>' +
        '<td><span class="opp-bar"><span class="opp-bar__fill" style="width:' + opp + '%;"></span></span>' +
          '<b style="font-size:11px;color:var(--cyan);">' + opp + '</b></td>' +
      '</tr>';
    }).join("");

    if (DOM.kwResults) {
      DOM.kwResults.innerHTML = '<table class="kw-table"><thead><tr>' +
        '<th>Keyword (YouTube Data)</th><th>Volume</th><th>Competition</th><th>Opportunity</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>';
      DOM.kwResults.querySelectorAll(".kw-kw").forEach(function (el) {
        el.style.cursor = "pointer";
        el.addEventListener("click", function () {
          if (DOM.kwInput) DOM.kwInput.value = el.textContent.trim();
          App.toast("Keyword set: " + el.textContent.trim(), "info");
        });
      });
    }

    if (DOM.kwRelated && data.relatedTags && data.relatedTags.length) {
      DOM.kwRelated.innerHTML = '<div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;font-family:var(--font-sans);">Related tags from trending videos</div>' +
        '<div class="pill-wrap">' +
        data.relatedTags.slice(0, 22).map(function (tag) {
          return '<span class="pill pill--tag">' + App.esc(tag) + '</span>';
        }).join("") + '</div>';
      DOM.kwRelated.querySelectorAll(".pill").forEach(function (pill) {
        pill.addEventListener("click", function () {
          if (!DOM.editTags) return;
          var text = pill.textContent.trim();
          var cur  = DOM.editTags.value.trim();
          var arr  = cur.split(",").map(function (t) { return t.trim(); });
          if (arr.indexOf(text) < 0) DOM.editTags.value = cur ? cur + ", " + text : text;
          pill.classList.toggle("selected");
          scheduleSeoUpdate();
        });
      });
    }
  }

  /* =========================================================================
   * SECTION 17: HISTORY TAB
   * ======================================================================= */
  function renderOptHistory() {
    if (!DOM.panelHistory) return;
    var history = Cfg.loadHistory();
    if (!history.length) {
      DOM.panelHistory.innerHTML = '<div class="info-box" style="margin:16px;">' + App.icon("activity", "icon-sm") + '<span>No history yet.</span></div>';
      return;
    }
    DOM.panelHistory.innerHTML = '<div style="padding:12px;display:flex;flex-direction:column;gap:8px;">' +
      history.slice(0, 30).map(function (h) {
        var ts = h.timestamp ? new Date(h.timestamp).toLocaleString() : "";
        return '<div class="opt-block">' +
          '<div class="opt-block__head"><div class="opt-block__head-left">' +
            App.icon("activity", "icon-sm") + App.esc((h.optimizedTitle || h.originalTitle || h.videoId || "?").slice(0, 60)) +
          '</div><span style="font-size:10px;color:var(--text-muted);">' + App.esc(ts) + '</span></div>' +
          '<div class="opt-block__body" style="font-size:11.5px;font-family:var(--font-sans);color:var(--text-secondary);">' +
            'Score: <span style="color:var(--text-muted);">' + (h.originalScore||"?") + '</span> \u2192 ' +
            '<span style="color:var(--green);font-weight:800;">' + (h.newScore||"?") + '</span>' +
          '</div></div>';
      }).join("") + '</div>';
  }

  /* =========================================================================
   * SECTION 18: AUTO-PILOT PANEL
   * ======================================================================= */
  function onAPUpdate(ev) {
    if (!DOM.apLog) return;
    var cls = ev.phase === "error" ? "err" : ev.phase === "complete" || ev.phase === "updated" ? "done" : ev.phase === "idle" ? "info" : "";
    var line = document.createElement("span");
    line.className = "ap-log-line" + (cls ? " " + cls : "");
    var ts = new Date().toLocaleTimeString();
    line.textContent = "[" + ts + "] " + (ev.message || ev.phase || "");
    DOM.apLog.insertBefore(line, DOM.apLog.firstChild);

    /* Trim log */
    var lines = DOM.apLog.querySelectorAll(".ap-log-line");
    for (var i = 80; i < lines.length; i++) { lines[i].remove(); }

    /* Update stats */
    var apState = Cfg.loadAutoPilotState();
    if (DOM.apStatProcessed) DOM.apStatProcessed.textContent = apState.totalProcessed || 0;
    if (DOM.apStatUpdated)   DOM.apStatUpdated.textContent   = apState.totalUpdated   || 0;
    if (DOM.apStatErrors)    DOM.apStatErrors.textContent    = (apState.lastCycleResults && apState.lastCycleResults.errors && apState.lastCycleResults.errors.length) || 0;
  }

  function updateAPCardState(active) {
    if (!DOM.apCard) return;
    DOM.apCard.classList.toggle("active", active);
    if (DOM.apState) DOM.apState.querySelector("span") && (DOM.apState.querySelector("span").textContent = active ? "RUNNING" : "IDLE");
    if (DOM.apDot) DOM.apDot.className = "ap-dot";
  }

  function initAutoPilotPanel() {
    var apCfg   = Cfg.getAutoPilotConfig();
    var apState = Cfg.loadAutoPilotState();

    if (DOM.apThreshold) DOM.apThreshold.value = apCfg.scoreThreshold   || 65;
    if (DOM.apMaxVideos) DOM.apMaxVideos.value  = apCfg.maxVideosPerRun  || 5;
    if (DOM.apInterval)  DOM.apInterval.value   = apCfg.intervalMinutes  || 60;
    if (DOM.apToggle)    DOM.apToggle.checked   = apCfg.enabled;
    if (DOM.apStatProcessed) DOM.apStatProcessed.textContent = apState.totalProcessed || 0;
    if (DOM.apStatUpdated)   DOM.apStatUpdated.textContent   = apState.totalUpdated   || 0;
    if (DOM.apStatErrors)    DOM.apStatErrors.textContent    = (apState.lastCycleResults && apState.lastCycleResults.errors && apState.lastCycleResults.errors.length) || 0;

    updateAPCardState(apCfg.enabled);

    if (DOM.apToggle) {
      DOM.apToggle.addEventListener("change", function () {
        var enabled = DOM.apToggle.checked;
        if (enabled) {
          if (!Cfg.hasGeminiKey())  { App.toast("Set Gemini API key first.",   "warn"); DOM.apToggle.checked = false; return; }
          if (!Cfg.isOAuthValid())  { App.toast("Connect YouTube first.",       "warn"); DOM.apToggle.checked = false; return; }
          state.autoPilotActive = true;
          updateAPCardState(true);
          App.startAutoPilot(onAPUpdate);
          App.toast("\u26a1 Auto-Pilot ENGAGED!", "info");
        } else {
          state.autoPilotActive = false;
          updateAPCardState(false);
          App.stopAutoPilot();
          App.toast("Auto-Pilot stopped.", "warn");
        }
      });
    }

    if (DOM.apRunNowBtn) {
      DOM.apRunNowBtn.addEventListener("click", function () {
        if (!Cfg.hasGeminiKey()) { App.toast("Set Gemini API key first.", "warn"); return; }
        if (!Cfg.isOAuthValid()) { App.toast("Connect YouTube first.",    "warn"); return; }
        DOM.apRunNowBtn.disabled = true;
        DOM.apRunNowBtn.innerHTML = '<span class="loader-ring" style="width:14px;height:14px;border-width:2px;"></span> Running...';
        updateAPCardState(true);
        App.runAutoPilotCycle(onAPUpdate)
          .then(function () {
            DOM.apRunNowBtn.disabled = false;
            DOM.apRunNowBtn.innerHTML = App.icon("zap", "icon-sm") + " Run Now";
            if (!state.autoPilotActive) updateAPCardState(false);
          })
          .catch(function (err) {
            DOM.apRunNowBtn.disabled = false;
            DOM.apRunNowBtn.innerHTML = App.icon("zap", "icon-sm") + " Run Now";
            if (!state.autoPilotActive) updateAPCardState(false);
            App.toast("Cycle error: " + err.message, "err");
          });
      });
    }

    if (DOM.apSaveCfgBtn) {
      DOM.apSaveCfgBtn.addEventListener("click", function () {
        Cfg.saveCfg({
          autoPilotScoreThreshold:  parseInt(DOM.apThreshold && DOM.apThreshold.value, 10) || 65,
          autoPilotMaxVideosPerRun: parseInt(DOM.apMaxVideos && DOM.apMaxVideos.value, 10) || 5,
          autoPilotIntervalMinutes: parseInt(DOM.apInterval  && DOM.apInterval.value,  10) || 60
        });
        App.toast("Auto-Pilot config saved.", "info");
      });
    }
  }

  /* =========================================================================
   * SECTION 19: MOUSE GLOW EFFECT ON BUTTONS
   * ======================================================================= */
  function initMouseGlowOnButtons() {
    document.addEventListener("mousemove", function (e) {
      var btns = document.querySelectorAll(".btn");
      btns.forEach(function (btn) {
        var rect = btn.getBoundingClientRect();
        var x = ((e.clientX - rect.left) / rect.width) * 100;
        var y = ((e.clientY - rect.top)  / rect.height) * 100;
        btn.style.setProperty("--mx", x + "%");
        btn.style.setProperty("--my", y + "%");
      });
    }, { passive: true });
  }

  /* =========================================================================
   * SECTION 20: APPLICATION BOOT
   * ======================================================================= */
  function boot() {
    /* Check for OAuth callback in URL hash */
    if (App.handleOAuthCallback()) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    /* Cache DOM */
    cacheDOM();

    /* Init all panels */
    initGeminiPanel();
    initOAuthButtons();
    initFilterSort();
    initModalEvents();
    initModalTabs();
    initSeoScoreListeners();
    initPrivacySeg();
    initOptimizeButton();
    initSaveToYouTubeButton();
    initKwPanel();
    initAutoPilotPanel();
    initMouseGlowOnButtons();

    /* Start visual effects */
    App.startTicker(DOM.tickerTrack);
    App.initMatrixRain("matrixCanvas");
    App.initScanLines();

    /* Hydrate inline icons */
    App.hydrateIcons();

    /* Show correct section based on auth state */
    if (Cfg.isOAuthValid()) {
      showChannelSection();
      loadChannelData();
    } else {
      showAuthSection();
    }

    /* Restore auto-pilot if it was active */
    var apCfg = Cfg.getAutoPilotConfig();
    if (apCfg.enabled && Cfg.isOAuthValid() && Cfg.hasGeminiKey()) {
      state.autoPilotActive = true;
      updateAPCardState(true);
      App.startAutoPilot(onAPUpdate);
    }

    /* Flash brand title with glitch on load */
    setTimeout(function () {
      var brandTitle = document.querySelector(".brand__title");
      if (brandTitle) App.applyGlitchEffect(brandTitle, 1000);
    }, 500);

    console.log("%c\u2605 YouTube Auto-Pilot SEO Studio ★", "color:#00FFFF;font-size:16px;font-weight:bold;font-family:monospace;");
    console.log("%cArchitecture: YouTube Data First \u2192 Gemini Processes \u2192 Output", "color:#00FF41;font-size:12px;font-family:monospace;");
  }

  /* Boot when DOM is ready */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})(window);
