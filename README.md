# Quran Mobile

PWA Quran reader with multiple mushaf formats, tafsir, audio, bookmarks, and azkar.

**Live:** https://aamar-shahzad.github.io/quran-mobile/

**Hadith app:** https://aamar-shahzad.github.io/hadith-mobile/

## Data sources (authentic APIs)

| Content             | Provider                                            | Notes                                                     |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| Arabic Quran text   | [Al Quran Cloud](https://alquran.cloud/)            | Hafs Uthmani (`quran-uthmani`) and other catalog editions |
| Hifzi / 16-line     | [Quran.com API](https://quran.com)                  | Indo-Pak Naskh `text_indopak`; 604 pages; fixed 16-row Hifz grid + `line_number` slots |
| English translation | Al Quran Cloud `en.sahih`                           | Sahih International                                       |
| Tafsir              | [Quran.com API](https://quran.com) + Al Quran Cloud | Ibn Kathir, Jalalayn, Muyassar, etc.                      |
| Audio               | [Islamic Network CDN](https://islamic.network)      | Per-ayah recitation MP3                                   |
| Word-by-word        | Quran.com API                                       | Uthmani + English gloss                                   |
| Azkar               | In-app (referenced)                                 | Hisn al-Muslim / Bukhari-Muslim refs — not API            |

In the app: header **info** icon → full source list.

## Install

Open the live link on your phone → header **share** icon → QR / Share link → Add to Home Screen (iOS Safari) or Install app (Android Chrome).

## Local preview

```bash
python3 -m http.server 8080
```

## Icons

See `icons/CREDITS.txt` (Font Awesome, CC BY 4.0).
