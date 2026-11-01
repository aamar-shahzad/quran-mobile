(function () {
  const EDGE_PX = 300;
  const MAX_SECTIONS = 6;
  const WINDOW_RADIUS = 1;

  let scrollBound = false;
  let scrollTick = false;
  let sectionObserver = null;

  function getHost() {
    return window.__quranContinuousHost;
  }

  function usesContinuousScroll() {
    const h = getHost();
    return h && !h.isMushafPageScript(h.getScriptKey());
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
    st.continuousScroll.minSurah = min;
    st.continuousScroll.maxSurah = max;
  }

  function sectionEl(surahNum) {
    return document.querySelector(`[data-continuous-surah="${surahNum}"]`);
  }

  function listedSurahNums() {
    return [...document.querySelectorAll('[data-continuous-surah]')]
      .map((el) => parseInt(el.getAttribute('data-continuous-surah'), 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  }

  function syncRangeFromDom() {
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
    const payload = await h.fetchSurahViewData(surahNum, h.withFetchTimeout(signal));
    h.storeSurahViewCache(surahNum, payload);
    return payload;
  }

  function normalizePayload(surahNum, arPayload) {
    const h = getHost();
    const scriptMode = h.getScriptFormat(h.getScriptKey()).mode;
    arPayload.ayahs = arPayload.ayahs.map((ayah) => ({
      ...ayah,
      text: h.normalizeAyahText(ayah.text, surahNum, ayah.numberInSurah, scriptMode),
    }));
    return arPayload;
  }

  function mountSection(surahNum, arPayload, enData, position) {
    const h = getHost();
    const versesList = document.getElementById('versesList');
    if (!versesList) return;
    const meta = h.getSurahs().find((s) => s.number === surahNum);
    const enAyahs = enData?.data?.ayahs || [];
    const html = h.buildContinuousSurahSectionHtml(surahNum, arPayload, enAyahs, meta);
    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    const section = wrap.firstElementChild;
    if (!section) return;

    if (position === 'prepend') {
      const vp = document.getElementById('surahViewport');
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
    if (payload.enData?.code !== 200) throw new Error('translation');
    const ar = normalizePayload(surahNum, payload.arSurahPayload);
    mountSection(surahNum, ar, payload.enData, position);
    syncRangeFromDom();
  }

  function pruneSections(anchorSurah) {
    let nums = listedSurahNums();
    if (nums.length <= MAX_SECTIONS) return;
    const dist = (n) => Math.abs(n - anchorSurah);
    nums = [...nums].sort((a, b) => dist(b) - dist(a));
    while (listedSurahNums().length > MAX_SECTIONS) {
      const remove = nums.shift();
      if (remove == null) break;
      if (dist(remove) <= WINDOW_RADIUS) continue;
      sectionEl(remove)?.remove();
    }
    syncRangeFromDom();
  }

  function applyActiveSurahData(surahNum) {
    const h = getHost();
    const key = h.surahViewCacheKey(surahNum);
    const cached = h.getState().surahViewCache.get(key);
    if (!cached?.arSurahPayload) return;
    const ar = normalizePayload(surahNum, h.cloneViewPayload(cached.arSurahPayload));
    const st = h.getState();
    st.currentSurahNum = surahNum;
    st.currentSurahData = ar;
    st.currentSurahEnData = cached.enData?.data || null;
    const sel = document.getElementById('surahSelect');
    if (sel && sel.value !== String(surahNum)) sel.value = String(surahNum);
    h.updateNavigationButtons();
    h.syncAudioUi();
  }

  function scrollToAyahInSection(surahNum, ayahNum) {
    const section = sectionEl(surahNum);
    if (!section || !ayahNum) return;
    const card = section.querySelector(`[data-ayah-in-surah="${ayahNum}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function loadWindow(centerSurah, targetAyah, signal, replaceAll) {
    const h = getHost();
    const versesList = document.getElementById('versesList');
    if (!versesList) return;
    if (replaceAll) versesList.innerHTML = '';
    document.getElementById('surahHeaderCard')?.classList.add('hidden');

    const nums = [];
    for (let n = centerSurah - WINDOW_RADIUS; n <= centerSurah + WINDOW_RADIUS; n += 1) {
      if (n >= 1 && n <= 114) nums.push(n);
    }
    for (const n of nums) {
      if (signal?.aborted) return;
      await mountSurah(n, signal, n < centerSurah ? 'prepend' : 'append');
    }
    setScrollRange(Math.min(...nums), Math.max(...nums));
    applyActiveSurahData(centerSurah);
    pruneSections(centerSurah);
    h.closeAllTafsirPanelsExcept();
    h.syncReaderFocusMode();
    if (targetAyah) {
      requestAnimationFrame(() => scrollToAyahInSection(centerSurah, targetAyah));
    } else if (replaceAll) {
      document.getElementById('surahViewport')?.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  async function loadEdge(direction) {
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
        await mountSurah(max + 1, signal, 'append');
        pruneSections(h.getState().currentSurahNum);
      } else if (direction < 0 && min > 1) {
        await mountSurah(min - 1, signal, 'prepend');
        pruneSections(h.getState().currentSurahNum);
      }
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('Continuous scroll edge load failed', err);
    } finally {
      st.edgeLoading = false;
    }
  }

  function onViewportScroll() {
    if (!usesContinuousScroll()) return;
    if (scrollTick) return;
    scrollTick = true;
    requestAnimationFrame(() => {
      scrollTick = false;
      const vp = document.getElementById('surahViewport');
      if (!vp) return;
      const { scrollTop, scrollHeight, clientHeight } = vp;
      if (scrollHeight - scrollTop - clientHeight < EDGE_PX) loadEdge(1);
      if (scrollTop < EDGE_PX) loadEdge(-1);
    });
  }

  function initSectionObserver() {
    if (sectionObserver) return;
    const root = document.getElementById('surahViewport');
    sectionObserver = new IntersectionObserver(
      (entries) => {
        let best = null;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
        }
        if (!best) return;
        const surahNum = parseInt(best.target.getAttribute('data-continuous-surah'), 10);
        if (!Number.isFinite(surahNum)) return;
        if (getHost().getState().currentSurahNum !== surahNum) applyActiveSurahData(surahNum);
      },
      { root, threshold: [0.15, 0.4, 0.6] },
    );
  }

  function observeSectionHeader(section) {
    initSectionObserver();
    const header = section?.querySelector?.('.continuous-surah-header');
    if (header) sectionObserver.observe(header);
  }

  function bindScrollOnce() {
    if (scrollBound) return;
    document.getElementById('surahViewport')?.addEventListener('scroll', onViewportScroll, { passive: true });
    scrollBound = true;
  }

  async function continuousLoadSurah(surahNum, targetAyah, signal, loadOptions) {
    bindScrollOnce();
    initSectionObserver();
    const replaceAll = loadOptions?.replaceAll !== false;
    await loadWindow(surahNum, targetAyah, signal, replaceAll);
    getHost().prefetchSurahNeighbors(surahNum);
  }

  async function jumpToSurah(surahNum, ayahNum) {
    if (sectionEl(surahNum)) {
      applyActiveSurahData(surahNum);
      sectionEl(surahNum).scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (ayahNum) scrollToAyahInSection(surahNum, ayahNum);
      return;
    }
    const signal = getHost().getState().surahLoadController?.signal;
    await loadWindow(surahNum, ayahNum, signal, true);
  }

  async function ensureSurahSection(surahNum) {
    if (sectionEl(surahNum)) return;
    const signal = getHost().getState().surahLoadController?.signal;
    await mountSurah(surahNum, signal, 'append');
    pruneSections(getHost().getState().currentSurahNum);
  }

  window.QuranContinuousReader = {
    usesContinuousScroll,
    surahNumFromGlobalAyah,
    continuousLoadSurah,
    jumpToSurah,
    ensureSurahSection,
    observeSectionHeader,
    applyActiveSurahData,
    scrollToAyahInSection,
  };
})();
