/* ==========================================================================
 * app.js — YouTube Auto-Pilot SEO Studio — Core Engine
 *
 * Exposes window.YTSeoApp (aliased as "App" inside dashboard.js).
 *
 *  - Google OAuth (Google Identity Services, browser-only, no backend)
 *  - YouTube Data API v3 calls (channel, videos, search, update)
 *  - Gemini API calls (title/description/tag optimization, JSON output)
 *  - SEO scoring engine
 *  - Small UI-FX helpers used by dashboard.js (toast, icons, matrix rain...)
 *
 * >>> SETUP: paste your own Google OAuth Client ID below <<<
 * Get one free at https://console.cloud.google.com/auth/clients
 * (Application type: "Web application", add your site's URL under
 *  "Authorised JavaScript origins", e.g. http://localhost:5500 or
 *  https://yourname.github.io)
 * ========================================================================== */
(function (global) {
  "use strict";

  /* =========================================================================
   * 0. CONFIG — EDIT THIS
   * ======================================================================= */
  var YT_CLIENT_ID = "375143606312-529rvbr4p6oldp0hmhsnjtobbttvj5s2.apps.googleusercontent.com";
  var YT_SCOPES     = "https://www.googleapis.com/auth/youtube";

  var Cfg = global.YTSeoSettings;

  var YT_API   = "https://www.googleapis.com/youtube/v3/";
  var GEM_API  = "https://generativelanguage.googleapis.com/v1beta/models/";

  var gisLoadedPromise = null;
  var tokenClient = null;
  var autoPilotTimer = null;

  /* =========================================================================
   * 1. HTML ESCAPE / CLIPBOARD
   * ======================================================================= */
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text || "").catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text || "";
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  /* =========================================================================
   * 2. ICON SYSTEM (inline feather-style SVG paths)
   * ======================================================================= */
  var ICONS = {
    play:      '<polygon points="5 3 19 12 5 21 5 3"/>',
    lock:      '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    eye:       '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    check:     '<polyline points="20 6 9 17 4 12"/>',
    refresh:   '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    save:      '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    search:    '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    sparkles:  '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4"/>',
    tag:       '<path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    trending:  '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    zap:       '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    bolt:      '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    activity:  '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    alert:     '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
  };

  function icon(name, cls) {
    var body = ICONS[name] || ICONS.activity;
    return '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24">' + body + '</svg>';
  }

  function hydrateIcons() {
    var els = document.querySelectorAll("[data-icon]");
    els.forEach(function (el) {
      el.innerHTML = icon(el.dataset.icon, el.dataset.iconClass || "icon-sm");
    });
  }

  /* =========================================================================
   * 3. TOAST NOTIFICATIONS
   * ======================================================================= */
  var toastWrap = null;
  function ensureToastWrap() {
    if (toastWrap && document.body.contains(toastWrap)) return toastWrap;
    toastWrap = document.createElement("div");
    toastWrap.className = "toast-wrap";
    document.body.appendChild(toastWrap);
    return toastWrap;
  }

  function toast(msg, type, duration) {
    type = type || "info";
    duration = duration || 3200;
    var wrap = ensureToastWrap();
    var el = document.createElement("div");
    el.className = "toast " + type;
    var iconName = type === "err" ? "alert" : type === "warn" ? "alert" : "check";
    el.innerHTML = icon(iconName, "icon-sm") + "<span>" + esc(msg) + "</span>";
    wrap.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("show"); });
    setTimeout(function () {
      el.classList.remove("show");
      setTimeout(function () { el.remove(); }, 400);
    }, duration);
  }

  /* =========================================================================
   * 4. VISUAL FX — matrix rain / scanlines / ticker / glitch
   * ======================================================================= */
  function initMatrixRain(canvasId) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var chars = "01アイウエオカキクケコサシスセソタチツテト";
    var fontSize = 14;
    var columns, drops;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = Math.floor(canvas.width / fontSize);
      drops = new Array(columns).fill(1);
    }
    resize();
    window.addEventListener("resize", resize, { passive: true });

    function draw() {
      ctx.fillStyle = "rgba(8,8,15,0.06)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#00FF41";
      ctx.font = fontSize + "px monospace";
      for (var i = 0; i < drops.length; i++) {
        var text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }
    setInterval(draw, 50);
  }

  function initScanLines() {
    if (document.querySelector(".scan-lines")) return;
    var el = document.createElement("div");
    el.className = "scan-lines";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }

  var TICKER_TIPS = [
    "Titles between 50-70 characters rank best",
    "Use your main keyword in the first 25 words of the description",
    "10-30 relevant tags improve discoverability",
    "Hashtags in description also count toward SEO",
    "Consistent upload schedule boosts channel authority",
    "High CTR thumbnails outperform keyword stuffing",
    "Watch-time retention is the #1 ranking signal",
    "Playlists increase session watch time"
  ];
  function startTicker(trackEl) {
    if (!trackEl) return;
    var html = TICKER_TIPS.concat(TICKER_TIPS).map(function (t) {
      return '<span class="ticker__item">' + esc(t) + '</span>';
    }).join('<span class="ticker__dot">&bull;</span>');
    trackEl.innerHTML = html;
  }

  function applyGlitchEffect(el, duration) {
    if (!el) return;
    el.classList.add("glitching");
    setTimeout(function () { el.classList.remove("glitching"); }, duration || 800);
  }

  /* =========================================================================
   * 5. SEO SCORE ENGINE
   * ======================================================================= */
  function calculateSEOScore(title, description, tags, kwTargets) {
    title = title || ""; description = description || ""; tags = tags || []; kwTargets = kwTargets || [];
    var breakdown = {};

    /* Title length — max 20 */
    var tLen = title.length;
    var titleLenScore = tLen >= 50 && tLen <= 70 ? 20 : tLen >= 30 && tLen < 50 ? 14 : tLen > 0 ? 8 : 0;
    breakdown.titleLength = { score: titleLenScore, max: 20 };

    /* Keyword in title — max 20 */
    var kwInTitle = 0;
    if (kwTargets.length) {
      var titleLc = title.toLowerCase();
      var hit = kwTargets.some(function (k) { return k && titleLc.indexOf(String(k).toLowerCase()) >= 0; });
      kwInTitle = hit ? 20 : 4;
    } else {
      kwInTitle = tLen > 0 ? 10 : 0;
    }
    breakdown.keywordInTitle = { score: kwInTitle, max: 20 };

    /* Description — max 25 */
    var dLen = description.length;
    var descScore = dLen >= 200 ? 20 : dLen >= 100 ? 13 : dLen > 0 ? 6 : 0;
    if (kwTargets.length) {
      var descLc = description.toLowerCase();
      var firstChunk = description.split(/\s+/).slice(0, 25).join(" ").toLowerCase();
      if (kwTargets.some(function (k) { return k && firstChunk.indexOf(String(k).toLowerCase()) >= 0; })) descScore += 5;
      else if (kwTargets.some(function (k) { return k && descLc.indexOf(String(k).toLowerCase()) >= 0; })) descScore += 2;
    }
    descScore = Math.min(25, descScore);
    breakdown.description = { score: descScore, max: 25 };

    /* Tags — max 20 */
    var tagCount = tags.length;
    var tagScore = tagCount >= 10 && tagCount <= 30 ? 20 : tagCount >= 5 ? 13 : tagCount > 0 ? 6 : 0;
    breakdown.tags = { score: tagScore, max: 20 };

    /* Hashtags in description — max 15 */
    var hashCount = (description.match(/#[\w]+/g) || []).length;
    var hashScore = hashCount >= 1 && hashCount <= 3 ? 15 : hashCount > 3 ? 8 : 0;
    breakdown.hashtag = { score: hashScore, max: 15 };

    var total = titleLenScore + kwInTitle + descScore + tagScore + hashScore;
    var grade = total >= 85 ? "A" : total >= 70 ? "B" : total >= 50 ? "C" : "D";
    var color = grade === "A" ? "#00FF41" : grade === "B" ? "#00FFFF" : grade === "C" ? "#FFB800" : "#FF3355";

    return { total: total, grade: grade, color: color, breakdown: breakdown };
  }

  /* =========================================================================
   * 6. OAUTH (Google Identity Services — token flow, no backend/secret)
   * ======================================================================= */
  function ensureGisLoaded() {
    if (gisLoadedPromise) return gisLoadedPromise;
    gisLoadedPromise = new Promise(function (resolve, reject) {
      if (global.google && global.google.accounts && global.google.accounts.oauth2) {
        resolve(); return;
      }
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true; s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Could not load Google Identity Services script.")); };
      document.head.appendChild(s);
    });
    return gisLoadedPromise;
  }

  function initiateOAuth() {
    return new Promise(function (resolve, reject) {
      if (!YT_CLIENT_ID || YT_CLIENT_ID.indexOf("YOUR_") === 0) {
        reject(new Error("No Google OAuth Client ID configured in app.js"));
        return;
      }
      ensureGisLoaded().then(function () {
        tokenClient = global.google.accounts.oauth2.initTokenClient({
          client_id: YT_CLIENT_ID,
          scope: YT_SCOPES,
          callback: function (resp) {
            if (!resp || resp.error) {
              reject(new Error((resp && resp.error) || "OAuth was cancelled or denied"));
              return;
            }
            Cfg.saveOAuthToken(resp.access_token, resp.expires_in, resp.scope);
            resolve(resp);
          },
          error_callback: function (err) {
            reject(new Error((err && err.type) || "OAuth failed"));
          }
        });
        tokenClient.requestAccessToken({ prompt: "consent" });
      }).catch(reject);
    });
  }

  function revokeOAuth() {
    var token = Cfg.getAccessToken();
    Cfg.clearOAuthToken();
    if (token && global.google && global.google.accounts && global.google.accounts.oauth2) {
      try { global.google.accounts.oauth2.revoke(token, function () {}); } catch (e) {}
    }
  }

  function handleOAuthCallback() {
    /* Kept for compatibility with redirect-style flows. The token-client
     * popup flow above resolves via its callback and never touches the
     * URL, so this is normally a no-op. */
    if (window.location.hash && window.location.hash.indexOf("access_token=") >= 0) {
      var params = new URLSearchParams(window.location.hash.slice(1));
      var token = params.get("access_token");
      var expiresIn = params.get("expires_in");
      if (token) {
        Cfg.saveOAuthToken(token, parseInt(expiresIn, 10) || 3600, params.get("scope"));
        return true;
      }
    }
    return false;
  }

  /* =========================================================================
   * 7. YOUTUBE DATA API v3 — thin fetch wrapper
   * ======================================================================= */
  function ytFetch(path, params, method, body) {
    if (!Cfg.isOAuthValid()) return Promise.reject(new Error("Not connected to YouTube. Please reconnect."));
    var qs = new URLSearchParams(params || {}).toString();
    var url = YT_API + path + (qs ? "?" + qs : "");
    return fetch(url, {
      method: method || "GET",
      headers: Object.assign(
        { "Authorization": "Bearer " + Cfg.getAccessToken() },
        body ? { "Content-Type": "application/json" } : {}
      ),
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      if (res.status === 401) { Cfg.clearOAuthToken(); throw new Error("Session expired. Please reconnect YouTube."); }
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          var msg = (j.error && j.error.message) || ("YouTube API error " + res.status);
          throw new Error(msg);
        });
      }
      if (res.status === 204) return {};
      return res.json();
    });
  }

  function loadChannelAndVideos(progressCb) {
    return ytFetch("channels", { part: "snippet,statistics,contentDetails", mine: "true" })
      .then(function (chRes) {
        var channel = chRes.items && chRes.items[0];
        if (!channel) throw new Error("No YouTube channel found for this Google account.");
        var uploadsId = channel.contentDetails &&
          channel.contentDetails.relatedPlaylists &&
          channel.contentDetails.relatedPlaylists.uploads;
        if (!uploadsId) throw new Error("Could not find this channel's uploads playlist.");

        var totalVideos = parseInt((channel.statistics && channel.statistics.videoCount) || "0", 10);
        var videoIds = [];

        function fetchPlaylistPage(pageToken) {
          return ytFetch("playlistItems", {
            part: "contentDetails",
            playlistId: uploadsId,
            maxResults: "50",
            pageToken: pageToken || ""
          }).then(function (plRes) {
            (plRes.items || []).forEach(function (it) {
              if (it.contentDetails && it.contentDetails.videoId) videoIds.push(it.contentDetails.videoId);
            });
            if (progressCb) progressCb(videoIds.length, totalVideos);
            if (plRes.nextPageToken && videoIds.length < 500) return fetchPlaylistPage(plRes.nextPageToken);
          });
        }

        return fetchPlaylistPage().then(function () {
          return fetchVideosByIds(videoIds).then(function (videos) {
            return { channel: channel, videos: videos };
          });
        });
      });
  }

  function fetchVideosByIds(ids) {
    var batches = [];
    for (var i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
    var all = [];
    return batches.reduce(function (chain, batch) {
      return chain.then(function () {
        return ytFetch("videos", { part: "snippet,statistics,contentDetails,status", id: batch.join(",") })
          .then(function (res) { all = all.concat(res.items || []); });
      });
    }, Promise.resolve()).then(function () { return all; });
  }

  function updateVideoOnYouTube(videoId, data) {
    return ytFetch("videos", { part: "snippet" }, "PUT", {
      id: videoId,
      snippet: {
        title: data.title,
        description: data.description,
        tags: data.tags,
        categoryId: data.categoryId || "22"
      }
    });
  }

  function updateVideoPrivacy(videoId, privacyStatus) {
    return ytFetch("videos", { part: "status" }, "PUT", {
      id: videoId,
      status: { privacyStatus: privacyStatus }
    });
  }

  /* =========================================================================
   * 8. KEYWORD RESEARCH (approximated from real YouTube search results —
   *    the Data API does not expose raw search-volume numbers, so volume /
   *    competition are heuristics derived from view counts & result density)
   * ======================================================================= */
  function runKeywordResearch(query, opts) {
    opts = opts || {};
    return ytFetch("search", {
      part: "snippet", q: query, type: "video", maxResults: "25", order: "relevance",
      videoCategoryId: opts.categoryId || ""
    }).then(function (searchRes) {
      var items = searchRes.items || [];
      var ids = items.map(function (it) { return it.id.videoId; }).filter(Boolean);
      if (!ids.length) return { keywords: [], relatedTags: [] };

      return fetchVideosByIds(ids).then(function (videos) {
        var totalViews = 0, tagFreq = {};
        videos.forEach(function (v) {
          totalViews += parseInt((v.statistics && v.statistics.viewCount) || "0", 10);
          ((v.snippet && v.snippet.tags) || []).forEach(function (t) {
            var k = t.toLowerCase();
            tagFreq[k] = (tagFreq[k] || 0) + 1;
          });
        });
        var avgViews = totalViews / videos.length;
        var volume = avgViews > 300000 ? "High" : avgViews > 40000 ? "Medium" : "Low";
        var competition = videos.length >= 20 ? "High" : videos.length >= 10 ? "Medium" : "Low";
        var compScore = competition === "High" ? 75 : competition === "Medium" ? 45 : 20;
        var volScore  = volume === "High" ? 85 : volume === "Medium" ? 55 : 25;
        var opportunity = Math.max(5, Math.min(98, Math.round(volScore * 0.6 - compScore * 0.35 + 40)));

        var relatedTags = Object.keys(tagFreq)
          .sort(function (a, b) { return tagFreq[b] - tagFreq[a]; })
          .slice(0, 25);

        var mainKeyword = {
          keyword: query, searchVolume: volume, competition: competition,
          opportunityScore: opportunity, inTrending: true
        };

        var extra = relatedTags.slice(0, 8).map(function (tag) {
          var freq = tagFreq[tag];
          var v = freq >= 8 ? "High" : freq >= 4 ? "Medium" : "Low";
          var c = freq >= 8 ? "High" : freq >= 3 ? "Medium" : "Low";
          var cs = c === "High" ? 70 : c === "Medium" ? 42 : 18;
          var vs = v === "High" ? 80 : v === "Medium" ? 50 : 22;
          return {
            keyword: tag, searchVolume: v, competition: c,
            opportunityScore: Math.max(5, Math.min(98, Math.round(vs * 0.6 - cs * 0.35 + 40))),
            inTrending: false
          };
        });

        return { keywords: [mainKeyword].concat(extra), relatedTags: relatedTags };
      });
    });
  }

  /* =========================================================================
   * 9. GEMINI CALL
   * ======================================================================= */
  function geminiGenerateJSON(prompt) {
    var cfg = Cfg.loadCfg();
    if (!cfg.geminiKey) return Promise.reject(new Error("NO_GEMINI_KEY"));
    var model = Cfg.getGeminiModel();
    var url = GEM_API + model + ":generateContent?key=" + encodeURIComponent(cfg.geminiKey);

    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.8 }
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          throw new Error((j.error && j.error.message) || ("Gemini API error " + res.status));
        });
      }
      return res.json();
    }).then(function (data) {
      var text = data.candidates && data.candidates[0] && data.candidates[0].content &&
        data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text;
      if (!text) throw new Error("Gemini returned an empty response.");
      var clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
      try { return JSON.parse(clean); }
      catch (e) { throw new Error("Could not parse Gemini's response as JSON."); }
    });
  }

  /* =========================================================================
   * 10. FULL OPTIMIZATION PIPELINE (YouTube data -> Gemini -> SEO score)
   * ======================================================================= */
  function runFullOptimization(videoId, opts, onProgress) {
    opts = opts || {};
    function report(msg, pct) { if (onProgress) onProgress(msg, pct); }

    report("Fetching video details...", 15);
    return fetchVideosByIds([videoId]).then(function (videos) {
      var video = videos[0];
      if (!video) throw new Error("Video not found.");
      var s = video.snippet || {}, stats = video.statistics || {};

      report("Researching trending keywords...", 35);
      var seedQuery = (s.title || "").split(" ").slice(0, 4).join(" ");
      return runKeywordResearch(seedQuery, { categoryId: s.categoryId }).then(function (kwData) {

        report("Asking Gemini to optimize this video...", 60);
        var topKeywords = (kwData.keywords || []).slice(0, 6).map(function (k) { return k.keyword; });
        var prompt = [
          "You are a YouTube SEO expert. Using ONLY the real YouTube data below, optimize this video for discovery.",
          "",
          "CURRENT VIDEO DATA:",
          "Title: " + (s.title || ""),
          "Description: " + (s.description || "").slice(0, 800),
          "Tags: " + ((s.tags || []).join(", ") || "(none)"),
          "Views: " + (stats.viewCount || "0") + " | Likes: " + (stats.likeCount || "0"),
          "Category ID: " + (s.categoryId || "22"),
          "",
          "TRENDING / RELATED KEYWORDS FROM REAL YOUTUBE SEARCH DATA:",
          topKeywords.join(", ") || "(none found)",
          "Related tags seen on similar top-performing videos: " + (kwData.relatedTags || []).slice(0, 15).join(", "),
          "",
          "Respond with ONLY valid JSON (no markdown fences) matching exactly this shape:",
          '{"optimizedTitle": "string, 50-70 chars, includes primary keyword",',
          ' "alternativeTitles": ["string", "string"],',
          ' "optimizedDescription": "string, 200+ chars, keyword in first 25 words, include 1-3 hashtags inline",',
          ' "optimizedTags": ["string", "... 15-25 tags"],',
          ' "hashtag": "#PrimaryHashtag",',
          ' "supportingHashtags": ["#tag1", "#tag2"],',
          ' "primaryKeyword": "string",',
          ' "keywordStrategy": "1-2 sentence explanation of the strategy used"}'
        ].join("\n");

        return geminiGenerateJSON(prompt).then(function (optimized) {
          report("Calculating SEO score...", 90);
          var kwTargets = [optimized.primaryKeyword].concat(topKeywords).filter(Boolean);
          var seoScore = calculateSEOScore(
            optimized.optimizedTitle || "",
            optimized.optimizedDescription || "",
            optimized.optimizedTags || [],
            kwTargets
          );

          var originalScore = calculateSEOScore(s.title || "", s.description || "", s.tags || [], kwTargets);

          Cfg.addHistory({
            videoId: videoId,
            originalTitle: s.title || "",
            optimizedTitle: optimized.optimizedTitle || "",
            originalScore: originalScore.total,
            newScore: seoScore.total
          });

          report("Done.", 100);
          return { optimized: optimized, keywordResearch: kwData, seoScore: seoScore };
        });
      });
    });
  }

  /* =========================================================================
   * 11. AUTO-PILOT
   * ======================================================================= */
  function runAutoPilotCycle(onUpdate) {
    function log(phase, message) { if (onUpdate) onUpdate({ phase: phase, message: message }); }
    var apCfg = Cfg.getAutoPilotConfig();
    var state = Cfg.loadAutoPilotState();
    state.lastCycleResults = { errors: [] };

    log("start", "Auto-Pilot cycle started \u2014 scanning channel...");

    return loadChannelAndVideos().then(function (result) {
      var candidates = result.videos
        .map(function (v) {
          var s = v.snippet || {};
          var score = calculateSEOScore(s.title || "", s.description || "", s.tags || [], []).total;
          return { video: v, score: score };
        })
        .filter(function (c) { return c.score < apCfg.scoreThreshold; })
        .sort(function (a, b) { return a.score - b.score; })
        .slice(0, apCfg.maxVideosPerRun);

      if (!candidates.length) {
        log("idle", "No videos below the score threshold (" + apCfg.scoreThreshold + "). Nothing to do.");
        state.lastRunAt = Date.now();
        Cfg.saveAutoPilotState(state);
        return;
      }

      log("info", "Found " + candidates.length + " video(s) needing optimization.");

      return candidates.reduce(function (chain, c) {
        return chain.then(function () {
          var vid = c.video.id;
          var title = (c.video.snippet && c.video.snippet.title) || vid;
          log("processing", "Optimizing: " + title + " (score " + c.score + ")");

          return runFullOptimization(vid, {}, function () {})
            .then(function (res) {
              var catId = (c.video.snippet && c.video.snippet.categoryId) || "22";
              return updateVideoOnYouTube(vid, {
                title: res.optimized.optimizedTitle,
                description: res.optimized.optimizedDescription,
                tags: res.optimized.optimizedTags,
                categoryId: catId
              }).then(function () {
                state.totalUpdated = (state.totalUpdated || 0) + 1;
                log("updated", "\u2713 Updated: " + title + " \u2192 score " + res.seoScore.total);
              });
            })
            .catch(function (err) {
              state.lastCycleResults.errors.push({ videoId: vid, message: err.message });
              log("error", "\u2717 Failed on \"" + title + "\": " + err.message);
            })
            .then(function () {
              state.totalProcessed = (state.totalProcessed || 0) + 1;
              Cfg.saveAutoPilotState(state);
            });
        });
      }, Promise.resolve());
    }).then(function () {
      state.lastRunAt = Date.now();
      Cfg.saveAutoPilotState(state);
      log("complete", "Auto-Pilot cycle complete.");
    }).catch(function (err) {
      log("error", "Cycle error: " + err.message);
      throw err;
    });
  }

  function startAutoPilot(onUpdate) {
    stopAutoPilot();
    Cfg.setAutoPilotEnabled(true);
    var apCfg = Cfg.getAutoPilotConfig();
    var intervalMs = Math.max(5, apCfg.intervalMinutes) * 60 * 1000;
    autoPilotTimer = setInterval(function () {
      runAutoPilotCycle(onUpdate).catch(function () {});
    }, intervalMs);
  }

  function stopAutoPilot() {
    Cfg.setAutoPilotEnabled(false);
    if (autoPilotTimer) { clearInterval(autoPilotTimer); autoPilotTimer = null; }
  }

  /* =========================================================================
   * EXPORT
   * ======================================================================= */
  global.YTSeoApp = {
    esc: esc,
    copyToClipboard: copyToClipboard,
    icon: icon,
    hydrateIcons: hydrateIcons,
    toast: toast,
    initMatrixRain: initMatrixRain,
    initScanLines: initScanLines,
    startTicker: startTicker,
    applyGlitchEffect: applyGlitchEffect,

    calculateSEOScore: calculateSEOScore,

    initiateOAuth: initiateOAuth,
    revokeOAuth: revokeOAuth,
    handleOAuthCallback: handleOAuthCallback,

    loadChannelAndVideos: loadChannelAndVideos,
    updateVideoOnYouTube: updateVideoOnYouTube,
    updateVideoPrivacy: updateVideoPrivacy,
    runKeywordResearch: runKeywordResearch,
    runFullOptimization: runFullOptimization,

    startAutoPilot: startAutoPilot,
    stopAutoPilot: stopAutoPilot,
    runAutoPilotCycle: runAutoPilotCycle
  };

})(window);
