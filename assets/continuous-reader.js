(function () {
  const EDGE_PX = 300;
  const MAX_SURAH_SECTIONS = 6;
  const MAX_MUSHAF_SECTIONS = 4;
  const WINDOW_RADIUS = 1;

  let scrollBound = false;
  let scrollTick = false;
  let sectionObserver = null;

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

  async function fetchPayload(surahNum, signal) {
    const h = getHost();
    const key = h.surahViewCacheKey(surahNum);
    const cached = h.getState().surahViewCache.get(key);
    if (cached) {
      return {
        arSurahPayload: h.cloneViewPayload(cached.arSurahPayload),
        enData: h.cloneViewPayload(cached.enData),
      };
    }
    const payload = await h.fetchSurahViewData(
      surahNum,
      h.withFetchTimeout(signal),
    );
    h.storeSurahViewCache(surahNum, payload);
    return payload;
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
    let nums = listedSurahNums();
    if (nums.length <= MAX_SURAH_SECTIONS) return;
    const dist = (n) => Math.abs(n - anchorSurah);
    nums = [...nums].sort((a, b) => dist(b) - dist(a));
    while (listedSurahNums().length > MAX_SURAH_SECTIONS) {
      const remove = nums.shift();
      if (remove == null) break;
      if (dist(remove) <= WINDOW_RADIUS) continue;
      sectionEl(remove)?.remove();
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
    for (const n of nums) {
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
    const signal = h.getState().surahLoadController?.signal;
    if (!signal || signal.aborted) return;

    h.getState().continuousScroll = st;
    st.edgeLoading = true;
    try {
      if (direction > 0 && max < 114) {
        await mountSurah(max + 1, signal, "append");
        pruneSurahSections(h.getState().currentSurahNum);
      } else if (direction < 0 && min > 1) {
        await mountSurah(min - 1, signal, "prepend");
        pruneSurahSections(h.getState().currentSurahNum);
      }
    } catch (err) {
      if (err?.name !== "AbortError")
        console.warn("Continuous scroll edge load failed", err);
    } finally {
      st.edgeLoading = false;
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
      verses = await h.fetchMushafPageVerses(
        pageNum,
        h.withFetchTimeout(signal),
      );
      if (!verses?.length) throw new Error("empty page");
      st.mushafPageCache.set(pageNum, verses);
      h.trimMushafPageCache?.();
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
    const dist = (n) => Math.abs(n - anchorPage);
    nums = [...nums].sort((a, b) => dist(b) - dist(a));
    while (listedPageNums().length > MAX_MUSHAF_SECTIONS) {
      const remove = nums.shift();
      if (remove == null) break;
      if (dist(remove) <= WINDOW_RADIUS) continue;
      pageEl(remove)?.remove();
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
    const signal = h.getState().surahLoadController?.signal;
    if (!signal || signal.aborted) return;

    st.edgeLoading = true;
    try {
      if (direction > 0 && max < maxPage) {
        await mountMushafPage(max + 1, signal, "append");
        pruneMushafSections(h.getState().currentMushafPage);
        h.prefetchMushafNeighbors(max + 1);
      } else if (direction < 0 && min > 1) {
        await mountMushafPage(min - 1, signal, "prepend");
        pruneMushafSections(h.getState().currentMushafPage);
        h.prefetchMushafNeighbors(min - 1);
      }
    } catch (err) {
      if (err?.name !== "AbortError")
        console.warn("Mushaf scroll edge load failed", err);
    } finally {
      st.edgeLoading = false;
    }
  }

  function observePageHeader(section) {
    initSectionObserver();
    const header = section?.querySelector?.(".continuous-page-header");
    if (header) sectionObserver.observe(header);
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
      if (scrollHeight - scrollTop - clientHeight < EDGE_PX) {
        if (isMushafMode()) loadMushafEdge(1);
        else loadSurahEdge(1);
      }
      if (scrollTop < EDGE_PX) {
        if (isMushafMode()) loadMushafEdge(-1);
        else loadSurahEdge(-1);
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
        } else {
          const surahNum = parseInt(
            target.getAttribute("data-continuous-surah"),
            10,
          );
          if (!Number.isFinite(surahNum)) return;
          if (getHost().getState().currentSurahNum !== surahNum)
            applyActiveSurahData(surahNum);
        }
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
    getHost().prefetchSurahNeighbors(surahNum);
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
  };
})();
