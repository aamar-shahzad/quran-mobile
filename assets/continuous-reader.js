(function () {
  const EDGE_PX = 300;
  const MAX_SURAH_SECTIONS = 8;
  const MAX_MUSHAF_SECTIONS = 5;
  const WINDOW_RADIUS = 1;

  let scrollBound = false;
  let scrollTick = false;
  let sectionObserver = null;
  let pendingActiveSurah = null;
  let pendingActiveSurahHits = 0;
  let lastScrollTop = 0;
  let scrollDirectionBias = 0;
  let prefetchWarmTimer = null;

  function surahViewCached(h, surahNum) {
    const key = h.surahViewCacheKey(surahNum);
    const c = h.getState().surahViewCache.get(key);
    return !!(c?.arSurahPayload?.ayahs?.length && c?.enData?.code === 200);
  }

  function edgeSurahTarget(direction, min, max) {
    if (direction > 0) return max < 114 ? max + 1 : null;
    if (direction < 0) return min > 1 ? min - 1 : null;
    return null;
  }

  function maybeContinueEdgeOnce(direction) {
    const st = getHost().getState().continuousScroll || {};
    if (!st.edgeContinueAllowed || st.edgeLoading) return;
    st.edgeContinueAllowed = false;
    requestAnimationFrame(() => {
      const vp = document.getElementById("surahViewport");
      if (!vp) return;
      const range = listedSurahNums();
      if (!range.length) return;
      const min = range[0];
      const max = range[range.length - 1];
      const { scrollTop, scrollHeight, clientHeight } = vp;
      if (direction > 0) {
        if (scrollHeight - scrollTop - clientHeight >= EDGE_PX) return;
        const next = max + 1;
        if (next > 114 || sectionEl(next)) return;
        loadSurahEdge(1);
      } else if (direction < 0) {
        if (scrollTop >= EDGE_PX) return;
        const prev = min - 1;
        if (prev < 1 || sectionEl(prev)) return;
        loadSurahEdge(-1);
      }
    });
  }

  function getHost() {
    return window.__quranContinuousHost;
  }

  function usesContinuousScroll() {
    return !!getHost();
  }

  function isMushafMode() {
    const h = getHost();
    return h && h.isMushafPageScript(h.getScriptKey());
  }

  function surahNumFromGlobalAyah(globalAyah) {
    const surahs = getHost().getSurahs();
    let acc = 0;
    for (const s of surahs) {
      acc += s.numberOfAyahs;
      if (globalAyah <= acc) return s.number;
    }
    return 114;
  }

  function setScrollRange(min, max) {
    const st = getHost().getState();
    st.continuousScroll = st.continuousScroll || {};
    if (isMushafMode()) {
      st.continuousScroll.minPage = min;
      st.continuousScroll.maxPage = max;
    } else {
      st.continuousScroll.minSurah = min;
      st.continuousScroll.maxSurah = max;
    }
  }

  /* ——— Ayah / surah sections ——— */

  function sectionEl(surahNum) {
    return document.querySelector(`[data-continuous-surah="${surahNum}"]`);
  }

  function listedSurahNums() {
    return [...document.querySelectorAll("[data-continuous-surah]")]
      .map((el) => parseInt(el.getAttribute("data-continuous-surah"), 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  }

  function syncSurahRangeFromDom() {
    const nums = listedSurahNums();
    if (!nums.length) return;
    setScrollRange(nums[0], nums[nums.length - 1]);
  }

  function edgeLoadLabel(h, direction, kind) {
    if (kind === "mushaf") {
      return direction > 0 ? "Loading next page…" : "Loading previous page…";
    }
    if (h.isIndopakAyahScript?.()) {
      return direction > 0
        ? "Loading next surah (Indo-Pak)…"
        : "Loading previous surah (Indo-Pak)…";
    }
    return direction > 0 ? "Loading next surah…" : "Loading previous surah…";
  }

  function beginEdgeLoad(h, label) {
    h.setReaderEdgeLoading?.(true, { label });
  }

  function endEdgeLoad(h) {
    h.setReaderEdgeLoading?.(false);
  }

  function getEdgeLoadSignal(h) {
    const timeoutMs = h.getSurahFetchTimeoutMs?.() ?? 22000;
    const timeout =
      typeof AbortSignal !== "undefined" &&
      typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(timeoutMs)
        : null;
    const main = h.getState().surahLoadController?.signal;
    if (main && !main.aborted) {
      if (timeout && typeof AbortSignal.any === "function") {
        return AbortSignal.any([main, timeout]);
      }
      return main;
    }
    return timeout || undefined;
  }

  function getEdgeLoadSignal(h) {
    const nums = listedSurahNums();
    if (!nums.length) return fallbackSurah;
    const scrollSurah = pickActiveSurahFromViewport();
    const rangeMid = Math.round((nums[0] + nums[nums.length - 1]) / 2);
    return scrollSurah ?? rangeMid ?? fallbackSurah;
  }

  function pruneWindowRadius(h) {
    return h.isIndopakAyahScript?.() ? 2 : WINDOW_RADIUS;
  }

  function reportEdgeLoadError(h, err, context, meta = {}) {
    if (err?.name === "AbortError") return;
    console.warn(context, err);
    h.onContinuousEdgeLoadError?.(err, meta);
  }

  async function fetchPayload(surahNum, signal) {
    const h = getHost();
    const key = h.surahViewCacheKey(surahNum);
    const cached = h.getState().surahViewCache.get(key);
    if (cached?.arSurahPayload?.ayahs?.length && cached?.enData?.code === 200) {
      return {
        arSurahPayload: h.cloneViewPayload(cached.arSurahPayload),
        enData: h.cloneViewPayload(cached.enData),
      };
    }
    const payload = await h.ensureSurahViewCached(surahNum, {
      signal: h.withFetchTimeout(signal, h.getSurahFetchTimeoutMs?.() ?? 22000),
    });
    return {
      arSurahPayload: h.cloneViewPayload(payload.arSurahPayload),
      enData: h.cloneViewPayload(payload.enData),
    };
  }

  function normalizePayload(surahNum, arPayload) {
    const h = getHost();
    const scriptMode = h.getScriptFormat(h.getScriptKey()).mode;
    arPayload.ayahs = arPayload.ayahs.map((ayah) => ({
      ...ayah,
      text: h.normalizeAyahText(
        ayah.text,
        surahNum,
        ayah.numberInSurah,
        scriptMode,
      ),
    }));
    return arPayload;
  }

  function mountSection(surahNum, arPayload, enData, position) {
    const h = getHost();
    const versesList = document.getElementById("versesList");
    if (!versesList) return;
    const meta = h.getSurahs().find((s) => s.number === surahNum);
    const enAyahs = enData?.data?.ayahs || [];
    const html = h.buildContinuousSurahSectionHtml(
      surahNum,
      arPayload,
      enAyahs,
      meta,
    );
    const wrap = document.createElement("div");
    wrap.innerHTML = html.trim();
    const section = wrap.firstElementChild;
    if (!section) return;

    if (position === "prepend") {
      const vp = document.getElementById("surahViewport");
      const prevScroll = vp ? vp.scrollHeight : 0;
      versesList.insertBefore(section, versesList.firstChild);
      if (vp) {
        vp.scrollTop += vp.scrollHeight - prevScroll;
      }
    } else {
      versesList.appendChild(section);
    }
    h.observeContinuousSectionHeader(section);
  }

  async function mountSurah(surahNum, signal, position) {
    if (sectionEl(surahNum)) return;
    const payload = await fetchPayload(surahNum, signal);
    if (payload.enData?.code !== 200) throw new Error("translation");
    const ar = normalizePayload(
      surahNum,
      getHost().cloneViewPayload(payload.arSurahPayload),
    );
    mountSection(surahNum, ar, payload.enData, position);
    syncSurahRangeFromDom();
  }

  function pruneSurahSections(anchorSurah) {
    const h = getHost();
    let nums = listedSurahNums();
    if (nums.length <= MAX_SURAH_SECTIONS) return;
    const anchor = pruneAnchorSurah(anchorSurah);
    const radius = pruneWindowRadius(h);
    const dist = (n) => Math.abs(n - anchor);
    nums = [...nums].sort((a, b) => dist(b) - dist(a));
    while (listedSurahNums().length > MAX_SURAH_SECTIONS) {
      const remove = nums.shift();
      if (remove == null) break;
      if (dist(remove) <= radius) continue;
      const node = sectionEl(remove);
      unobserveSectionNode(node);
      node?.remove();
    }
    syncSurahRangeFromDom();
  }

  function applyActiveSurahData(surahNum) {
    const h = getHost();
    const key = h.surahViewCacheKey(surahNum);
    const cached = h.getState().surahViewCache.get(key);
    if (!cached?.arSurahPayload) return;
    const ar = normalizePayload(
      surahNum,
      h.cloneViewPayload(cached.arSurahPayload),
    );
    const st = h.getState();
    st.currentSurahNum = surahNum;
    st.currentSurahData = ar;
    st.currentSurahEnData = cached.enData?.data || null;
    h.syncReaderChrome();
  }

  function scrollToAyahInSection(surahNum, ayahNum) {
    const section = sectionEl(surahNum);
    if (!section || !ayahNum) return;
    const card = section.querySelector(`[data-ayah-in-surah="${ayahNum}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function unobserveSectionNode(section) {
    if (!sectionObserver || !section) return;
    section
      .querySelectorAll(".continuous-surah-header, .continuous-page-header")
      .forEach((header) => sectionObserver.unobserve(header));
  }

  function resetSectionObserver() {
    sectionObserver?.disconnect();
    sectionObserver = null;
  }

  async function loadSurahWindow(centerSurah, targetAyah, signal, replaceAll) {
    const h = getHost();
    const versesList = document.getElementById("versesList");
    if (!versesList) return;
    if (replaceAll) {
      resetSectionObserver();
      versesList.innerHTML = "";
      pendingActiveSurah = null;
      pendingActiveSurahHits = 0;
    }
    document.getElementById("surahHeaderCard")?.classList.add("hidden");

    const nums = [];
    for (
      let n = centerSurah - WINDOW_RADIUS;
      n <= centerSurah + WINDOW_RADIUS;
      n += 1
    ) {
      if (n >= 1 && n <= 114) nums.push(n);
    }
    await mountSurah(centerSurah, signal, "append");
    for (const n of nums) {
      if (n === centerSurah) continue;
      if (signal?.aborted) return;
      await mountSurah(n, signal, n < centerSurah ? "prepend" : "append");
    }
    setScrollRange(Math.min(...nums), Math.max(...nums));
    applyActiveSurahData(centerSurah);
    pruneSurahSections(centerSurah);
    h.closeAllTafsirPanelsExcept();
    h.syncReaderFocusMode();
    if (targetAyah) {
      requestAnimationFrame(() =>
        scrollToAyahInSection(centerSurah, targetAyah),
      );
    } else if (replaceAll) {
      document
        .getElementById("surahViewport")
        ?.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  async function loadSurahEdge(direction) {
    const h = getHost();
    const st = h.getState().continuousScroll || {};
    if (st.edgeLoading) return;
    const range = listedSurahNums();
    if (!range.length) return;
    const min = range[0];
    const max = range[range.length - 1];
    const target = edgeSurahTarget(direction, min, max);
    if (target == null || sectionEl(target)) return;

    const signal = getEdgeLoadSignal(h);
    h.getState().continuousScroll = st;
    st.edgeLoading = true;
    const showUi = !surahViewCached(h, target);
    if (showUi) beginEdgeLoad(h, edgeLoadLabel(h, direction, "surah"));
    let loaded = false;
    try {
      await mountSurah(
        target,
        signal,
        direction > 0 ? "append" : "prepend",
      );
      loaded = !!sectionEl(target);
      pruneSurahSections(h.getState().currentSurahNum);
      if (loaded) {
        h.prefetchSurahNeighbors(target, {
          preferDirection: direction,
          radius: 1,
        });
      }
    } catch (err) {
      reportEdgeLoadError(h, err, "Continuous scroll edge load failed", {
        direction,
        kind: "surah",
      });
    } finally {
      st.edgeLoading = false;
      st.lastEdgeFinishedAt = Date.now();
      if (showUi) endEdgeLoad(h);
      if (loaded) {
        h.hideReaderEdgeRetry?.();
        maybeContinueEdgeOnce(direction);
      }
    }
  }

  /* ——— Mushaf page sections ——— */

  function pageEl(pageNum) {
    return document.querySelector(`[data-continuous-page="${pageNum}"]`);
  }

  function listedPageNums() {
    return [...document.querySelectorAll("[data-continuous-page]")]
      .map((el) => parseInt(el.getAttribute("data-continuous-page"), 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  }

  function syncPageRangeFromDom() {
    const nums = listedPageNums();
    if (!nums.length) return;
    setScrollRange(nums[0], nums[nums.length - 1]);
  }

  async function mountMushafPage(pageNum, signal, position) {
    if (pageEl(pageNum)) return;
    const h = getHost();
    const st = h.getState();
    let verses = st.mushafPageCache?.get(pageNum);
    if (!verses?.length) {
      verses = await h.ensureMushafPageCached(
        pageNum,
        h.withFetchTimeout(signal),
      );
      if (!verses?.length) throw new Error("empty page");
    }
    const chaptersById = await h.ensureQuranChaptersMeta(
      h.withFetchTimeout(signal),
    );
    const html = h.buildMushafPageSectionHtml(pageNum, verses, chaptersById);
    const versesList = document.getElementById("versesList");
    if (!versesList) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = html.trim();
    const section = wrap.firstElementChild;
    if (!section) return;

    if (position === "prepend") {
      const vp = document.getElementById("surahViewport");
      const prevScroll = vp ? vp.scrollHeight : 0;
      versesList.insertBefore(section, versesList.firstChild);
      if (vp) {
        vp.scrollTop += vp.scrollHeight - prevScroll;
      }
    } else {
      versesList.appendChild(section);
    }
    h.bindMushafSectionRoot(section);
    observePageHeader(section);
    syncPageRangeFromDom();
  }

  function applyActiveMushafPage(pageNum) {
    const h = getHost();
    const st = h.getState();
    const verses = st.mushafPageCache?.get(pageNum);
    if (!verses?.length) return;
    h.applyActiveMushafPageFromVerses(pageNum, verses);
  }

  function pruneMushafSections(anchorPage) {
    let nums = listedPageNums();
    if (nums.length <= MAX_MUSHAF_SECTIONS) return;
    const rangeMid = Math.round((nums[0] + nums[nums.length - 1]) / 2);
    const anchor = anchorPage ?? rangeMid;
    const dist = (n) => Math.abs(n - anchor);
    nums = [...nums].sort((a, b) => dist(b) - dist(a));
    while (listedPageNums().length > MAX_MUSHAF_SECTIONS) {
      const remove = nums.shift();
      if (remove == null) break;
      if (dist(remove) <= 2) continue;
      const node = pageEl(remove);
      unobserveSectionNode(node);
      node?.remove();
    }
    syncPageRangeFromDom();
  }

  function scrollToAyahOnPage(pageNum, surahNum, ayahNum) {
    const section = pageEl(pageNum);
    if (!section || !ayahNum) return;
    const target = section.querySelector(
      `.mushaf-ayah-end[data-surah="${surahNum}"][data-ayah="${ayahNum}"], .mushaf-ayah-marker[data-surah="${surahNum}"][data-ayah="${ayahNum}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function loadMushafWindow(
    centerPage,
    targetSurah,
    targetAyah,
    signal,
    replaceAll,
  ) {
    const h = getHost();
    const maxPage = h.getMushafPageMax();
    const page = Math.min(maxPage, Math.max(1, parseInt(centerPage, 10) || 1));
    const versesList = document.getElementById("versesList");
    if (!versesList) return;
    if (replaceAll) {
      resetSectionObserver();
      versesList.innerHTML = "";
    }
    document.getElementById("surahHeaderCard")?.classList.add("hidden");

    const nums = [];
    for (let p = page - WINDOW_RADIUS; p <= page + WINDOW_RADIUS; p += 1) {
      if (p >= 1 && p <= maxPage) nums.push(p);
    }
    for (const p of nums) {
      if (signal?.aborted) return;
      await mountMushafPage(p, signal, p < page ? "prepend" : "append");
    }
    setScrollRange(Math.min(...nums), Math.max(...nums));
    applyActiveMushafPage(page);
    pruneMushafSections(page);
    h.syncReaderFocusMode();
    document.getElementById("resumeReadingBanner")?.classList.add("hidden");
    if (targetAyah && targetSurah) {
      requestAnimationFrame(() =>
        scrollToAyahOnPage(page, targetSurah, targetAyah),
      );
    } else if (replaceAll) {
      const section = pageEl(page);
      section?.scrollIntoView({ behavior: "auto", block: "start" });
    }
    h.prefetchMushafNeighbors(page);
  }

  async function loadMushafEdge(direction) {
    const h = getHost();
    const st = h.getState().continuousScroll || {};
    if (st.edgeLoading) return;
    const range = listedPageNums();
    if (!range.length) return;
    const min = range[0];
    const max = range[range.length - 1];
    const maxPage = h.getMushafPageMax();
    const target =
      direction > 0
        ? max < maxPage
          ? max + 1
          : null
        : min > 1
          ? min - 1
          : null;
    if (target == null || pageEl(target)) return;

    const signal = getEdgeLoadSignal(h);
    st.edgeLoading = true;
    const cached = h.getState().mushafPageCache?.get(target)?.length;
    const showUi = !cached;
    if (showUi) beginEdgeLoad(h, edgeLoadLabel(h, direction, "mushaf"));
    let loaded = false;
    try {
      await mountMushafPage(
        target,
        signal,
        direction > 0 ? "append" : "prepend",
      );
      loaded = !!pageEl(target);
      pruneMushafSections(h.getState().currentMushafPage);
      if (loaded) h.prefetchMushafNeighbors(target);
    } catch (err) {
      reportEdgeLoadError(h, err, "Mushaf scroll edge load failed", {
        direction,
        kind: "mushaf",
      });
    } finally {
      st.edgeLoading = false;
      st.lastEdgeFinishedAt = Date.now();
      if (showUi) endEdgeLoad(h);
      if (loaded) {
        h.hideReaderEdgeRetry?.();
        maybeContinueEdgeOnce(direction);
      }
    }
  }

  function observePageHeader(section) {
    initSectionObserver();
    const header = section?.querySelector?.(".continuous-page-header");
    if (header) sectionObserver.observe(header);
  }

  function pickActiveSurahFromViewport() {
    const root = document.getElementById("surahViewport");
    if (!root) return null;
    const rootRect = root.getBoundingClientRect();
    const chromeH =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--reader-chrome-h",
        ),
      ) || 72;
    const line = rootRect.top + Math.min(chromeH, 120) + 10;
    const headers = root.querySelectorAll(
      ".continuous-surah-header[data-continuous-surah]",
    );
    let winner = null;
    let winnerScore = -Infinity;
    headers.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < line - 4 || rect.top > rootRect.bottom) return;
      const bias = rect.top <= line ? 48 : 0;
      const score = bias - Math.abs(rect.top - line);
      if (score > winnerScore) {
        winnerScore = score;
        winner = parseInt(el.getAttribute("data-continuous-surah"), 10);
      }
    });
    return Number.isFinite(winner) ? winner : null;
  }

  function syncActiveSurahFromScroll() {
    if (isMushafMode()) return;
    const picked = pickActiveSurahFromViewport();
    if (!Number.isFinite(picked)) return;
    const current = getHost().getState().currentSurahNum;
    if (picked === current) {
      pendingActiveSurah = null;
      pendingActiveSurahHits = 0;
      return;
    }
    if (picked === pendingActiveSurah) pendingActiveSurahHits += 1;
    else {
      pendingActiveSurah = picked;
      pendingActiveSurahHits = 1;
    }
    if (pendingActiveSurahHits >= 2) {
      applyActiveSurahData(picked);
      pendingActiveSurah = null;
      pendingActiveSurahHits = 0;
    }
  }

  function scheduleScrollPrefetchWarm(h) {
    clearTimeout(prefetchWarmTimer);
    prefetchWarmTimer = setTimeout(() => {
      prefetchWarmTimer = null;
      if (getHost().getState().continuousScroll?.edgeLoading) return;
      const surah = h.getState().currentSurahNum;
      h.prefetchSurahReadingWindow?.(surah, scrollDirectionBias, { radius: 1 });
    }, 1500);
  }

  /* ——— Shared scroll + observer ——— */

  function onViewportScroll() {
    if (!usesContinuousScroll()) return;
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => {
      scrollTick = false;
      const vp = document.getElementById("surahViewport");
      if (!vp) return;
      const { scrollTop, scrollHeight, clientHeight } = vp;
      if (scrollTop > lastScrollTop + 6) scrollDirectionBias = 1;
      else if (scrollTop < lastScrollTop - 6) scrollDirectionBias = -1;
      lastScrollTop = scrollTop;
      if (!isMushafMode()) {
        syncActiveSurahFromScroll();
        scheduleScrollPrefetchWarm(getHost());
      }
      const st = getHost().getState().continuousScroll || {};
      const range = isMushafMode() ? listedPageNums() : listedSurahNums();
      const min = range[0];
      const max = range[range.length - 1];
      if (scrollHeight - scrollTop - clientHeight < EDGE_PX) {
        if (isMushafMode()) {
          if (max < getHost().getMushafPageMax() && !pageEl(max + 1)) {
            st.edgeContinueAllowed = true;
            loadMushafEdge(1);
          }
        } else if (max < 114 && !sectionEl(max + 1)) {
          st.edgeContinueAllowed = true;
          loadSurahEdge(1);
        }
      }
      if (scrollTop < EDGE_PX) {
        if (isMushafMode()) {
          if (min > 1 && !pageEl(min - 1)) {
            st.edgeContinueAllowed = true;
            loadMushafEdge(-1);
          }
        } else if (min > 1 && !sectionEl(min - 1)) {
          st.edgeContinueAllowed = true;
          loadSurahEdge(-1);
        }
      }
    });
  }

  function initSectionObserver() {
    if (sectionObserver) return;
    const root = document.getElementById("surahViewport");
    sectionObserver = new IntersectionObserver(
      (entries) => {
        let best = null;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
        }
        if (!best) return;
        const target = best.target;
        if (isMushafMode()) {
          const pageNum = parseInt(
            target.getAttribute("data-continuous-page"),
            10,
          );
          if (!Number.isFinite(pageNum)) return;
          if (getHost().getState().currentMushafPage !== pageNum)
            applyActiveMushafPage(pageNum);
        }
        /* Ayah continuous: active surah from scroll (syncActiveSurahFromScroll). */
      },
      { root, threshold: [0.15, 0.4, 0.6] },
    );
  }

  function observeSectionHeader(section) {
    initSectionObserver();
    const header = section?.querySelector?.(".continuous-surah-header");
    if (header) sectionObserver.observe(header);
  }

  function bindScrollOnce() {
    if (scrollBound) return;
    document
      .getElementById("surahViewport")
      ?.addEventListener("scroll", onViewportScroll, { passive: true });
    scrollBound = true;
  }

  async function continuousLoadSurah(
    surahNum,
    targetAyah,
    signal,
    loadOptions,
  ) {
    bindScrollOnce();
    initSectionObserver();
    const replaceAll = loadOptions?.replaceAll !== false;
    await loadSurahWindow(surahNum, targetAyah, signal, replaceAll);
    getHost().prefetchSurahReadingWindow?.(surahNum, 0, { radius: 2 });
  }

  async function continuousLoadMushaf(
    centerPage,
    targetSurah,
    targetAyah,
    signal,
    loadOptions,
  ) {
    bindScrollOnce();
    initSectionObserver();
    const replaceAll = loadOptions?.replaceAll !== false;
    await loadMushafWindow(
      centerPage,
      targetSurah,
      targetAyah,
      signal,
      replaceAll,
    );
  }

  async function jumpToSurah(surahNum, ayahNum) {
    if (isMushafMode()) {
      const h = getHost();
      const signal = h.getState().surahLoadController?.signal;
      const page = await h.getStartPageForSurah(
        surahNum,
        h.withFetchTimeout(signal),
      );
      await jumpToPage(page, surahNum, ayahNum);
      return;
    }
    if (sectionEl(surahNum)) {
      applyActiveSurahData(surahNum);
      sectionEl(surahNum).scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      if (ayahNum) scrollToAyahInSection(surahNum, ayahNum);
      return;
    }
    const signal = getHost().getState().surahLoadController?.signal;
    await loadSurahWindow(surahNum, ayahNum, signal, true);
  }

  async function jumpToPage(pageNum, targetSurah, targetAyah) {
    const page = parseInt(pageNum, 10);
    if (pageEl(page)) {
      applyActiveMushafPage(page);
      pageEl(page).scrollIntoView({ behavior: "smooth", block: "start" });
      if (targetSurah && targetAyah)
        scrollToAyahOnPage(page, targetSurah, targetAyah);
      return;
    }
    const signal = getHost().getState().surahLoadController?.signal;
    await loadMushafWindow(page, targetSurah, targetAyah, signal, true);
  }

  async function ensureSurahSection(surahNum) {
    if (isMushafMode()) {
      const h = getHost();
      const signal = h.getState().surahLoadController?.signal;
      const page = await h.getStartPageForSurah(
        surahNum,
        h.withFetchTimeout(signal),
      );
      await ensureMushafPage(page);
      return;
    }
    if (sectionEl(surahNum)) return;
    const signal = getHost().getState().surahLoadController?.signal;
    await mountSurah(surahNum, signal, "append");
    pruneSurahSections(getHost().getState().currentSurahNum);
  }

  async function ensureMushafPage(pageNum) {
    if (pageEl(pageNum)) return;
    const signal = getHost().getState().surahLoadController?.signal;
    await mountMushafPage(pageNum, signal, "append");
    pruneMushafSections(getHost().getState().currentMushafPage);
  }

  async function retryEdgeLoad(direction, kind) {
    if (kind === "mushaf") await loadMushafEdge(direction);
    else await loadSurahEdge(direction);
  }

  window.QuranContinuousReader = {
    usesContinuousScroll,
    surahNumFromGlobalAyah,
    continuousLoadSurah,
    continuousLoadMushaf,
    jumpToSurah,
    jumpToPage,
    ensureSurahSection,
    ensureMushafPage,
    observeSectionHeader,
    applyActiveSurahData,
    scrollToAyahInSection,
    scrollToAyahOnPage,
    retryEdgeLoad,
  };
})();
