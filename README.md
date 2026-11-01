# Quran

PWA Quran reader with translations, tafsir, recitation, bookmarks, and azkar. The service worker caches the app shell and pages or audio you have already opened.

**Live:** https://aamar-shahzad.github.io/quran-mobile/

**Hadith app:** https://aamar-shahzad.github.io/hadith-mobile/

## Offline use

- On install, the service worker tries to cache `index.html`, the manifest, and icons (each request times out after a few seconds so install does not hang).
- Surah text, tafsir, and audio are cached as you open them. Opening a surah once while online usually makes that surah readable offline later.
- Indo-Pak mushaf pages prefetch the previous and next page in the background after each load.
- If the network is slow, navigation falls back to the cached shell instead of waiting indefinitely. When online, the app checks for updates on load and when you return to the tab; tap **Update** on the green banner if shown.

## Mushaf (Indo-Pak)

- **Reading options → Indo-Pak mushaf (15-line)** switches to 610-page layout from Quran.com (`text_indopak_nastaleeq`).
- Swipe **right** for the next page, **left** for previous (RTL turn). Nav buttons match: ← next, → previous.
- Share a mushaf page with `?page=134` (opens Indo-Pak mushaf layout).
- **Reading options → Save this surah’s mushaf pages for offline** caches every mushaf page that contains the current surah (within cache limits).

## Background audio

- Lock-screen **play / pause / next / previous** use the Media Session API while recitation is playing.
- Switching between **Indo-Pak mushaf** and **by ayah** (Reading options → Script) keeps the same ayah playing when possible; mushaf opens the page for that ayah.
- **Continue listening:** long-press the home-screen icon → _Continue_ (Android), or open `?play=last`.
- Deep links (`?surah=`, `?ayah=`, `?page=`, `?play=1`) still work if you bookmark or share a URL yourself.

## Data sources (authentic APIs)

| Content             | Provider                                            | Notes                                                                |
| ------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| Arabic Quran text   | [Al Quran Cloud](https://alquran.cloud/)            | Hafs Uthmani (`quran-uthmani`) and other catalog editions            |
| Indo-Pak Naskh      | [Quran.com API](https://quran.com)                  | Ayah mode + **15-line mushaf** (610 pages, `text_indopak_nastaleeq`) |
| English translation | Al Quran Cloud `en.sahih`                           | Sahih International                                                  |
| Tafsir              | [Quran.com API](https://quran.com) + Al Quran Cloud | Ibn Kathir, Jalalayn, Muyassar, etc.                                 |
| Audio               | [Islamic Network CDN](https://islamic.network)      | Per-ayah recitation MP3                                              |
| Word-by-word        | Quran.com API                                       | Uthmani + English gloss                                              |
| Azkar               | In-app (referenced)                                 | Hisn al-Muslim / Bukhari-Muslim refs — not API                       |

In the app: **More** → _Reading options_ for script, **appearance** (light/dark/system), text size, reciter, and translation. Changing **script** or **translation** reloads the app with the splash screen so mushaf ↔ ayah layouts apply cleanly (same surah/ayah and playback resume when possible). On phones, **Tafsir** opens in a bottom sheet (swipe-friendly scroll, prev/next ayah, Close) so long commentary does not bury the ayah list. **More** → _Data sources_ for the full list.

**Simple by design:** Home screen is read + listen (play on ayah or mushaf). Meaning lives in **Tafsir** when you need it — not a wall of English under every Indo-Pak ayah unless you turn that on in Reading options.

## Install

Open the live link on your phone → **More** → _Share & install_ → Add to Home Screen (iOS Safari) or Install app (Android Chrome).

On first open, a splash screen shows while the surah list and reader load (matches light/dark theme). The installed PWA uses the same icon and background colors from the manifest.

On Android/desktop Chrome, a green **Install** bar may appear when the app is installable; tap it to run the native install dialog. Chrome may log that its default mini-banner was deferred — that is expected when the app uses its own install button. You can also use **More → Install app** or **Share & install → Install app**.

If you also install the **Hadith** PWA from the same GitHub Pages account, give each app a **unique home-screen icon** and reinstall after manifest updates so iOS does not tie lock-screen audio to the wrong app. Both apps now use distinct PWA `id` values in their manifests.

Serve the repo root locally (`python3 -m http.server 8080`); manifest scope is `./` so install and shortcuts work at `http://127.0.0.1:8080/` and on GitHub Pages.

## Local preview

```bash
npm ci && npm run build:css
python3 -m http.server 8080
```

After changing Tailwind classes in `index.html`, run `npm run build:css` and commit `assets/app.css`.

## Icons

Custom open-book app icons in `icons/` (192, 512, maskable, Apple touch). See `icons/CREDITS.txt`.
