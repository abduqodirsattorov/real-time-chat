#!/usr/bin/env python3
"""
Nova Chat — Placeholder audio fayllar generatsiya qilish
Google TTS (gtts) ishlatadi — bepul, internet kerak.

O'rnatish:
  pip install gtts

Ishlatish:
  python3 scripts/generate-audio.py
  yoki: make audio-generate
"""

import os
import sys

try:
    from gtts import gTTS
except ImportError:
    print("❌ gtts o'rnatilmagan. O'rnatish: pip install gtts")
    sys.exit(1)

AUDIO_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')
os.makedirs(AUDIO_DIR, exist_ok=True)

files = [
    {
        'filename': 'recording_uz.mp3',
        'text': "Diqqat! Bu qo'ng'iroq sifat nazorati uchun yozilmoqda.",
        'lang': 'uz',
        'slow': False,
    },
    {
        'filename': 'recording_ru.mp3',
        'text': "Внимание! Этот звонок записывается в целях контроля качества.",
        'lang': 'ru',
        'slow': False,
    },
    {
        'filename': 'hold_music.mp3',
        # Hold music TTS placeholder — kelajakda haqiqiy musiqa bilan almashtiriladi
        'text': "Kuting, iltimos. Operator tez orada ulanadi. "
                "Подождите, пожалуйста. Оператор скоро ответит.",
        'lang': 'uz',
        'slow': True,
    },
]

print("🎵 Audio fayllar generatsiya qilinmoqda (Google TTS)...")
print()

for f in files:
    path = os.path.join(AUDIO_DIR, f['filename'])
    print(f"  Generatsiya: {f['filename']} ({f['lang']})...")
    try:
        tts = gTTS(text=f['text'], lang=f['lang'], slow=f['slow'])
        tts.save(path)
        size = os.path.getsize(path)
        print(f"  ✓ {f['filename']} — {size // 1024} KB")
    except Exception as e:
        print(f"  ❌ Xatolik: {e}")
        print(f"     Internet aloqasi borligini tekshiring")

print()
print("✅ Audio generatsiya tugadi!")
print(f"   Papka: {os.path.abspath(AUDIO_DIR)}")
print()
print("Keyingi qadam — MinIO'ga yuklash:")
print("  ./scripts/upload-system-audio.sh")
print("  yoki: make audio-upload")
print()
print("⚠️  ESLATMA: Bu PLACEHOLDER fayllar.")
print("   Haqiqiy studio sifatidagi fayllar bilan almashtiring!")
