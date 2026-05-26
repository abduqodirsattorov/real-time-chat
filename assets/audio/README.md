# Tizim audio fayllar

> ⚠️ **PLACEHOLDER FAYLLAR** — Haqiqiy studio sifatidagi fayllar bilan almashtiring!

## Fayllar

| Fayl | Tavsif | Til | Holat |
|------|--------|-----|-------|
| `recording_uz.mp3` | "Diqqat! Bu qo'ng'iroq sifat nazorati uchun yozilmoqda." | O'zbek (hozir Turkish TTS) | PLACEHOLDER |
| `recording_ru.mp3` | "Внимание! Этот звонок записывается в целях контроля качества." | Rus (Google TTS) | PLACEHOLDER |
| `hold_music.mp3` | Navbat kutish musiqasi | - | PLACEHOLDER (TTS ovoz) |

## Muhim eslatmalar

### Huquqiy talab (O'zbekiston qonunchiligi)
`recording_uz.mp3` va `recording_ru.mp3` fayllar **MAJBURIY** eshittiriladi
mijozga qo'ng'iroq yozilishidan OLDIN. Bu O'zbekiston qonunchiligiga muvofiqdir.

### Haqiqiy fayllar qo'yish tartibi

1. Studio sifatidagi mp3 fayllarni tayyorlang (44.1kHz, 128kbps, mono)
2. Ushbu papkaga qo'ying (bir xil nom bilan)
3. MinIO'ga yuklang: `make audio-upload`

### Placeholder fayllarni qayta yaratish

```bash
pip install gtts
python scripts/generate-audio.py
```

### MinIO'ga yuklash

```bash
make audio-upload
# yoki
./scripts/upload-system-audio.sh
```

## Texnik talablar (haqiqiy fayllar uchun)

- **Format:** MP3
- **Bitrate:** 128 kbps
- **Sample rate:** 44.1 kHz
- **Channels:** Mono
- **recording_uz.mp3 uzunligi:** 3-5 sekund
- **recording_ru.mp3 uzunligi:** 3-5 sekund
- **hold_music.mp3 uzunligi:** 30-60 sekund (loop-friendly, nuqtasiz boshlanish/tugash)
