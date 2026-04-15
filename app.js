/* Kat’s Vocab Garden 🌸 — JAPN1200 (V7.4) */

const APP_VERSION = "V7.4";
const STORAGE = {
  stars: "jpln1200_stars_v1",
  settings: "jpln1200_settings_v1",
  stats: "jpln1200_stats_v1",
  kanjiOverrides: "jpln1200_kanji_overrides_v1",
  vocabEdits: "jpln1200_vocab_edits_v1",
  seeded: "jpln1200_seeded_v1"
};

const LESSON_CATEGORIES = [
  { key: "ch4", name: "Chapter 4" },
  { key: "ch5", name: "Chapter 5" },
  { key: "ch6", name: "Chapter 6" },
  { key: "other", name: "Other" }
];
const CATEGORY_BY_LESSON_CODE = {
  l1: "ch4",
  l2: "ch4",
  l2_5: "ch4",
  l3: "ch4",
  l4: "ch4",
  l5: "ch4",
  l6: "ch4",
  l7: "ch4",
  l8: "ch4",
  l9: "ch5",
  l10: "ch5",
  l11: "ch5",
  l12: "ch5",
  adj: "ch5",
  l13: "ch6",
  l14: "ch6",
  extras: "other",
  pre: "other"
};

const DEFAULT_SETTINGS = {
  audioOn: true,
  volume: 0.9,
  autoplay: false,
  smartGrade: true,
  backgroundVideo: "off"
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 1800);
}

function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function uniq(arr) {
  return [...new Set(arr)];
}

function normEnglish(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function englishAliases(en) {
  const base = (en || "").trim();
  const parts = [];
  if (!base) return parts;
  parts.push(base);
  const withoutParens = base.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
  if (withoutParens) parts.push(withoutParens);
  parts.push(base.split(",")[0].trim());
  parts.push(base.split("(")[0].trim());
  const segments = base.split(/[;,/]/).map((seg) => seg.trim()).filter(Boolean);
  segments.forEach((seg) => parts.push(seg));
  const segmentsNoParens = withoutParens
    .split(/[;,/]/)
    .map((seg) => seg.trim())
    .filter(Boolean);
  segmentsNoParens.forEach((seg) => parts.push(seg));
  return uniq(parts.filter(Boolean));
}

function englishVariants(s) {
  const spaced = normEnglish(s);
  if (!spaced) return [];
  const tight = spaced.replace(/\s+/g, "");
  return uniq([spaced, tight].filter(Boolean));
}

function normJP(s) {
  return (s || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[。．\.\、,，'’"“”！？!?:：;；・]/g, "")
    .trim();
}

function jpAliases(text) {
  const base = (text || "").trim();
  if (!base) return [];
  const withoutParens = base.replace(/[（(][^）)]*[）)]/g, "").replace(/\s+/g, " ").trim();
  return uniq([base, withoutParens].filter(Boolean));
}

const AUDIO_EXTENSIONS = ["wav", "mp3", "m4a", "ogg"];
const AUDIO_SRC_CACHE = new Map();
let AUDIO_FALLBACK_MAP = null;
let AUDIO_FALLBACK_LOADING = null;
let CURRENT_AUDIO_ENTRIES = [];
let CURRENT_AUDIO_SIGNATURE = "";
let SW_REGISTRATION = null;

function attachWaitingServiceWorker(worker) {
  if (!worker) return;
  worker.addEventListener("statechange", () => {
    if (worker.state === "installed" && navigator.serviceWorker.controller) {
      toast("Update ready. Tap Refresh / Update App.");
    }
  });
}

async function forceRefreshApp() {
  const refreshBtn = $("#btnAppRefresh");
  if (refreshBtn) refreshBtn.disabled = true;

  try {
    if (!("serviceWorker" in navigator)) {
      location.reload();
      return;
    }

    const reg = SW_REGISTRATION || await navigator.serviceWorker.getRegistration();
    if (reg) {
      SW_REGISTRATION = reg;
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      await reg.update();
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }

    const hasController = !!navigator.serviceWorker.controller;
    if (hasController) {
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        navigator.serviceWorker.addEventListener("controllerchange", finish, { once: true });
        setTimeout(finish, 1200);
      });
    }

    location.href = `./index.html?force=${Date.now()}`;
  } catch {
    location.reload();
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

async function audioUrlExists(url) {
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (head.ok) return true;
    if ([403, 405].includes(head.status)) {
      const getRes = await fetch(url, { method: "GET", cache: "no-store" });
      return getRes.ok;
    }
    return false;
  } catch {
    return false;
  }
}

function audioIdVariants(id) {
  const variants = [id];
  if (id?.startsWith("jpln1200_")) {
    variants.push(id.replace(/^jpln1200_/, "japn1200_"));
  }
  return variants;
}

function audioIdForItem(item) {
  return item?.audio_id || item?.audioId || item?.id;
}

async function loadAudioFallbackMap() {
  if (AUDIO_FALLBACK_MAP) return AUDIO_FALLBACK_MAP;
  if (AUDIO_FALLBACK_LOADING) return AUDIO_FALLBACK_LOADING;
  AUDIO_FALLBACK_LOADING = (async () => {
    try {
      const res = await fetch("./audio/audio_rename_report.json", { cache: "no-store" });
      if (!res.ok) {
        AUDIO_FALLBACK_MAP = new Map();
        return AUDIO_FALLBACK_MAP;
      }
      const data = await res.json();
      const map = new Map();
      (data.renamed || []).forEach((entry) => {
        if (entry.itemId && entry.from) {
          map.set(entry.itemId, entry.from);
        }
      });
      AUDIO_FALLBACK_MAP = map;
      return map;
    } catch {
      AUDIO_FALLBACK_MAP = new Map();
      return AUDIO_FALLBACK_MAP;
    }
  })();
  return AUDIO_FALLBACK_LOADING;
}

async function resolveAudioUrl(id) {
  if (AUDIO_SRC_CACHE.has(id)) return AUDIO_SRC_CACHE.get(id);
  const variants = audioIdVariants(id);
  for (const variant of variants) {
    for (const ext of AUDIO_EXTENSIONS) {
      const url = `./audio/${variant}.${ext}`;
      if (await audioUrlExists(url)) {
        AUDIO_SRC_CACHE.set(id, url);
        return url;
      }
    }
  }
  const fallbackMap = await loadAudioFallbackMap();
  const fallbackPath = fallbackMap.get(id);
  if (fallbackPath) {
    const url = fallbackPath.startsWith("audio/") ? `./${fallbackPath}` : fallbackPath;
    if (await audioUrlExists(url)) {
      AUDIO_SRC_CACHE.set(id, url);
      return url;
    }
  }
  AUDIO_SRC_CACHE.set(id, null);
  return null;
}

function clearAudioCache() {
  AUDIO_SRC_CACHE.clear();
  AUDIO_FALLBACK_MAP = null;
  AUDIO_FALLBACK_LOADING = null;
}

async function hasAudioFile(id) {
  return !!(await resolveAudioUrl(id));
}

function expectedAudioFilename(id) {
  const ext = AUDIO_EXTENSIONS[0] || "wav";
  return `audio/${id}.${ext}`;
}

function displayAudioFilename(url) {
  if (!url) return "";
  return url.replace(/^\.\//, "");
}
function jpDisplay(item, mode) {
  const kana = item.jp_kana || "";
  const kanji = item.jp_kanji || "";
  if (mode === "kana") return kana;
  if (mode === "kanji") return kanji || kana;
  if (kanji && kanji !== kana) return `${kana}（${kanji}）`;
  return kana;
}

function jpAcceptableAnswers(item, dmode) {
  const kana = item.jp_kana || "";
  const kanji = item.jp_kanji || "";
  if (dmode === "kana") return jpAliases(kana);
  if (dmode === "kanji") return jpAliases(kanji || kana);
  return uniq([kana, kanji].flatMap(jpAliases).filter(Boolean));
}

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...loadJSON(STORAGE.settings, {}) };
}
function setSettings(patch) {
  const s = getSettings();
  const next = { ...s, ...patch };
  saveJSON(STORAGE.settings, next);
  applySettingsToUI(next);
  return next;
}

function applySettingsToUI(s) {
  $("#setAudioOn").checked = !!s.audioOn;
  $("#setVolume").value = String(s.volume ?? 0.9);
  $("#setAutoplay").checked = !!s.autoplay;
  $("#setSmartGrade").checked = !!s.smartGrade;
  const bgSelect = $("#setBackgroundVideo");
  const bgHint = $("#backgroundVideoHint");
  const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (bgSelect) {
    bgSelect.value = prefersReduced ? "off" : (s.backgroundVideo || "off");
    bgSelect.disabled = prefersReduced;
  }
  if (bgHint) {
    bgHint.textContent = prefersReduced
      ? "Background video is disabled because your device prefers reduced motion."
      : "Enable the Sakura background video behind the UI.";
  }
  applyBackgroundVideo(prefersReduced ? "off" : (s.backgroundVideo || "off"));
  updateListeningAvailability();
}

let VIDEO_FALLBACK_CLEANUP = null;

function clearVideoFallback() {
  if (VIDEO_FALLBACK_CLEANUP) {
    VIDEO_FALLBACK_CLEANUP();
    VIDEO_FALLBACK_CLEANUP = null;
  }
}

function addVideoInteractionFallback(video) {
  clearVideoFallback();
  const events = ["pointerdown", "touchstart", "click", "keydown"];
  const handler = () => {
    video.play()
      .then(() => clearVideoFallback())
      .catch(() => {});
  };
  events.forEach((evt) => window.addEventListener(evt, handler, { passive: true }));
  VIDEO_FALLBACK_CLEANUP = () => {
    events.forEach((evt) => window.removeEventListener(evt, handler));
  };
}

function applyBackgroundVideo(state) {
  const layer = $("#videoBackground");
  if (!layer) return;
  clearVideoFallback();
  layer.classList.remove("is-active");
  layer.innerHTML = "";
  if (state !== "on") return;

  const video = document.createElement("video");
  video.src = "./icons/Sakura.mp4";
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  video.setAttribute("aria-hidden", "true");
  video.preload = "auto";
  layer.appendChild(video);
  layer.classList.add("is-active");

  const playPromise = video.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(() => addVideoInteractionFallback(video));
  } else {
    addVideoInteractionFallback(video);
  }
}

let LESSONS = [];
let ITEMS = [];
let ITEMS_BY_ID = new Map();
let VOCAB_EDITS = {};

let STARRED = new Set();
let KANJI_OVERRIDES = new Set();
let SETTINGS = getSettings();
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

function getStats() {
  return loadJSON(STORAGE.stats, { attempts: 0, correct: 0, perItem: {} });
}
function recordAttempt(id, ok) {
  const s = getStats();
  s.attempts += 1;
  if (ok) s.correct += 1;
  s.perItem[id] = s.perItem[id] || { a: 0, c: 0 };
  s.perItem[id].a += 1;
  if (ok) s.perItem[id].c += 1;
  saveJSON(STORAGE.stats, s);
}

function seedStarsIfNeeded() {
  const seeded = localStorage.getItem(STORAGE.seeded);
  if (seeded) return;
  STARRED = new Set();
  saveJSON(STORAGE.stars, Array.from(STARRED));
  localStorage.setItem(STORAGE.seeded, "1");
}

function loadStars() {
  const saved = loadJSON(STORAGE.stars, null);
  if (Array.isArray(saved)) {
    STARRED = new Set(saved);
  } else {
    STARRED = new Set();
  }
}

function saveStars() {
  saveJSON(STORAGE.stars, Array.from(STARRED));
}

function isStarred(id) {
  return STARRED.has(id);
}
function toggleStar(id, force) {
  const on = force !== undefined ? force : !STARRED.has(id);
  if (on) STARRED.add(id); else STARRED.delete(id);
  saveStars();
  refreshHeaderCounts();
  updateQuestionCountUI();
  updateCurrentAudioListIfOpen();
  return on;
}

function loadKanjiOverrides() {
  const saved = loadJSON(STORAGE.kanjiOverrides, null);
  if (Array.isArray(saved)) {
    KANJI_OVERRIDES = new Set(saved);
  } else {
    KANJI_OVERRIDES = new Set();
  }
}

function saveKanjiOverrides() {
  saveJSON(STORAGE.kanjiOverrides, Array.from(KANJI_OVERRIDES));
}

function isKanjiOverride(id) {
  return KANJI_OVERRIDES.has(id);
}

function toggleKanjiOverride(id, force) {
  const on = force !== undefined ? force : !KANJI_OVERRIDES.has(id);
  if (on) KANJI_OVERRIDES.add(id); else KANJI_OVERRIDES.delete(id);
  saveKanjiOverrides();
  return on;
}

function loadVocabEdits() {
  const saved = loadJSON(STORAGE.vocabEdits, {});
  VOCAB_EDITS = saved && typeof saved === "object" ? saved : {};
}

function saveVocabEdits() {
  saveJSON(STORAGE.vocabEdits, VOCAB_EDITS);
}

function applyVocabEditsToItem(item) {
  const edit = VOCAB_EDITS[item.id];
  if (!edit) return;
  if (Object.prototype.hasOwnProperty.call(edit, "jp_kana")) item.jp_kana = edit.jp_kana;
  if (Object.prototype.hasOwnProperty.call(edit, "jp_kanji")) item.jp_kanji = edit.jp_kanji;
  if (Object.prototype.hasOwnProperty.call(edit, "en")) item.en = edit.en;
}

function populateVocabEditRow(row, item) {
  const kanaInput = row.querySelector("[data-field='jp_kana']");
  const kanjiInput = row.querySelector("[data-field='jp_kanji']");
  const enInput = row.querySelector("[data-field='en']");
  if (kanaInput) kanaInput.value = item.jp_kana || "";
  if (kanjiInput) kanjiInput.value = item.jp_kanji || "";
  if (enInput) enInput.value = item.en || "";
}

function setVocabRowEditing(row, editing) {
  row.classList.toggle("editing", editing);
  row.querySelectorAll(".vocabView").forEach((el) => el.classList.toggle("hidden", editing));
  row.querySelectorAll(".vocabEdit").forEach((el) => el.classList.toggle("hidden", !editing));
  if (editing) {
    const firstInput = row.querySelector(".vocabEdit input");
    if (firstInput) firstInput.focus();
  }
}

function updateVocabRowDisplay(row, item, displayMode) {
  const jpEl = row.querySelector(".jpDisplayText");
  const enEl = row.querySelector(".enDisplayText");
  if (jpEl) {
    const mode = isKanjiOverride(item.id) ? "kanji" : displayMode;
    jpEl.textContent = jpDisplay(item, mode);
  }
  if (enEl) enEl.textContent = item.en || "";
}

function lesson_code(lessonName) {
  const lower = (lessonName || "").toLowerCase();
  if (lower.includes("extra")) return "extras";
  if (lower.includes("pre")) return "pre";
  if (lower.includes("adject")) return "adj";
  const m = lower.match(/lesson\s*([0-9]+(?:\.[0-9]+)?)/);
  if (m) return "l" + m[1].replace(".", "_");
  return "misc";
}

function categoryKeyForLessonCode(code) {
  return CATEGORY_BY_LESSON_CODE[code] || "other";
}

function getLessonGroups() {
  const grouped = new Map(LESSON_CATEGORIES.map((cat) => [cat.key, { ...cat, lessons: [] }]));
  LESSONS.forEach((lesson) => {
    const key = categoryKeyForLessonCode(lesson.code);
    if (!grouped.has(key)) grouped.set(key, { key, name: key, lessons: [] });
    grouped.get(key).lessons.push(lesson);
  });
  return Array.from(grouped.values()).filter((group) => group.lessons.length);
}

function syncCategoryCheckboxState(hostSelector, categoryKey) {
  const host = $(hostSelector);
  if (!host) return;
  const categoryCheckbox = host.querySelector(`input[data-role="category"][data-category="${categoryKey}"]`);
  if (!categoryCheckbox) return;
  const lessonBoxes = Array.from(host.querySelectorAll(`input[data-role="lesson"][data-category="${categoryKey}"]`));
  const checkedCount = lessonBoxes.filter((box) => box.checked).length;
  categoryCheckbox.checked = checkedCount > 0 && checkedCount === lessonBoxes.length;
  categoryCheckbox.indeterminate = checkedCount > 0 && checkedCount < lessonBoxes.length;
}

function syncAllCategoryCheckboxes(hostSelector) {
  const host = $(hostSelector);
  if (!host) return;
  LESSON_CATEGORIES.forEach((cat) => syncCategoryCheckboxState(hostSelector, cat.key));
  const extraCats = uniq(Array.from(host.querySelectorAll('input[data-role="lesson"]')).map((el) => el.dataset.category));
  extraCats.forEach((cat) => syncCategoryCheckboxState(hostSelector, cat));
}

function setLessonSelections(hostSelector, checked) {
  $$(`${hostSelector} input[data-role="lesson"]`).forEach((x) => {
    x.checked = checked;
  });
  syncAllCategoryCheckboxes(hostSelector);
}

function selectedLessonCodesIn(hostSelector) {
  return $$(`${hostSelector} input[data-role="lesson"]:checked`).map((x) => x.value);
}

function selectedLessonCodes() {
  return selectedLessonCodesIn("#lessonList");
}

function currentPoolFrom(lessonHostSelector, starFilterSelector) {
  const codes = selectedLessonCodesIn(lessonHostSelector);
  let pool = ITEMS.filter((it) => codes.includes(lesson_code(it.lesson)));
  if ($(starFilterSelector)?.checked) {
    pool = pool.filter(it => isStarred(it.id));
  }
  return pool;
}

function currentPool() {
  return currentPoolFrom("#lessonList", "#filterStarredOnly");
}

function currentSpeakingPool() {
  return currentPoolFrom("#lessonListSpeaking", "#filterStarredOnlySpeaking");
}

function currentPoolSignature(pool) {
  return pool.map((item) => item.id).join("|");
}

function updateCurrentAudioListIfOpen() {
  if (!$("#currentAudioList").classList.contains("hidden")) {
    buildCurrentAudioList({ force: true });
  }
}

function updateQuestionCountUI() {
  const auto = $("#qAuto").checked;
  const input = $("#qCount");
  input.disabled = auto;
  if (auto) {
    const pool = currentPool();
    input.value = String(pool.length || 0);
  }
}

function updateSpeakingQuestionCountUI() {
  const auto = $("#qAutoSpeaking").checked;
  const input = $("#qCountSpeaking");
  input.disabled = auto;
  if (auto) {
    const pool = currentSpeakingPool();
    input.value = String(pool.length || 0);
  }
}

function renderCurrentAudioList(entries) {
  const rowsHost = $("#currentAudioRows");
  const summary = $("#currentAudioSummary");
  const meta = $("#currentAudioMeta");
  const missingOnly = $("#currentAudioMissingOnly").checked;
  const filtered = missingOnly ? entries.filter(({ url }) => !url) : entries;
  const found = entries.filter(({ url }) => url).length;

  rowsHost.innerHTML = "";
  if (!filtered.length) {
    rowsHost.innerHTML = `<div class="hint">${missingOnly ? "No missing audio in the current selection." : "No words in the current selection."}</div>`;
  } else {
    filtered.forEach(({ item, url }) => {
      const row = document.createElement("div");
      row.className = "audioRow";
      const audioId = audioIdForItem(item);
      const filename = url ? displayAudioFilename(url) : expectedAudioFilename(audioId);
      row.innerHTML = `
        <div>
          <div class="audioRowTitle">${jpDisplay(item, "both")}</div>
          <div class="hint">${item.en || ""}</div>
        </div>
        <div class="audioRowMeta">
          <div class="audioStatus ${url ? "" : "missing"}">${url ? "Audio found" : "Missing audio"}</div>
          <div class="audioFile">${filename}</div>
        </div>
      `;
      const metaCol = row.querySelector(".audioRowMeta");
      const btn = document.createElement("button");
      btn.className = "btn subtle audioPlayBtn";
      btn.type = "button";
      btn.textContent = url ? "Play" : "No audio";
      btn.disabled = !url;
      if (url) {
        btn.addEventListener("click", () => playItemAudio(item));
      }
      metaCol.appendChild(btn);
      rowsHost.appendChild(row);
    });
  }

  if (missingOnly) {
    summary.textContent = `Showing ${filtered.length} missing audio words.`;
  } else {
    summary.textContent = `Showing ${filtered.length} words.`;
  }
  meta.textContent = `Audio found: ${found}/${entries.length}.`;
}

async function buildCurrentAudioList({ force = false } = {}) {
  const list = $("#currentAudioList");
  const rowsHost = $("#currentAudioRows");
  const summary = $("#currentAudioSummary");
  const meta = $("#currentAudioMeta");

  list.classList.remove("hidden");
  rowsHost.innerHTML = `<div class="hint">Loading current words…</div>`;
  const pool = currentPool();
  if (!pool.length) {
    rowsHost.innerHTML = `<div class="hint">No words in the current selection.</div>`;
    summary.textContent = "No words selected.";
    meta.textContent = "Nothing to show.";
    CURRENT_AUDIO_ENTRIES = [];
    CURRENT_AUDIO_SIGNATURE = "";
    return;
  }

  const signature = currentPoolSignature(pool);
  if (!force && CURRENT_AUDIO_SIGNATURE === signature && CURRENT_AUDIO_ENTRIES.length) {
    renderCurrentAudioList(CURRENT_AUDIO_ENTRIES);
    return;
  }

  clearAudioCache();
  const entries = await Promise.all(pool.map(async (item) => {
    const audioId = audioIdForItem(item);
    const url = await resolveAudioUrl(audioId);
    return { item, url, audioId };
  }));
  CURRENT_AUDIO_ENTRIES = entries;
  CURRENT_AUDIO_SIGNATURE = signature;
  renderCurrentAudioList(entries);
}

async function loadData() {
  const idx = await fetch("./lessons/index.json").then(r => r.json());
  LESSONS = idx.lessons || [];
  const all = [];
  for (const l of LESSONS) {
    const arr = await fetch(l.file).then(r => r.json());
    for (const it of arr) all.push(it);
  }
  loadVocabEdits();
  all.forEach(applyVocabEditsToItem);
  ITEMS = all;
  ITEMS_BY_ID = new Map(ITEMS.map(it => [it.id, it]));
  $("#countTotal").textContent = String(ITEMS.length);

  loadStars();
  seedStarsIfNeeded();
  const saved = loadJSON(STORAGE.stars, null);
  if (Array.isArray(saved)) STARRED = new Set(saved);
  loadKanjiOverrides();

  buildLessonUI();
  buildVocabUI();
  refreshHeaderCounts();
  renderStats();
}

function buildLessonUI() {
  const buildLessonList = (hostId, onChange) => {
    const host = $(hostId);
    host.innerHTML = "";
    const groups = getLessonGroups();

    groups.forEach((group) => {
      const details = document.createElement("details");
      details.className = "lessonCategory";
      details.open = true;
      const groupCount = group.lessons.reduce((sum, lesson) => sum + (lesson.count || 0), 0);
      details.innerHTML = `
        <summary class="lessonCategorySummary">
          <span>
            <input type="checkbox" data-role="category" data-category="${group.key}" checked />
            <strong style="margin-left:6px;">${group.name}</strong>
          </span>
          <span class="meta">${groupCount} items</span>
        </summary>
      `;

      const lessonsHost = document.createElement("div");
      lessonsHost.className = "lessonCategoryLessons";
      group.lessons.forEach((l) => {
        const row = document.createElement("label");
        row.className = "lessonRow";
        row.innerHTML = `
          <span>
            <input type="checkbox" value="${l.code}" data-role="lesson" data-category="${group.key}" checked />
            <strong style="margin-left:6px;">${l.name}</strong>
          </span>
          <span class="meta">${l.count} items</span>
        `;
        lessonsHost.appendChild(row);
      });
      details.appendChild(lessonsHost);
      host.appendChild(details);
    });

    host.addEventListener("change", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.dataset.role === "category") {
        const cat = target.dataset.category;
        host.querySelectorAll(`input[data-role="lesson"][data-category="${cat}"]`).forEach((box) => {
          box.checked = target.checked;
        });
        target.indeterminate = false;
      }
      if (target.dataset.role === "lesson") {
        const cat = target.dataset.category;
        syncCategoryCheckboxState(hostId, cat);
      }
      onChange();
    });
    host.addEventListener("click", (e) => {
      const target = e.target;
      if (target instanceof HTMLInputElement && target.dataset.role === "category") {
        e.stopPropagation();
      }
    });

    syncAllCategoryCheckboxes(hostId);
  };

  buildLessonList("#lessonList", () => {
    refreshHeaderCounts();
    updateLessonHint();
    buildVocabUI();
    updateQuestionCountUI();
    updateCurrentAudioListIfOpen();
  });
  buildLessonList("#lessonListSpeaking", () => {
    updateSpeakingLessonHint();
    updateSpeakingQuestionCountUI();
  });
  buildLessonList("#vLessonList", () => {
    buildVocabUI();
  });

  updateLessonHint();
  updateSpeakingLessonHint();
  updateQuestionCountUI();
  updateSpeakingQuestionCountUI();
}

function updateLessonHint() {
  const pool = currentPool();
  $("#lessonHint").textContent = `Selected set: ${pool.length} item(s).`;
}

function updateSpeakingLessonHint() {
  const pool = currentSpeakingPool();
  $("#lessonHintSpeaking").textContent = `Selected set: ${pool.length} item(s).`;
}

function refreshHeaderCounts() {
  const codes = selectedLessonCodes();
  let inSet = ITEMS.filter(it => codes.includes(lesson_code(it.lesson)));
  $("#countInSet").textContent = String(inSet.length);
  $("#countStarred").textContent = String(Array.from(STARRED).length);
}

function updateListeningAvailability() {
  const on = SETTINGS.audioOn;
  const listenEn = $("#qListenEN");
  const listenJp = $("#qListenJP");
  const listenMixed = $("#qListenMixed");
  listenEn.disabled = !on;
  listenJp.disabled = !on;
  if (listenMixed) listenMixed.disabled = !on;
  if (!on) {
    const select = $("#qModeSelect");
    if (select.value.startsWith("listen") || select.value === "mixedlisten") {
      select.value = "mixed";
    }
  }
  updateAudioUI();
}

function getQMode() {
  return $("#qModeSelect")?.value || "en2jp";
}
function getAType() {
  return $("#aTypeSelect")?.value || "mc";
}
function getDMode() {
  return $("#dModeSelect")?.value || "kana";
}

function displayModeForItem(item, dmode) {
  if (!item) return dmode;
  return isKanjiOverride(item.id) ? "kanji" : dmode;
}

function canUseAudio() {
  return SETTINGS.audioOn;
}

function isMobileViewport() {
  return window.matchMedia?.("(max-width: 560px)")?.matches ?? false;
}

function isIphoneDevice() {
  return /iPhone/i.test(navigator.userAgent || "");
}

function setIphoneAudioSessionMixing() {
  if (!isIphoneDevice()) return;
  const session = navigator.audioSession;
  if (!session) return;
  if (session.type && session.type !== "ambient") {
    try {
      session.type = "ambient";
    } catch (e) {
      console.warn("Unable to set iPhone audio session type.", e);
    }
  }
}

let AUDIO = null;
let audioSeqToken = 0;
let vocabAudioToken = 0;

function updateAudioUI() {
  const on = SETTINGS.audioOn;
  const replay = $("#btnReplay");
  const replaySpeaking = $("#btnReplaySpeaking");
  if (replay) {
    replay.disabled = !on;
    replay.title = on ? "Replay (=)" : "Audio is off in Settings";
  }
  if (replaySpeaking) {
    replaySpeaking.disabled = !on;
    replaySpeaking.title = on ? "Replay audio" : "Audio is off in Settings";
  }
}

async function playItemAudio(item) {
  if (!item) return;
  if (!canUseAudio()) {
    toast("Audio is off in Settings.");
    return;
  }
  try {
    setIphoneAudioSessionMixing();
    audioSeqToken++;
    const myToken = audioSeqToken;
    const audioId = audioIdForItem(item);
    const src = await resolveAudioUrl(audioId);
    if (!src) {
      toast(`Missing audio for ${audioId}.`);
      return;
    }
    if (AUDIO) {
      AUDIO.pause();
      AUDIO.currentTime = 0;
      AUDIO.src = src;
    } else {
      AUDIO = new Audio(src);
      AUDIO.preload = "auto";
      AUDIO.setAttribute("playsinline", "");
      AUDIO.setAttribute("webkit-playsinline", "");
    }
    const baseVolume = Math.max(0, Math.min(1, Number(SETTINGS.volume ?? 0.9)));
    AUDIO.volume = baseVolume;
    AUDIO.load();
    await AUDIO.play();
    if (myToken !== audioSeqToken) {
      AUDIO.pause();
      AUDIO.currentTime = 0;
    }
  } catch (e) {
    if (e?.name === "NotAllowedError") {
      toast("Audio blocked by browser. Tap a button, then try again.");
      return;
    }
    if (e?.name === "AbortError") {
      return;
    }
    const audioId = audioIdForItem(item);
    console.warn(`Audio failed for ${audioId}.`, e);
    toast(`Audio failed for ${audioId}.`);
  }
}

function showView(view) {
  for (const v of ["study","speaking","vocab","stats","settings"]) {
    const sec = document.getElementById(`view-${v}`);
    sec.classList.toggle("hidden", v !== view);
    document.querySelector(`.navBtn[data-view='${v}']`).classList.toggle("active", v === view);
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function sample(arr, n) {
  return shuffle(arr).slice(0, n);
}

function makeQuestion(item, qmode, atype) {
  let qm = qmode;
  if (qm === "mixed") {
    const allowed = ["en2jp","jp2en"];
    qm = allowed[Math.floor(Math.random()*allowed.length)];
  }
  if (qm === "mixedlisten") {
    const allowed = SETTINGS.audioOn ? ["listen2en","listen2jp"] : ["en2jp","jp2en"];
    qm = allowed[Math.floor(Math.random()*allowed.length)];
  }
  let am = atype;
  if (am === "mixed") am = Math.random() < 0.5 ? "mc" : "type";
  return { item, qmode: qm, atype: am };
}

function promptTextForQuestion(q, dmode) {
  const it = q.item;
  if (q.qmode === "en2jp") return it.en;
  if (q.qmode === "jp2en") return jpDisplay(it, displayModeForItem(it, dmode));
  if (q.qmode.startsWith("listen")) return "🎧 Listening… (press =)";
  return it.en;
}

function correctAnswerText(q, dmode) {
  const it = q.item;
  if (q.qmode === "en2jp" || q.qmode === "listen2jp") {
    return jpDisplay(it, displayModeForItem(it, dmode));
  }
  return it.en;
}

function buildMCOptions(q, pool, dmode) {
  const it = q.item;
  const isJPAnswer = (q.qmode === "en2jp" || q.qmode === "listen2jp");
  const correct = isJPAnswer ? jpDisplay(it, displayModeForItem(it, dmode)) : it.en;

  const others = pool.filter(x => x.id !== it.id);
  const picks = sample(others, 12);
  const mapped = picks.map(x => isJPAnswer ? jpDisplay(x, displayModeForItem(x, dmode)) : x.en);
  const uniqs = uniq(mapped.filter(Boolean).filter(x => x !== correct));
  const distractors = sample(uniqs, 3);
  const options = shuffle([correct, ...distractors]);
  return { correct, options };
}

function gradeJapaneseResponse(item, user, smartGrade) {
  if (!smartGrade) {
    const u = (user || "").trim();
    const acceptable = jpAcceptableAnswers(item, "both").map((x) => (x || "").trim());
    return acceptable.some((a) => a && a === u);
  }
  const u = normJP(user);
  if (!u) return false;
  const acceptable = jpAcceptableAnswers(item, "both").map(normJP).filter(Boolean);
  return acceptable.some((a) => a === u);
}

function gradeTyping(q, user, dmode) {
  const it = q.item;
  if (!SETTINGS.smartGrade) {
    if (q.qmode === "en2jp" || q.qmode === "listen2jp") {
      return gradeJapaneseResponse(it, user, false);
    }
    const u = (user || "").trim();
    const exp = correctAnswerText(q, dmode).trim();
    return u === exp;
  }

  if (q.qmode === "jp2en" || q.qmode === "listen2en") {
    const uVariants = englishVariants(user);
    const aliases = englishAliases(it.en).flatMap(englishVariants).filter(Boolean);
    if (uVariants.length === 0) return false;
    return uVariants.some((u) => aliases.some((a) => a && (u === a || u.includes(a) || a.includes(u))));
  }

  return gradeJapaneseResponse(it, user, true);
}

function makeSpeakingQuestion(item, qmode) {
  let qm = qmode;
  if (qm !== "en2jp" && qm !== "jpSpeak") qm = "en2jp";
  return { item, qmode: qm, atype: "speak" };
}

function promptTextForSpeakingQuestion(q, dmode) {
  if (q.qmode === "jpSpeak") {
    return jpDisplay(q.item, displayModeForItem(q.item, dmode));
  }
  return q.item.en;
}

let QUIZ = {
  active: false,
  pool: [],
  questions: [],
  idx: 0,
  current: null,
  awaitingNext: false,
  correctCount: 0
};

let SPEAK = {
  active: false,
  pool: [],
  questions: [],
  idx: 0,
  current: null,
  awaitingNext: false,
  correctCount: 0,
  listening: false,
  recognition: null,
  listenTimeoutId: null,
  stopping: false
};

function isSpeechRecognitionAvailable() {
  return !!SpeechRecognitionCtor;
}

function updateSpeakingSupportUI() {
  const unsupported = !isSpeechRecognitionAvailable();
  $("#speakUnsupported").classList.toggle("hidden", !unsupported);
  $("#btnStartSpeaking").disabled = unsupported;
  $("#btnPracticeStarredSpeaking").disabled = unsupported;
}

function resetQuizUI() {
  $("#quizArea").classList.add("hidden");
  $("#studySetup").classList.remove("hidden");
  $("#answerMC").classList.add("hidden");
  $("#answerType").classList.add("hidden");
  $("#feedback").classList.add("hidden");
  $("#feedback").textContent = "";
  $("#prompt").textContent = "—";
  $("#quizCourse").textContent = "JAPN1200 • —";
  $("#quizProgress").textContent = "—";
  $("#btnNext").disabled = true;
}

function setQuizVisibility(active) {
  $("#quizArea").classList.toggle("hidden", !active);
  $("#studySetup").classList.toggle("hidden", active);
}

function startQuiz(forceStarredOnly=false) {
  const pool0 = currentPool();
  let pool = pool0;

  if (forceStarredOnly) pool = pool.filter(it => isStarred(it.id));
  if (pool.length === 0) {
    toast("No items in your selected set.");
    return;
  }
  const useAuto = $("#qAuto").checked;
  const qCount = useAuto
    ? pool.length
    : Math.max(1, Math.min(500, Number($("#qCount").value || 20)));
  const maxCount = Math.min(qCount, pool.length);
  if (qCount > pool.length) {
    toast(`Only ${pool.length} items available — quiz set to ${pool.length}.`);
  }
  const qmode = getQMode();
  const atype = getAType();

  const questions = shuffle(pool).slice(0, maxCount).map(it => makeQuestion(it, qmode, atype));

  QUIZ = {
    active: true,
    pool,
    questions,
    idx: 0,
    current: null,
    awaitingNext: false,
    correctCount: 0,
    starFiltered: forceStarredOnly || $("#filterStarredOnly").checked
  };

  setQuizVisibility(true);
  nextQuestion();
}

function setStarButton(item) {
  const on = isStarred(item.id);
  $("#btnToggleStar").textContent = on ? "⭐" : "☆";
}

function maybeAutoplay(q) {
  if (!SETTINGS.autoplay) return;
  const isJapaneseQuestion = q.qmode === "jp2en" || q.qmode.startsWith("listen");
  if (isJapaneseQuestion) playItemAudio(q.item);
}

function nextQuestion() {
  QUIZ.awaitingNext = false;
  $("#feedback").classList.add("hidden");
  $("#feedback").textContent = "";
  $("#answerInput").value = "";
  $("#btnNext").disabled = true;

  if (QUIZ.idx >= QUIZ.questions.length) {
    endQuiz();
    return;
  }

  const q = QUIZ.questions[QUIZ.idx];
  QUIZ.current = q;
  const dmode = getDMode();

  $("#quizCourse").textContent = `JAPN1200 • ${q.item.lesson}`;
  $("#quizProgress").textContent = `Question ${QUIZ.idx+1}/${QUIZ.questions.length}`;
  $("#quizSub").textContent = `Correct: ${QUIZ.correctCount} • Pool: ${QUIZ.pool.length}`;
  $("#prompt").textContent = promptTextForQuestion(q, dmode);

  setStarButton(q.item);

  const isTyping = q.atype === "type";
  $("#answerType").classList.toggle("hidden", !isTyping);
  $("#answerMC").classList.toggle("hidden", isTyping);

  if (isTyping) {
    $("#answerInput").placeholder = (q.qmode === "jp2en" || q.qmode === "listen2en") ? "Type English…" : "Type Japanese…";
    setTimeout(() => $("#answerInput").focus(), 0);
  } else {
    renderMC(q);
  }

  maybeAutoplay(q);
}

function renderMC(q) {
  const dmode = getDMode();
  const { correct, options } = buildMCOptions(q, QUIZ.pool, dmode);
  const host = $("#answerMC");
  host.innerHTML = "";
  options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.dataset.index = String(i);
    b.dataset.value = opt;
    const index = document.createElement("span");
    index.className = "choiceIndex";
    index.textContent = String(i + 1);
    const label = document.createElement("span");
    label.className = "choiceText";
    label.textContent = opt;
    b.append(index, label);
    b.addEventListener("click", () => submitMC(opt, correct));
    host.appendChild(b);
  });
}

function lockMC(correct, picked) {
  const buttons = $$("#answerMC .choice");
  buttons.forEach(b => {
    b.disabled = true;
    const value = b.dataset.value || b.textContent;
    if (value === correct) b.classList.add("correct");
    if (value === picked && picked !== correct) b.classList.add("wrong");
  });
}

function showFeedback(ok, detail) {
  const fb = $("#feedback");
  fb.classList.remove("hidden");
  fb.classList.toggle("good", ok);
  fb.classList.toggle("bad", !ok);
  fb.textContent = detail;
}

function submitMC(picked, correct) {
  if (QUIZ.awaitingNext) return;
  const q = QUIZ.current;
  const ok = picked === correct;
  QUIZ.awaitingNext = true;
  lockMC(correct, picked);
  $("#btnNext").disabled = false;

  recordAttempt(q.item.id, ok);
  if (ok) QUIZ.correctCount += 1;

  const exp = correctAnswerText(q, getDMode());
  const detail = ok ? "✅ Correct" : `❌ Incorrect • Correct: ${exp}`;
  showFeedback(ok, detail);
}

function submitTyping() {
  if (QUIZ.awaitingNext) return;
  const q = QUIZ.current;
  const user = $("#answerInput").value;
  if (!user.trim()) return;
  const ok = gradeTyping(q, user, getDMode());
  QUIZ.awaitingNext = true;
  $("#btnNext").disabled = false;

  recordAttempt(q.item.id, ok);
  if (ok) QUIZ.correctCount += 1;

  const exp = correctAnswerText(q, getDMode());
  const detail = ok ? "✅ Correct" : `❌ Incorrect • Correct: ${exp}`;
  showFeedback(ok, detail);
}

function endQuiz() {
  QUIZ.active = false;
  const total = QUIZ.questions.length;
  const correct = QUIZ.correctCount;
  toast(`Finished: ${correct}/${total}`);
  renderStats();
  resetQuizUI();
}

function resetSpeakingUI() {
  $("#speakingArea").classList.add("hidden");
  $("#speakingSetup").classList.remove("hidden");
  $("#speakingPrompt").textContent = "—";
  $("#speakingStatus").textContent = "Press the microphone and speak Japanese.";
  $("#speakingHeard").classList.add("hidden");
  $("#speakingHeard").textContent = "";
  $("#speakingFeedback").classList.add("hidden");
  $("#speakingFeedback").textContent = "";
  $("#speakingCourse").textContent = "JAPN1200 • —";
  $("#speakingProgress").textContent = "—";
  $("#speakingSub").textContent = "—";
  $("#btnNextSpeaking").disabled = true;
  $("#btnSpeakListen").classList.remove("listening");
  $("#btnSpeakListen").textContent = "🎤 Tap to speak";
}

function setSpeakingVisibility(active) {
  $("#speakingArea").classList.toggle("hidden", !active);
  $("#speakingSetup").classList.toggle("hidden", active);
}

function setSpeakingStarButton(item) {
  const on = isStarred(item.id);
  $("#btnToggleStarSpeaking").textContent = on ? "⭐" : "☆";
}

function setSpeakListenButtonState(listening) {
  $("#btnSpeakListen").classList.toggle("listening", listening);
  $("#btnSpeakListen").textContent = listening ? "🛑 Stop listening" : "🎤 Tap to speak";
}

function clearSpeakingListenTimeout() {
  if (!SPEAK.listenTimeoutId) return;
  clearTimeout(SPEAK.listenTimeoutId);
  SPEAK.listenTimeoutId = null;
}

function stopSpeakingRecognition({ manual = false, updateStatus = false } = {}) {
  SPEAK.stopping = manual;
  clearSpeakingListenTimeout();
  if (SPEAK.recognition && SPEAK.listening) {
    try {
      SPEAK.recognition.stop();
    } catch {
      try {
        SPEAK.recognition.abort?.();
      } catch {}
    }
  }
  SPEAK.listening = false;
  SPEAK.recognition = null;
  setSpeakListenButtonState(false);
  if (updateStatus) {
    $("#speakingStatus").textContent = manual ? "Listening stopped." : "Ready.";
  }
}

function startSpeakingSession(forceStarredOnly = false) {
  if (!isSpeechRecognitionAvailable()) {
    toast("Speech recognition is not available in this browser.");
    return;
  }
  const pool0 = currentSpeakingPool();
  let pool = pool0;
  if (forceStarredOnly) pool = pool.filter((it) => isStarred(it.id));
  if (!pool.length) {
    toast("No items in your selected set.");
    return;
  }

  const useAuto = $("#qAutoSpeaking").checked;
  const qCount = useAuto
    ? pool.length
    : Math.max(1, Math.min(500, Number($("#qCountSpeaking").value || 20)));
  const maxCount = Math.min(qCount, pool.length);
  if (qCount > pool.length) {
    toast(`Only ${pool.length} items available — speaking set to ${pool.length}.`);
  }

  const qmode = $("#speakQModeSelect").value || "en2jp";
  const questions = shuffle(pool).slice(0, maxCount).map((it) => makeSpeakingQuestion(it, qmode));

  SPEAK = {
    active: true,
    pool,
    questions,
    idx: 0,
    current: null,
    awaitingNext: false,
    correctCount: 0,
    listening: false,
    recognition: null,
    listenTimeoutId: null,
    stopping: false,
    starFiltered: forceStarredOnly || $("#filterStarredOnlySpeaking").checked
  };

  setSpeakingVisibility(true);
  nextSpeakingQuestion();
}

function showSpeakingFeedback(ok, detail, heardText) {
  const heard = $("#speakingHeard");
  const fb = $("#speakingFeedback");
  heard.classList.remove("hidden");
  heard.classList.remove("good", "bad");
  heard.textContent = `Heard: ${heardText || "—"}`;
  fb.classList.remove("hidden");
  fb.classList.toggle("good", ok);
  fb.classList.toggle("bad", !ok);
  fb.textContent = detail;
}

function submitSpeakingResult(transcript) {
  if (!SPEAK.active || SPEAK.awaitingNext) return;
  const q = SPEAK.current;
  const ok = gradeJapaneseResponse(q.item, transcript, SETTINGS.smartGrade);
  SPEAK.awaitingNext = true;
  $("#btnNextSpeaking").disabled = false;
  recordAttempt(q.item.id, ok);
  if (ok) SPEAK.correctCount += 1;
  const exp = jpDisplay(q.item, displayModeForItem(q.item, $("#speakDModeSelect").value || "kana"));
  const detail = ok ? "✅ Correct" : `❌ Incorrect • Correct: ${exp}`;
  showSpeakingFeedback(ok, detail, transcript);
}

function startListeningForSpeaking() {
  if (!SPEAK.active || SPEAK.awaitingNext) return;
  if (SPEAK.listening) {
    stopSpeakingRecognition({ manual: true, updateStatus: true });
    return;
  }
  if (!isSpeechRecognitionAvailable()) {
    toast("Speech recognition is not available in this browser.");
    return;
  }

  const recognition = new SpeechRecognitionCtor();
  SPEAK.recognition = recognition;
  recognition.lang = "ja-JP";
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 3;

  SPEAK.listening = true;
  SPEAK.stopping = false;
  setSpeakListenButtonState(true);
  $("#speakingStatus").textContent = "Listening… speak now.";

  recognition.onresult = (event) => {
    const result = event.results?.[0]?.[0]?.transcript?.trim() || "";
    $("#speakingStatus").textContent = result ? "Recognition complete." : "Could not hear clearly. Try again.";
    if (result) submitSpeakingResult(result);
  };
  recognition.onerror = (event) => {
    const code = event?.error || "unknown";
    const msg = code === "not-allowed"
      ? "Microphone permission denied."
      : code === "aborted"
        ? "Listening stopped."
      : "Speech recognition failed. Please try again.";
    $("#speakingStatus").textContent = msg;
  };
  recognition.onend = () => {
    clearSpeakingListenTimeout();
    SPEAK.listening = false;
    SPEAK.recognition = null;
    setSpeakListenButtonState(false);
    SPEAK.stopping = false;
  };

  try {
    recognition.start();
    clearSpeakingListenTimeout();
    SPEAK.listenTimeoutId = setTimeout(() => {
      if (!SPEAK.listening) return;
      stopSpeakingRecognition({ manual: true, updateStatus: true });
      toast("Listening timed out. Tap the mic to try again.");
    }, 9000);
  } catch {
    stopSpeakingRecognition();
    $("#speakingStatus").textContent = "Speech recognition is unavailable right now.";
  }
}

function nextSpeakingQuestion() {
  SPEAK.awaitingNext = false;
  $("#btnNextSpeaking").disabled = true;
  $("#speakingHeard").classList.add("hidden");
  $("#speakingFeedback").classList.add("hidden");
  $("#speakingHeard").textContent = "";
  $("#speakingFeedback").textContent = "";
  $("#speakingStatus").textContent = "Press the microphone and speak Japanese.";

  if (SPEAK.idx >= SPEAK.questions.length) {
    endSpeakingSession();
    return;
  }

  const q = SPEAK.questions[SPEAK.idx];
  SPEAK.current = q;
  const dmode = $("#speakDModeSelect").value || "kana";
  $("#speakingCourse").textContent = `JAPN1200 • ${q.item.lesson}`;
  $("#speakingProgress").textContent = `Question ${SPEAK.idx + 1}/${SPEAK.questions.length}`;
  $("#speakingSub").textContent = `Correct: ${SPEAK.correctCount} • Pool: ${SPEAK.pool.length}`;
  $("#speakingPrompt").textContent = promptTextForSpeakingQuestion(q, dmode);
  setSpeakingStarButton(q.item);
}

function endSpeakingSession() {
  stopSpeakingRecognition();
  SPEAK.active = false;
  const total = SPEAK.questions.length;
  const correct = SPEAK.correctCount;
  toast(`Speaking finished: ${correct}/${total}`);
  renderStats();
  resetSpeakingUI();
}

function buildVocabUI() {
  const starOnly = $("#vStarOnly").checked;
  const lessonFilters = selectedLessonCodesIn("#vLessonList");
  const display = $("#vDisplay").value;
  const q = ($("#vSearch").value || "").trim();

  let rows = ITEMS.slice();
  if (lessonFilters.length) {
    rows = rows.filter((it) => lessonFilters.includes(lesson_code(it.lesson)));
  } else {
    rows = [];
  }
  if (starOnly) rows = rows.filter(it => isStarred(it.id));
  if (q) {
    const qn = q.toLowerCase();
    rows = rows.filter(it =>
      (it.en || "").toLowerCase().includes(qn) ||
      (it.jp_kana || "").includes(q) ||
      (it.jp_kanji || "").includes(q)
    );
  }

  const sortMode = $("#vSort")?.value || "default";
  if (sortMode === "kanji_asc" || sortMode === "kanji_desc") {
    const dir = sortMode === "kanji_asc" ? 1 : -1;
    rows.sort((a, b) => {
      const aKanji = normJP(a.jp_kanji || a.jp_kana || "");
      const bKanji = normJP(b.jp_kanji || b.jp_kana || "");
      const kanjiCmp = aKanji.localeCompare(bKanji, "ja");
      if (kanjiCmp !== 0) return kanjiCmp * dir;
      const aEn = (a.en || "").toLowerCase();
      const bEn = (b.en || "").toLowerCase();
      return aEn.localeCompare(bEn) * dir;
    });
  }

  const host = $("#vTable");
  host.innerHTML = "";
  const rowEls = [];
  rows.forEach(it => {
    const tr = document.createElement("tr");
    tr.dataset.id = it.id;
    const starOn = isStarred(it.id);
    const kanjiOn = isKanjiOverride(it.id);
    const rowDisplay = kanjiOn ? "kanji" : display;
    const audioId = audioIdForItem(it);
    tr.innerHTML = `
      <td><button class="starBtn ${starOn ? "on" : ""}" data-id="${it.id}">${starOn ? "⭐" : "☆"}</button></td>
      <td><button class="kanjiBtn ${kanjiOn ? "on" : ""}" data-id="${it.id}" title="Toggle kanji-only for this word">${kanjiOn ? "漢" : "かな"}</button></td>
      <td>
        <div class="vocabView">
          <div class="jpDisplayText" style="font-weight:800;">${jpDisplay(it, rowDisplay)}</div>
          <div class="hint audioHint">${audioId}</div>
        </div>
        <div class="vocabEdit hidden">
          <div class="vocabEditGrid">
            <label class="vocabEditField">Kana
              <input class="input compact" type="text" data-field="jp_kana" value="${it.jp_kana || ""}" />
            </label>
            <label class="vocabEditField">Kanji
              <input class="input compact" type="text" data-field="jp_kanji" value="${it.jp_kanji || ""}" />
            </label>
          </div>
          <div class="hint">Leave blank to remove a field.</div>
        </div>
      </td>
      <td>
        <div class="vocabView enDisplayText">${it.en}</div>
        <div class="vocabEdit hidden">
          <input class="input compact" type="text" data-field="en" value="${it.en || ""}" />
        </div>
      </td>
      <td><span class="hint">${it.lesson}</span></td>
      <td><button class="audioBtn" data-a="${it.id}">🔊</button></td>
      <td class="vocabActions">
        <div class="vocabView">
          <button class="btn subtle editBtn" data-id="${it.id}">Edit</button>
        </div>
        <div class="vocabEdit hidden">
          <div class="row gap">
            <button class="btn primary saveBtn" data-id="${it.id}">Save</button>
            <button class="btn subtle cancelBtn" data-id="${it.id}">Cancel</button>
          </div>
        </div>
      </td>
    `;
    host.appendChild(tr);
    rowEls.push(tr);
  });

  host.querySelectorAll(".starBtn").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-id");
      const on = toggleStar(id);
      b.textContent = on ? "⭐" : "☆";
      b.classList.toggle("on", on);
    });
  });

  host.querySelectorAll(".audioBtn").forEach(b => {
    const isOn = SETTINGS.audioOn;
    b.disabled = !isOn;
    b.title = isOn ? "Play audio (=)" : "Audio is off in Settings";
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-a");
      const it = ITEMS_BY_ID.get(id);
      await playItemAudio(it);
    });
  });

  host.querySelectorAll(".kanjiBtn").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-id");
      const on = toggleKanjiOverride(id);
      b.textContent = on ? "漢" : "かな";
      b.classList.toggle("on", on);
      const cell = b.closest("tr")?.querySelector(".jpDisplayText");
      if (cell) {
        const item = ITEMS_BY_ID.get(id);
        const mode = on ? "kanji" : display;
        cell.textContent = jpDisplay(item, mode);
      }
    });
  });

  host.querySelectorAll(".editBtn").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-id");
      const row = b.closest("tr");
      const item = ITEMS_BY_ID.get(id);
      if (!row || !item) return;
      populateVocabEditRow(row, item);
      setVocabRowEditing(row, true);
    });
  });

  host.querySelectorAll(".cancelBtn").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-id");
      const row = b.closest("tr");
      const item = ITEMS_BY_ID.get(id);
      if (!row || !item) return;
      populateVocabEditRow(row, item);
      setVocabRowEditing(row, false);
    });
  });

  host.querySelectorAll(".saveBtn").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-id");
      const row = b.closest("tr");
      const item = ITEMS_BY_ID.get(id);
      if (!row || !item) return;
      const kanaInput = row.querySelector("[data-field='jp_kana']");
      const kanjiInput = row.querySelector("[data-field='jp_kanji']");
      const enInput = row.querySelector("[data-field='en']");
      const next = {
        jp_kana: kanaInput ? kanaInput.value.trim() : "",
        jp_kanji: kanjiInput ? kanjiInput.value.trim() : "",
        en: enInput ? enInput.value.trim() : ""
      };
      item.jp_kana = next.jp_kana;
      item.jp_kanji = next.jp_kanji;
      item.en = next.en;
      VOCAB_EDITS[id] = next;
      saveVocabEdits();
      updateVocabRowDisplay(row, item, display);
      setVocabRowEditing(row, false);
      updateCurrentAudioListIfOpen();
      renderStats();
    });
  });

  updateVocabAudioHints(rowEls);
  $("#vCountHint").textContent = `Showing ${rows.length} of ${ITEMS.length} total.`;
}

async function updateVocabAudioHints(rows) {
  const myToken = ++vocabAudioToken;
  for (const row of rows) {
    const id = row.dataset.id;
    const item = ITEMS_BY_ID.get(id);
    if (!item) continue;
    const audioId = audioIdForItem(item);
    const hintEl = row.querySelector(".audioHint");
    if (!hintEl) continue;
    const url = await resolveAudioUrl(audioId);
    if (myToken !== vocabAudioToken) return;
    const filename = url ? displayAudioFilename(url) : expectedAudioFilename(audioId);
    hintEl.textContent = audioId !== id ? `ID: ${id} • Audio: ${filename}` : filename;
  }
}

function renderStats() {
  const s = getStats();
  $("#statTotalAttempts").textContent = String(s.attempts || 0);
  const acc = (s.attempts ? Math.round((s.correct/s.attempts)*100) : 0);
  $("#statAccuracy").textContent = `${acc}%`;

  const arr = Object.entries(s.perItem || {})
    .map(([id, v]) => ({ id, a: v.a || 0, c: v.c || 0, miss: (v.a||0)-(v.c||0) }))
    .filter(x => x.a >= 3 && x.miss > 0)
    .sort((a,b) => b.miss - a.miss)
    .slice(0, 10);

  const host = $("#missList");
  if (!arr.length) {
    host.textContent = "No misses yet (or not enough attempts).";
    return;
  }
  host.innerHTML = "";
  arr.forEach(x => {
    const it = ITEMS_BY_ID.get(x.id);
    const row = document.createElement("div");
    row.className = "missRow";
    row.innerHTML = `
      <div>
        <div style="font-weight:900;">${it ? jpDisplay(it, "both") : x.id}</div>
        <div class="hint">${it ? it.en : ""} • Misses: ${x.miss}/${x.a}</div>
      </div>
      <div class="row gap">
        <button class="btn subtle" data-play="${x.id}">🔊</button>
        <button class="btn subtle" data-star="${x.id}">${isStarred(x.id) ? "⭐" : "☆"}</button>
      </div>
    `;
    host.appendChild(row);
  });

  host.querySelectorAll("[data-play]").forEach(b => {
    b.addEventListener("click", () => {
      const it = ITEMS_BY_ID.get(b.getAttribute("data-play"));
      playItemAudio(it);
    });
  });
  host.querySelectorAll("[data-star]").forEach(b => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-star");
      const on = toggleStar(id);
      b.textContent = on ? "⭐" : "☆";
    });
  });
}

function wireUI() {
  const hasFinePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  const isNarrowView = window.matchMedia && window.matchMedia("(max-width: 720px)").matches;
  const isDesktopInput = hasFinePointer && !isNarrowView && !("ontouchstart" in window);

  $$(".navBtn").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  $("#btnAppRefresh").addEventListener("click", forceRefreshApp);

  $("#btnSelectAll").addEventListener("click", () => {
    setLessonSelections("#lessonList", true);
    refreshHeaderCounts(); updateLessonHint(); buildVocabUI(); updateQuestionCountUI();
    updateCurrentAudioListIfOpen();
  });
  $("#btnClearAll").addEventListener("click", () => {
    setLessonSelections("#lessonList", false);
    refreshHeaderCounts(); updateLessonHint(); buildVocabUI(); updateQuestionCountUI();
    updateCurrentAudioListIfOpen();
  });
  $("#btnStarredOnly").addEventListener("click", () => {
    setLessonSelections("#lessonList", true);
    $("#filterStarredOnly").checked = true;
    refreshHeaderCounts(); updateLessonHint(); buildVocabUI(); updateQuestionCountUI();
    updateCurrentAudioListIfOpen();
  });

  $("#btnStart").addEventListener("click", () => startQuiz(false));
  $("#btnPracticeStarred").addEventListener("click", () => startQuiz(true));

  $("#btnSelectAllSpeaking").addEventListener("click", () => {
    setLessonSelections("#lessonListSpeaking", true);
    updateSpeakingLessonHint();
    updateSpeakingQuestionCountUI();
  });
  $("#btnClearAllSpeaking").addEventListener("click", () => {
    setLessonSelections("#lessonListSpeaking", false);
    updateSpeakingLessonHint();
    updateSpeakingQuestionCountUI();
  });
  $("#btnStarredOnlySpeaking").addEventListener("click", () => {
    setLessonSelections("#lessonListSpeaking", true);
    $("#filterStarredOnlySpeaking").checked = true;
    updateSpeakingLessonHint();
    updateSpeakingQuestionCountUI();
  });
  $("#btnStartSpeaking").addEventListener("click", () => startSpeakingSession(false));
  $("#btnPracticeStarredSpeaking").addEventListener("click", () => startSpeakingSession(true));
  $("#btnReplaySpeaking").addEventListener("click", () => {
    if (!SPEAK.current) return;
    playItemAudio(SPEAK.current.item);
  });
  $("#btnToggleStarSpeaking").addEventListener("click", () => {
    if (!SPEAK.current) return;
    const on = toggleStar(SPEAK.current.item.id);
    $("#btnToggleStarSpeaking").textContent = on ? "⭐" : "☆";
  });
  $("#btnSpeakListen").addEventListener("click", startListeningForSpeaking);
  $("#btnNextSpeaking").addEventListener("click", () => {
    if (!SPEAK.active) return;
    if (!SPEAK.awaitingNext) {
      toast("Speak and submit an answer first.");
      return;
    }
    SPEAK.idx += 1;
    nextSpeakingQuestion();
  });
  $("#btnEndSpeaking").addEventListener("click", endSpeakingSession);

  $("#btnReplay").addEventListener("click", () => {
    if (!QUIZ.current) return;
    playItemAudio(QUIZ.current.item);
  });
  $("#btnToggleStar").addEventListener("click", () => {
    if (!QUIZ.current) return;
    const on = toggleStar(QUIZ.current.item.id);
    $("#btnToggleStar").textContent = on ? "⭐" : "☆";
  });

  const handleEnterAction = () => {
    if (!QUIZ.active) return;
    if (QUIZ.awaitingNext) {
      advanceToNext();
      return;
    }
    if (!$("#answerType").classList.contains("hidden")) {
      if (!$("#answerInput").value.trim()) return;
      submitTyping();
      return;
    }
    if (!$("#answerMC").classList.contains("hidden")) {
      toast("Pick an answer first.");
    }
  };

  $("#btnSubmit").addEventListener("click", submitTyping);
  $("#answerInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (!$("#answerInput").value.trim()) return;
      e.preventDefault();
      e.stopPropagation();
      handleEnterAction();
    }
  });

  function advanceToNext() {
    if (!QUIZ.active) return;
    if (!QUIZ.awaitingNext) {
      toast("Submit an answer first.");
      return;
    }
    QUIZ.idx += 1;
    nextQuestion();
  }

  $("#btnNext").addEventListener("click", advanceToNext);

  $("#btnEnd").addEventListener("click", () => endQuiz());

  $("#vSearch").addEventListener("input", buildVocabUI);
  $("#vStarOnly").addEventListener("change", buildVocabUI);
  $("#vDisplay").addEventListener("change", buildVocabUI);
  $("#vSort").addEventListener("change", buildVocabUI);
  $("#btnVSelectAll").addEventListener("click", () => {
    setLessonSelections("#vLessonList", true);
    buildVocabUI();
  });
  $("#btnVClearAll").addEventListener("click", () => {
    setLessonSelections("#vLessonList", false);
    buildVocabUI();
  });
  $("#vReset").addEventListener("click", () => {
    $("#vSearch").value = "";
    setLessonSelections("#vLessonList", true);
    $("#vStarOnly").checked = false;
    $("#vDisplay").value = "kana";
    $("#vSort").value = "default";
    buildVocabUI();
  });

  $("#filterStarredOnly").addEventListener("change", () => {
    refreshHeaderCounts();
    updateLessonHint();
    buildVocabUI();
    updateQuestionCountUI();
    updateCurrentAudioListIfOpen();
  });

  $("#qAuto").addEventListener("change", () => {
    updateQuestionCountUI();
  });
  $("#filterStarredOnlySpeaking").addEventListener("change", () => {
    updateSpeakingLessonHint();
    updateSpeakingQuestionCountUI();
  });
  $("#qAutoSpeaking").addEventListener("change", () => {
    updateSpeakingQuestionCountUI();
  });

  $("#setAudioOn").addEventListener("change", () => {
    SETTINGS = setSettings({ audioOn: $("#setAudioOn").checked });
    buildVocabUI();
  });
  $("#setVolume").addEventListener("input", () => {
    SETTINGS = setSettings({ volume: Number($("#setVolume").value) });
  });
  $("#setAutoplay").addEventListener("change", () => {
    SETTINGS = setSettings({ autoplay: $("#setAutoplay").checked });
  });
  $("#setSmartGrade").addEventListener("change", () => {
    SETTINGS = setSettings({ smartGrade: $("#setSmartGrade").checked });
  });
  $("#setBackgroundVideo").addEventListener("change", () => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    const select = $("#setBackgroundVideo");
    if (prefersReduced) {
      select.value = "off";
      SETTINGS = setSettings({ backgroundVideo: "off" });
      return;
    }
    SETTINGS = setSettings({ backgroundVideo: select.value });
  });
  $("#btnAudioCheck").addEventListener("click", async () => {
    const summary = $("#audioCheckSummary");
    summary.textContent = "Checking audio files…";
    clearAudioCache();
    const ids = ITEMS.map((item) => audioIdForItem(item));
    let found = 0;
    const missing = [];
    for (const id of ids) {
      if (await hasAudioFile(id)) {
        found += 1;
      } else {
        missing.push(id);
      }
    }
    summary.textContent = `Found ${found}/${ids.length} audio files.`;
    if (missing.length) {
      console.warn("Missing audio files (first 10):", missing.slice(0, 10));
    }
  });

  $("#btnCurrentAudioList").addEventListener("click", async () => {
    await buildCurrentAudioList({ force: true });
  });

  $("#btnCloseCurrentAudio").addEventListener("click", () => {
    $("#currentAudioList").classList.add("hidden");
  });

  $("#currentAudioMissingOnly").addEventListener("change", () => {
    if ($("#currentAudioList").classList.contains("hidden")) return;
    if (!CURRENT_AUDIO_ENTRIES.length) {
      buildCurrentAudioList({ force: true });
      return;
    }
    renderCurrentAudioList(CURRENT_AUDIO_ENTRIES);
  });

  $("#btnReloadData").addEventListener("click", async () => {
    toast("Reloading lessons…");
    await loadData();
    toast("Reloaded.");
  });
  $("#btnResetStars").addEventListener("click", () => {
    if (!confirm("Reset all stars on this device?")) return;
    STARRED = new Set();
    saveStars();
    localStorage.removeItem(STORAGE.seeded);
    buildVocabUI();
    refreshHeaderCounts();
    updateLessonHint();
    updateQuestionCountUI();
    updateSpeakingQuestionCountUI();
    updateCurrentAudioListIfOpen();
    if (QUIZ.current) setStarButton(QUIZ.current.item);
    if (SPEAK.current) setSpeakingStarButton(SPEAK.current.item);
    if (QUIZ.active && QUIZ.starFiltered) {
      endQuiz();
    }
    if (SPEAK.active && SPEAK.starFiltered) {
      endSpeakingSession();
    }
    toast("Stars reset.");
  });
  $("#btnResetStats").addEventListener("click", () => {
    if (!confirm("Reset stats on this device?")) return;
    saveJSON(STORAGE.stats, { attempts: 0, correct: 0, perItem: {} });
    renderStats();
    toast("Stats reset.");
  });

  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    const inInput = tag === "input" || tag === "textarea" || e.target?.isContentEditable;
    const key = e.key;
    const isTypingMode = QUIZ.active && !$("#answerType").classList.contains("hidden");
    const isMCMode = QUIZ.active && !$("#answerMC").classList.contains("hidden");

    if (key === "=") {
      if (QUIZ.active) {
        e.preventDefault();
        if (QUIZ.current) playItemAudio(QUIZ.current.item);
      }
      if (SPEAK.active) {
        e.preventDefault();
        if (SPEAK.current) playItemAudio(SPEAK.current.item);
      }
      return;
    }
    if (key === "`") {
      if (QUIZ.active) {
        e.preventDefault();
        if (QUIZ.current) {
          const on = toggleStar(QUIZ.current.item.id);
          $("#btnToggleStar").textContent = on ? "⭐" : "☆";
        }
      }
      return;
    }

    if (isMCMode && ["1","2","3","4"].includes(key)) {
      e.preventDefault();
      const idx = Number(key) - 1;
      const btn = $$("#answerMC .choice")[idx];
      if (btn) btn.click();
      return;
    }

    if (SPEAK.active && key === "Enter" && !inInput) {
      e.preventDefault();
      if (SPEAK.awaitingNext) {
        SPEAK.idx += 1;
        nextSpeakingQuestion();
      } else {
        startListeningForSpeaking();
      }
      return;
    }

    if (key === "Enter" && QUIZ.active && !inInput) {
      e.preventDefault();
      handleEnterAction();
      return;
    }

    if (inInput) return;
    if (!isDesktopInput) return;

    if (key === "/" && QUIZ.active) {
      e.preventDefault();
      if (isTypingMode) $("#answerInput").focus();
      return;
    }

    if (!QUIZ.active) return;

    if (isTypingMode) {
      if (key === "Enter") {
        e.preventDefault();
        handleEnterAction();
        return;
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey && key.length === 1) {
        const input = $("#answerInput");
        e.preventDefault();
        input.focus();
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value = input.value.slice(0, start) + key + input.value.slice(end);
        const nextPos = start + key.length;
        input.setSelectionRange(nextPos, nextPos);
        return;
      }
    }

    if (key === "Enter") {
      e.preventDefault();
      handleEnterAction();
    }
  });

  showView("study");
  applySettingsToUI(SETTINGS);
  updateSpeakingSupportUI();
}

(async function init() {
  $("#settingsHint").textContent = "Stars and stats are saved only on this device/browser (personal).";
  $("#versionLabel").textContent = APP_VERSION;
  SETTINGS = getSettings();
  applySettingsToUI(SETTINGS);
  setIphoneAudioSessionMixing();
  wireUI();
  if ("serviceWorker" in navigator) {
    try {
      SW_REGISTRATION = await navigator.serviceWorker.register("./sw.js");
      if (SW_REGISTRATION.waiting) {
        toast("Update ready. Tap Refresh / Update App.");
      }
      SW_REGISTRATION.addEventListener("updatefound", () => {
        attachWaitingServiceWorker(SW_REGISTRATION.installing);
      });
      attachWaitingServiceWorker(SW_REGISTRATION.installing);
    } catch {
      // Ignore registration failures
    }
  }
  await loadData();
  updateQuestionCountUI();
})();
