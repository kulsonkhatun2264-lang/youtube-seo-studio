#!/usr/bin/env node
/**
 * auto-seo.js — YouTube Auto-Pilot SEO Studio — GitHub Actions Node.js Script
 *
 * ARCHITECTURE: YouTube Data First → Gemini Processes → Push to YouTube
 *
 * Gemini NEVER generates from scratch. It receives REAL YouTube data:
 *   - Video metadata from YouTube Data API v3
 *   - YouTube search suggestions for the video topic
 *   - YouTube trending videos for the category
 *   - Real keyword patterns from search results
 * Then Gemini optimizes ONLY based on that real data.
 *
 * Required environment variables (GitHub Secrets):
 *   GEMINI_API_KEY          — Google AI Studio API key
 *   YT_API_KEY              — YouTube Data API v3 key
 *   YT_OAUTH_CLIENT_ID      — OAuth 2.0 client ID
 *   YT_OAUTH_CLIENT_SECRET  — OAuth 2.0 client secret
 *   YT_OAUTH_REFRESH_TOKEN  — Long-lived OAuth2 refresh token
 *   DRY_RUN                 — 'true' to skip YouTube updates (default: 'false')
 *   SCORE_THRESHOLD         — Only process videos below this SEO score (default: 65)
 *   MAX_VIDEOS              — Max videos to process per run (default: 5)
 *   REGION_CODE             — YouTube region code (default: 'US')
 *   GEMINI_MODEL            — Gemini model to use (default: 'gemini-1.5-flash')
 */

"use strict";

const https  = require("https");
const http   = require("http");
const { URL } = require("url");

/* ============================================================================
 * SECTION 1: CONFIGURATION FROM ENVIRONMENT
 * ========================================================================== */
const CONFIG = {
  geminiApiKey:       process.env.GEMINI_API_KEY          || "",
  ytApiKey:           process.env.YT_API_KEY              || "",
  ytOauthClientId:    process.env.YT_OAUTH_CLIENT_ID      || "",
  ytOauthClientSecret:process.env.YT_OAUTH_CLIENT_SECRET  || "",
  ytRefreshToken:     process.env.YT_OAUTH_REFRESH_TOKEN  || "",
  dryRun:             process.env.DRY_RUN                 === "true",
  scoreThreshold:     parseInt(process.env.SCORE_THRESHOLD || "65",  10),
  maxVideos:          parseInt(process.env.MAX_VIDEOS      || "5",   10),
  regionCode:         process.env.REGION_CODE             || "US",
  geminiModel:        process.env.GEMINI_MODEL            || "gemini-1.5-flash"
};

/* ============================================================================
 * SECTION 2: LOGGING
 * ========================================================================== */
function log(level, ...args) {
  const ts  = new Date().toISOString();
  const msg = args.map(a => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a))).join(" ");
  const prefix = { INFO: "\x1b[36m[ℹ]", WARN: "\x1b[33m[⚠]", ERROR: "\x1b[31m[✗]", OK: "\x1b[32m[✓]", STEP: "\x1b[35m[▶]" }[level] || "[ ]";
  console.log(`${prefix}\x1b[0m [${ts}] ${msg}`);
}

function logStep(msg) { log("STEP", msg); }
function logOk(msg)   { log("OK",   msg); }
function logWarn(msg) { log("WARN", msg); }
function logErr(msg)  { log("ERROR",msg); }
function logInfo(msg) { log("INFO", msg); }

/* ============================================================================
 * SECTION 3: HTTP UTILITY
 * ========================================================================== */
function httpRequest(urlStr, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const transport = parsedUrl.protocol === "https:" ? https : http;
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port:     parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path:     parsedUrl.pathname + parsedUrl.search,
      method:   options.method || "GET",
      headers:  options.headers || {}
    };
    if (body) {
      const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
      reqOptions.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }
    const req = transport.request(reqOptions, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
        } else {
          let errMsg = `HTTP ${res.statusCode}`;
          try {
            const errBody = JSON.parse(data);
            errMsg = (errBody.error && errBody.error.message) || errMsg;
          } catch (e) {}
          const err = new Error(errMsg);
          err.statusCode = res.statusCode;
          err.responseBody = data;
          reject(err);
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

function ytGet(endpoint, params, accessToken) {
  const qs = new URLSearchParams({ key: CONFIG.ytApiKey, ...params }).toString();
  const url = `https://www.googleapis.com/youtube/v3/${endpoint}?${qs}`;
  const headers = { "Accept": "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  return httpRequest(url, { method: "GET", headers });
}

function ytPut(endpoint, params, body, accessToken) {
  const qs = new URLSearchParams({ key: CONFIG.ytApiKey, ...params }).toString();
  const url = `https://www.googleapis.com/youtube/v3/${endpoint}?${qs}`;
  return httpRequest(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  }, body);
}

/* ============================================================================
 * SECTION 4: OAUTH2 TOKEN REFRESH
 * ========================================================================== */
async function refreshAccessToken() {
  logStep("Refreshing YouTube OAuth2 access token...");
  const body = new URLSearchParams({
    client_id:     CONFIG.ytOauthClientId,
    client_secret: CONFIG.ytOauthClientSecret,
    refresh_token: CONFIG.ytRefreshToken,
    grant_type:    "refresh_token"
  }).toString();

  const data = await httpRequest("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  }, body);

  if (!data.access_token) throw new Error("Failed to obtain access token from OAuth2 refresh.");
  logOk(`Access token obtained. Expires in: ${data.expires_in}s`);
  return data.access_token;
}

/* ============================================================================
 * SECTION 5: YOUTUBE DATA FETCHERS
 * ========================================================================== */
async function fetchMyChannel(accessToken) {
  logStep("Fetching authenticated channel info...");
  const data = await ytGet("channels", {
    part: "snippet,contentDetails,statistics",
    mine: "true",
    maxResults: 1
  }, accessToken);
  if (!data.items || !data.items.length) throw new Error("No channel found for this account.");
  const channel = data.items[0];
  logOk(`Channel: ${channel.snippet.title} (${data.items[0].statistics.videoCount} videos)`);
  return channel;
}

async function fetchAllVideoIds(uploadsPlaylistId, accessToken) {
  logStep(`Fetching all video IDs from uploads playlist: ${uploadsPlaylistId}`);
  const allIds = [];
  let pageToken = null;
  let page = 0;

  do {
    page++;
    const params = {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: 50
    };
    if (pageToken) params.pageToken = pageToken;
    const data = await ytGet("playlistItems", params, accessToken);
    const ids = (data.items || []).map(i => i.contentDetails && i.contentDetails.videoId).filter(Boolean);
    allIds.push(...ids);
    pageToken = data.nextPageToken || null;
    logInfo(`  Page ${page}: +${ids.length} video IDs (total: ${allIds.length})`);
  } while (pageToken);

  logOk(`Total video IDs fetched: ${allIds.length}`);
  return allIds;
}

async function fetchVideoDetailsBatch(videoIds, accessToken) {
  const allVideos = [];
  const chunkSize = 50;
  for (let i = 0; i < videoIds.length; i += chunkSize) {
    const chunk = videoIds.slice(i, i + chunkSize);
    const data = await ytGet("videos", {
      part: "snippet,statistics,status,contentDetails",
      id: chunk.join(",")
    }, accessToken);
    allVideos.push(...(data.items || []));
    logInfo(`  Fetched video details: ${allVideos.length}/${videoIds.length}`);
  }
  return allVideos;
}

async function fetchYouTubeSearchResults(query, maxResults = 20) {
  logInfo(`  Fetching YouTube search results for: "${query}"`);
  const data = await ytGet("search", {
    part: "snippet",
    q: query,
    type: "video",
    maxResults: Math.min(maxResults, 50),
    order: "relevance",
    relevanceLanguage: "en",
    regionCode: CONFIG.regionCode
  });
  return (data.items || []).map(item => ({
    videoId: item.id && item.id.videoId,
    title: item.snippet && item.snippet.title,
    channelTitle: item.snippet && item.snippet.channelTitle,
    description: item.snippet && item.snippet.description
  })).filter(v => v.videoId && v.title);
}

async function fetchTrendingVideos(categoryId) {
  logInfo(`  Fetching trending videos (category: ${categoryId || "any"}, region: ${CONFIG.regionCode})`);
  const params = {
    part: "snippet,statistics",
    chart: "mostPopular",
    maxResults: 20,
    regionCode: CONFIG.regionCode
  };
  if (categoryId) params.videoCategoryId = categoryId;
  const data = await ytGet("videos", params);
  return (data.items || []).map(item => ({
    videoId: item.id,
    title: item.snippet && item.snippet.title,
    tags: (item.snippet && item.snippet.tags) || [],
    viewCount: item.statistics && item.statistics.viewCount,
    categoryId: item.snippet && item.snippet.categoryId
  }));
}

async function fetchYouTubeKeywordData(topic, categoryId) {
  logInfo(`  Running YouTube keyword research for: "${topic}"`);
  const year = new Date().getFullYear();

  const [mainResults, varResults1, varResults2, trending] = await Promise.all([
    fetchYouTubeSearchResults(topic, 20).catch(() => []),
    fetchYouTubeSearchResults(`${topic} ${year}`, 10).catch(() => []),
    fetchYouTubeSearchResults(`how to ${topic}`, 10).catch(() => []),
    fetchTrendingVideos(categoryId).catch(() => [])
  ]);

  const allTitles = [...mainResults, ...varResults1, ...varResults2].map(r => r.title || "");

  /* Extract phrase frequencies */
  const phraseMap = {};
  allTitles.forEach(title => {
    const words = title.toLowerCase().split(/\s+/);
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (bigram.length > 6) phraseMap[bigram] = (phraseMap[bigram] || 0) + 1;
    }
    for (let j = 0; j < words.length - 2; j++) {
      const trigram = `${words[j]} ${words[j + 1]} ${words[j + 2]}`;
      if (trigram.length > 10) phraseMap[trigram] = (phraseMap[trigram] || 0) + 2;
    }
  });

  const topPhrases = Object.keys(phraseMap)
    .sort((a, b) => phraseMap[b] - phraseMap[a])
    .slice(0, 25)
    .map(phrase => ({
      keyword: phrase,
      frequency: phraseMap[phrase],
      searchVolume: phraseMap[phrase] > 4 ? "High" : phraseMap[phrase] > 2 ? "Medium" : "Low",
      competition: phraseMap[phrase] > 5 ? "High" : phraseMap[phrase] > 2 ? "Medium" : "Low"
    }));

  /* Extract tags from trending */
  const trendingTagFreq = {};
  trending.forEach(v => {
    (v.tags || []).forEach(tag => {
      const lt = tag.toLowerCase();
      trendingTagFreq[lt] = (trendingTagFreq[lt] || 0) + 1;
    });
  });
  const topTrendingTags = Object.keys(trendingTagFreq)
    .sort((a, b) => trendingTagFreq[b] - trendingTagFreq[a])
    .slice(0, 25);

  return {
    query: topic,
    keywords: topPhrases,
    relatedTags: topTrendingTags,
    topSearchResults: mainResults.slice(0, 15),
    trendingVideos: trending.slice(0, 10)
  };
}

/* ============================================================================
 * SECTION 6: SEO SCORE CALCULATOR
 * ========================================================================== */
function calculateSEOScore(title, description, tags) {
  const tLen = (title || "").length;
  const dLen = (description || "").length;
  const tagArr = Array.isArray(tags) ? tags : [];
  let score = 0;

  /* Title length (0-20) */
  if (tLen >= 50 && tLen <= 70)       score += 20;
  else if (tLen >= 40 && tLen < 50)   score += 14;
  else if (tLen > 70 && tLen <= 80)   score += 14;
  else if (tLen > 30)                 score += 8;

  /* Keyword in title (0-25) — heuristic: any multi-word phrase */
  const titleWords = (title || "").toLowerCase().split(/\s+/);
  if (titleWords.length >= 4 && titleWords.length <= 10) score += 20;
  else if (titleWords.length >= 3)    score += 12;
  else if (titleWords.length >= 2)    score += 6;

  /* Description (0-25) */
  if (dLen >= 400 && dLen <= 1200)    score += 25;
  else if (dLen >= 200)               score += 15;
  else if (dLen > 50)                 score += 8;

  /* Tags (0-20) */
  const validTags = tagArr.filter(t => t.trim().length > 0).length;
  if (validTags >= 15 && validTags <= 30) score += 20;
  else if (validTags >= 10)           score += 14;
  else if (validTags >= 5)            score += 8;

  /* Hashtag bonus (0-10) */
  if (/#[A-Za-z]/.test(title || "")) score += 10;

  return Math.min(100, Math.round(score));
}

/* ============================================================================
 * SECTION 7: GEMINI API — YOUTUBE DATA → PROCESSING
 * ========================================================================== */
function buildGeminiPrompt(videoData, kwData) {
  const snippet = videoData.snippet || {};
  const stats   = videoData.statistics || {};
  const searchResults = kwData.topSearchResults || [];
  const trendingVideos = kwData.trendingVideos || [];
  const keywords = kwData.keywords || [];
  const relatedTags = kwData.relatedTags || [];

  const searchResultLines = searchResults.slice(0, 15)
    .map((r, i) => `${i + 1}. ${r.title || ""}`)
    .join("\n");

  const trendingLines = trendingVideos.slice(0, 10)
    .map((t, i) => `${i + 1}. ${t.title || ""} [${t.viewCount || "?"} views, tags: ${(t.tags || []).slice(0, 5).join(", ") || "none"}]`)
    .join("\n");

  const keywordLines = keywords.slice(0, 20)
    .map(k => `• ${k.keyword} [Volume: ${k.searchVolume}, Competition: ${k.competition}]`)
    .join("\n");

  const tagsLine = relatedTags.slice(0, 30).join(", ");

  return [
    "You are a YouTube SEO optimization engine. You ONLY work with the real YouTube data provided below.",
    "DO NOT use your own knowledge to invent keywords, topics, or suggestions not present in the YouTube data.",
    "Every title, tag, and keyword you produce must be directly traceable to the real search results or trending videos below.",
    "",
    "=== CURRENT VIDEO DATA (from YouTube API) ===",
    `Video ID: ${videoData.id || "N/A"}`,
    `Current Title: ${snippet.title || "(none)"}`,
    `Current Description (first 400 chars): ${(snippet.description || "").substring(0, 400)}`,
    `Current Tags: ${(snippet.tags || []).join(", ") || "(none)"}`,
    `Statistics: ${stats.viewCount || "0"} views, ${stats.likeCount || "0"} likes, ${stats.commentCount || "0"} comments`,
    `Category ID: ${snippet.categoryId || "22"}`,
    `Published: ${snippet.publishedAt ? snippet.publishedAt.split("T")[0] : "unknown"}`,
    "",
    "=== REAL YOUTUBE SEARCH RESULTS (live from YouTube Data API for this video's topic) ===",
    "These are ACTUAL videos appearing in YouTube search right now for this topic:",
    searchResultLines || "(no search results)",
    "",
    "=== REAL TRENDING VIDEOS (from YouTube trending API) ===",
    "These ACTUAL trending videos reveal what the YouTube algorithm currently rewards:",
    trendingLines || "(no trending data)",
    "",
    "=== KEYWORD PATTERNS EXTRACTED FROM REAL YOUTUBE SEARCH RESULTS ===",
    "These keyword phrases appear repeatedly in actual YouTube search results for this topic:",
    keywordLines || "(no keyword data)",
    "",
    "=== RELATED TAGS FROM TRENDING VIDEOS ===",
    tagsLine || "(none)",
    "",
    "=== YOUR TASK ===",
    "Using ONLY the real YouTube data above (zero invented content), output STRICT JSON:",
    "{",
    `  "optimizedTitle": "Best title (50-70 chars) using terms ONLY from the YouTube data above. Include one hashtag if found in trending data.",`,
    `  "alternativeTitles": ["4 alternative titles, all grounded in the YouTube search result titles above"],`,
    `  "optimizedDescription": "400-600 word description using keyword phrases found in the real search results above. Include a CTA.",`,
    `  "optimizedTags": ["15-25 tags using ONLY terms found in the actual YouTube search results, trending video titles, and related tags above"],`,
    `  "primaryKeyword": "Single highest-frequency keyword from the YouTube data above",`,
    `  "keywordStrategy": "Brief explanation of which YouTube data signals drove your choices",`,
    `  "seoScoreEstimate": number`,
    "}"
  ].join("\n");
}

async function callGeminiAPI(prompt) {
  logInfo("  Calling Gemini API with YouTube data prompt...");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.geminiModel}:generateContent?key=${encodeURIComponent(CONFIG.geminiApiKey)}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.25,
      maxOutputTokens: 4096,
      responseMimeType: "application/json"
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  };
  const result = await httpRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }, body);

  const text = result.candidates &&
    result.candidates[0] &&
    result.candidates[0].content &&
    result.candidates[0].content.parts &&
    result.candidates[0].content.parts[0] &&
    result.candidates[0].content.parts[0].text;

  if (!text) throw new Error("Gemini returned empty response");

  let cleaned = text.trim().replace(/^```(json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(cleaned); } catch (e) {
    const start = cleaned.indexOf("{");
    const end   = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (e2) {}
    }
    throw new Error(`Failed to parse Gemini JSON response: ${e.message}`);
  }
}

/* ============================================================================
 * SECTION 8: FULL OPTIMIZATION PIPELINE FOR ONE VIDEO
 * ========================================================================== */
async function optimizeVideo(video, accessToken) {
  const snippet = video.snippet || {};
  const title   = snippet.title || "";
  const catId   = snippet.categoryId;
  const videoId = video.id;

  logStep(`Optimizing: "${title}" (ID: ${videoId})`);

  /* Step 1: Fetch real YouTube data for this video's topic */
  logInfo("  Step 1: Fetching YouTube search & trending data...");
  const kwData = await fetchYouTubeKeywordData(title, catId);
  logOk(`  Found ${kwData.topSearchResults.length} search results, ${kwData.trendingVideos.length} trending, ${kwData.keywords.length} keywords`);

  /* Step 2: Build prompt from REAL YouTube data only */
  logInfo("  Step 2: Building YouTube-data prompt for Gemini...");
  const prompt = buildGeminiPrompt(video, kwData);

  /* Step 3: Send YouTube data to Gemini — it outputs based ONLY on that data */
  logInfo("  Step 3: Sending YouTube data to Gemini API...");
  const geminiOutput = await callGeminiAPI(prompt);
  logOk(`  Gemini output: "${geminiOutput.optimizedTitle || "(no title)"}", ${(geminiOutput.optimizedTags || []).length} tags`);

  /* Step 4: Calculate SEO scores */
  const originalScore = calculateSEOScore(snippet.title, snippet.description, snippet.tags);
  const newScore      = calculateSEOScore(
    geminiOutput.optimizedTitle,
    geminiOutput.optimizedDescription,
    geminiOutput.optimizedTags
  );
  logInfo(`  SEO Score: ${originalScore} → ${newScore} (+${newScore - originalScore})`);

  return {
    videoId,
    originalTitle:       snippet.title,
    originalScore,
    optimizedTitle:      geminiOutput.optimizedTitle       || snippet.title,
    optimizedDescription:geminiOutput.optimizedDescription || snippet.description,
    optimizedTags:       geminiOutput.optimizedTags        || snippet.tags || [],
    newScore,
    primaryKeyword:      geminiOutput.primaryKeyword || "",
    keywordStrategy:     geminiOutput.keywordStrategy || "",
    categoryId:          catId || "22"
  };
}

/* ============================================================================
 * SECTION 9: PUSH OPTIMIZED DATA TO YOUTUBE
 * ========================================================================== */
async function updateVideoOnYouTube(optimizationResult, accessToken) {
  const { videoId, optimizedTitle, optimizedDescription, optimizedTags, categoryId } = optimizationResult;

  if (CONFIG.dryRun) {
    logWarn(`  [DRY RUN] Would update: "${optimizedTitle}" (${optimizedTags.length} tags)`);
    return { dryRun: true };
  }

  logInfo(`  Pushing update to YouTube API for video: ${videoId}`);
  const body = {
    id: videoId,
    snippet: {
      title:           optimizedTitle,
      description:     optimizedDescription,
      tags:            optimizedTags,
      categoryId:      String(categoryId || "22"),
      defaultLanguage: "en"
    }
  };

  const result = await ytPut("videos", { part: "snippet" }, body, accessToken);
  logOk(`  Updated on YouTube: "${result.snippet && result.snippet.title || optimizedTitle}"`);
  return result;
}

/* ============================================================================
 * SECTION 10: MAIN EXECUTION FLOW
 * ========================================================================== */
async function main() {
  const startTime = Date.now();
  const runReport = {
    startTime:      new Date().toISOString(),
    dryRun:         CONFIG.dryRun,
    scoreThreshold: CONFIG.scoreThreshold,
    maxVideos:      CONFIG.maxVideos,
    regionCode:     CONFIG.regionCode,
    geminiModel:    CONFIG.geminiModel,
    videos:         [],
    summary:        { processed: 0, updated: 0, skipped: 0, errors: 0 }
  };

  console.log("\n");
  console.log("\x1b[36m====================================================================\x1b[0m");
  console.log("\x1b[36m  YouTube Auto-Pilot SEO Studio — GitHub Actions Run\x1b[0m");
  console.log("\x1b[36m  Architecture: YouTube Data First → Gemini Processes → YouTube\x1b[0m");
  console.log("\x1b[36m====================================================================\x1b[0m\n");

  /* Validate config */
  if (!CONFIG.geminiApiKey)  { logErr("GEMINI_API_KEY is not set.");            process.exit(1); }
  if (!CONFIG.ytApiKey)      { logErr("YT_API_KEY is not set.");                process.exit(1); }
  if (!CONFIG.ytRefreshToken){ logErr("YT_OAUTH_REFRESH_TOKEN is not set.");    process.exit(1); }

  logInfo(`Config: threshold=${CONFIG.scoreThreshold}, maxVideos=${CONFIG.maxVideos}, dryRun=${CONFIG.dryRun}`);

  /* Step 1: Get OAuth access token */
  let accessToken;
  try {
    accessToken = await refreshAccessToken();
  } catch (err) {
    logErr(`OAuth token refresh failed: ${err.message}`);
    process.exit(1);
  }

  /* Step 2: Fetch channel info */
  let channel;
  try {
    channel = await fetchMyChannel(accessToken);
  } catch (err) {
    logErr(`Failed to fetch channel: ${err.message}`);
    process.exit(1);
  }

  const uploadsPlaylistId = channel.contentDetails &&
    channel.contentDetails.relatedPlaylists &&
    channel.contentDetails.relatedPlaylists.uploads;

  if (!uploadsPlaylistId) {
    logErr("No uploads playlist found for this channel.");
    process.exit(1);
  }

  /* Step 3: Fetch all video IDs */
  let videoIds;
  try {
    videoIds = await fetchAllVideoIds(uploadsPlaylistId, accessToken);
  } catch (err) {
    logErr(`Failed to fetch video IDs: ${err.message}`);
    process.exit(1);
  }

  if (!videoIds.length) {
    logWarn("No videos found on this channel.");
    console.log(`SEO_REPORT_JSON:${JSON.stringify({ ...runReport, endTime: new Date().toISOString() })}`);
    process.exit(0);
  }

  /* Step 4: Fetch full video details */
  logStep(`Fetching details for ${videoIds.length} videos...`);
  let allVideos;
  try {
    allVideos = await fetchVideoDetailsBatch(videoIds, accessToken);
  } catch (err) {
    logErr(`Failed to fetch video details: ${err.message}`);
    process.exit(1);
  }
  logOk(`Loaded ${allVideos.length} video details.`);

  /* Step 5: Filter videos below score threshold */
  const lowScoreVideos = allVideos
    .filter(v => {
      const s     = v.snippet || {};
      const score = calculateSEOScore(s.title, s.description, s.tags);
      return score < CONFIG.scoreThreshold;
    })
    .sort((a, b) => {
      const sa = a.snippet || {}, sb = b.snippet || {};
      return calculateSEOScore(sa.title, sa.description, sa.tags) -
             calculateSEOScore(sb.title, sb.description, sb.tags);
    })
    .slice(0, CONFIG.maxVideos);

  logStep(`Found ${lowScoreVideos.length} video(s) below SEO score threshold (${CONFIG.scoreThreshold}).`);

  if (!lowScoreVideos.length) {
    logOk("All videos are above the SEO score threshold! Nothing to optimize this run.");
    runReport.summary.skipped = allVideos.length;
    console.log(`SEO_REPORT_JSON:${JSON.stringify({ ...runReport, endTime: new Date().toISOString() })}`);
    process.exit(0);
  }

  /* Step 6: Process each low-score video */
  for (let i = 0; i < lowScoreVideos.length; i++) {
    const video    = lowScoreVideos[i];
    const snippet  = video.snippet || {};
    const videoNum = `[${i + 1}/${lowScoreVideos.length}]`;

    console.log(`\n\x1b[35m${videoNum} Processing: "${snippet.title}"\x1b[0m`);
    logInfo(`  Original SEO Score: ${calculateSEOScore(snippet.title, snippet.description, snippet.tags)}`);

    const videoReport = {
      videoId:       video.id,
      originalTitle: snippet.title,
      originalScore: calculateSEOScore(snippet.title, snippet.description, snippet.tags),
      status:        "pending"
    };

    try {
      /* YouTube data fetch → Gemini process */
      const optResult = await optimizeVideo(video, accessToken);

      /* Push to YouTube */
      await updateVideoOnYouTube(optResult, accessToken);

      videoReport.optimizedTitle = optResult.optimizedTitle;
      videoReport.newScore       = optResult.newScore;
      videoReport.scoreDelta     = optResult.newScore - optResult.originalScore;
      videoReport.primaryKeyword = optResult.primaryKeyword;
      videoReport.status         = CONFIG.dryRun ? "dry_run" : "updated";
      runReport.summary.updated++;

      logOk(`${videoNum} Done: "${optResult.optimizedTitle}" (Score: ${optResult.originalScore} → ${optResult.newScore})`);

      /* Rate limit: 2 second delay between videos */
      if (i < lowScoreVideos.length - 1) {
        logInfo("  Rate limiting: waiting 2 seconds...");
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err) {
      videoReport.status = "error";
      videoReport.error  = err.message;
      runReport.summary.errors++;
      logErr(`${videoNum} Failed to optimize ${video.id}: ${err.message}`);
    }

    runReport.summary.processed++;
    runReport.videos.push(videoReport);
  }

  /* Step 7: Print summary */
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  runReport.endTime  = new Date().toISOString();
  runReport.elapsedSeconds = parseFloat(elapsed);

  console.log("\n\x1b[36m====================================================================\x1b[0m");
  console.log("\x1b[36m  RUN SUMMARY\x1b[0m");
  console.log("\x1b[36m====================================================================\x1b[0m");
  logInfo(`  Total channel videos scanned: ${allVideos.length}`);
  logInfo(`  Videos processed this run:    ${runReport.summary.processed}`);
  logOk(`  Successfully updated:         ${runReport.summary.updated}`);
  logWarn(`  Errors:                       ${runReport.summary.errors}`);
  logInfo(`  Elapsed time:                 ${elapsed}s`);
  logInfo(`  Dry run mode:                 ${CONFIG.dryRun}`);
  console.log("\x1b[36m====================================================================\x1b[0m\n");

  /* Emit JSON report marker for GitHub Actions to capture */
  console.log(`SEO_REPORT_JSON:${JSON.stringify(runReport)}`);

  process.exit(runReport.summary.errors > 0 && runReport.summary.updated === 0 ? 1 : 0);
}

main().catch(err => {
  logErr(`Unhandled error: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
