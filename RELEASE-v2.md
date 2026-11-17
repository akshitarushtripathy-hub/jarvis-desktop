# Jarvis v2.0 — Release Notes

Voice-activated desktop assistant with a sci-fi HUD. v2 adds real AI answers, first-run setup and a terminal command for API keys.

## What's new in v2

- **AI answers, spoken back** — ask anything and Jarvis replies aloud using your chosen provider: **OpenAI, Claude, Gemini, or Groq**.
- **First-run setup popup** — tells Jarvis what to call you and what to call it. The assistant name becomes the wake word.
- **`jarvis` CLI command** — set or switch API keys from a terminal.
- **Encrypted local config** — keys stay on your machine, never in the cloud.
- **Settings panel** (`⚙` or `S`) — pick provider, model and key without leaving the app.
- **Linux Mint / Ubuntu `.deb`** with flexible dependencies for both older and `t64`-based releases.

## Add your API key

The `.deb` installs a `jarvis` command. Add a key with one command, then restart the app:

```bash
jarvis set-key groq gsk_your_key_here
```

Supported providers: `openai`, `claude`, `gemini`, `groq`.

```bash
jarvis use openai     # switch active provider
jarvis status         # show configured providers
jarvis path           # show config file location
```

From source (no `.deb`): `npm run jarvis -- set-key groq gsk_...`

You can also open the **⚙** panel in the app, pick a provider, paste the key and click **Save**.

### Where the key lives

`~/.config/Jarvis/jarvis-settings.json` — created with empty keys and a visible `(paste api here)` note.

## Get a key

| Provider | Link |
| --- | --- |
| OpenAI | https://platform.openai.com/api-keys |
| Claude | https://console.anthropic.com/settings/keys |
| Gemini | https://aistudio.google.com/app/apikey |
| Groq | https://console.groq.com/keys |

## Install

```bash
sudo dpkg -i jarvis-desktop_2.0.0_amd64.deb
sudo apt-get install -f
```

## Notes

Voice input uses Chromium's Web Speech API and needs an internet connection. Text-to-speech works offline. The typed command bar works fully even without a microphone.
