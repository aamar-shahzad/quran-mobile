# Quran

PWA Quran reader with translations, tafsir, recitation, bookmarks, and azkar.

**Live:** https://aamar-shahzad.github.io/quran-mobile/

**Hadith app:** https://aamar-shahzad.github.io/hadith-mobile/

## Background audio & voice assistants

- Lock-screen **play / pause / next / previous** use the Media Session API while recitation is playing.
- **Continue listening:** open `?play=last` or use the Android home-screen shortcut _Continue_.
- **Play a surah by voice (iOS):** More → _Siri & Assistant_ → copy a link → create a Shortcuts “Open URL” action → “Hey Siri, [shortcut name]”.
- **iOS note:** Shortcut links open in Safari; audio still plays in the background. iOS may stop audio if the app is force-quit.

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

## Local preview

```bash
python3 -m http.server 8080
```

## Icons

See `icons/CREDITS.txt` (Font Awesome, CC BY 4.0).
