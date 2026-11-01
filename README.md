# Quran

PWA Quran reader with translations, tafsir, recitation, bookmarks, and azkar. The service worker caches the app shell and pages or audio you have already opened.

**Live:** https://aamar-shahzad.github.io/quran-mobile/

**Hadith app:** https://aamar-shahzad.github.io/hadith-mobile/

## Offline use

- On install, the service worker tries to cache `index.html`, the manifest, and icons (each request times out after a few seconds so install does not hang).
- Surah text, tafsir, and audio are cached as you open them. Opening a surah once while online usually makes that surah readable offline later.
- If the network is slow, navigation falls back to the cached shell instead of waiting indefinitely.

## Background audio

- Lock-screen **play / pause / next / previous** use the Media Session API while recitation is playing.
- **Continue listening:** long-press the home-screen icon → _Continue_ (Android), or open `?play=last`.
- Deep links (`?surah=`, `?play=1`) still work if you bookmark or share a URL yourself.

## Data sources (authentic APIs)

| Content             | Provider                                            | Notes                                                     |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| Arabic Quran text   | [Al Quran Cloud](https://alquran.cloud/)            | Hafs Uthmani (`quran-uthmani`) and other catalog editions |
| Indo-Pak Naskh      | [Quran.com API](https://quran.com)                  | Hifzi-style `text_indopak` by ayah (Script menu)          |
| English translation | Al Quran Cloud `en.sahih`                           | Sahih International                                       |
| Tafsir              | [Quran.com API](https://quran.com) + Al Quran Cloud | Ibn Kathir, Jalalayn, Muyassar, etc.                      |
| Audio               | [Islamic Network CDN](https://islamic.network)      | Per-ayah recitation MP3                                   |
| Word-by-word        | Quran.com API                                       | Uthmani + English gloss                                   |
| Azkar               | In-app (referenced)                                 | Hisn al-Muslim / Bukhari-Muslim refs — not API            |

In the app: **More** → _Data sources_ for the full list.

## Install

Open the live link on your phone → **More** → _Share & install_ → Add to Home Screen (iOS Safari) or Install app (Android Chrome).

On Android/desktop Chrome, a green **Install** bar may appear when the app is installable; tap it to run the native install dialog (Chrome may log that its default banner was deferred — that is expected).

Serve the repo root locally (`python3 -m http.server 8080`); manifest scope is `./` so install and shortcuts work at `http://127.0.0.1:8080/` and on GitHub Pages.

## Local preview

```bash
npm ci && npm run build:css
python3 -m http.server 8080
```

After changing Tailwind classes in `index.html`, run `npm run build:css` and commit `assets/app.css`.

## Icons

See `icons/CREDITS.txt` (Font Awesome, CC BY 4.0).
