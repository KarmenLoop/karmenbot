# Voice MVP

Optional speech helpers. **No forced cloud** — STT is BYOK against any
OpenAI-compatible `/audio/transcriptions` endpoint; TTS uses the OS.

## Commands

```bash
karmenbot voice say "你好"
karmenbot voice last          # speak ~/.karmenbot/voice/last-reply.txt
karmenbot voice ask note.wav  # STT → ask → save last-reply
karmenbot voice ask note.mp3 --speak
```

## STT (BYOK)

`~/.karmenbot/config.json`:

```json
{
  "voice": {
    "stt": {
      "baseUrl": "https://api.openai.com/v1",
      "model": "whisper-1"
    }
  }
}
```

`~/.karmenbot/secrets.json`:

```json
{ "voice": { "apiKey": "sk-…" } }
```

Or `KARMENBOT_STT_API_KEY` / `OPENAI_API_KEY`. Point `baseUrl` at a local whisper.cpp
OpenAI-compatible proxy if you prefer fully offline STT.

## TTS

- macOS: `say`
- Windows: PowerShell `System.Speech` (`SpeechSynthesizer`)
- Linux: `spd-say` or `espeak`

If none are available, `voice last` prints the text instead of failing silently when TTS is missing after print fallback paths.
