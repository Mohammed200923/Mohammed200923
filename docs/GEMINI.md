# Google Gemini as the astronomy guide

The 3D sky's **Ask the guide** panel answers with **Google Gemini**. Every question goes to Gemini together with what the user is looking at: the selected object, its coordinates, the open observation, and SkyShift's own measurements (moving objects, speeds, Gaia/WISE checks). So answers are about *this* screen, and follow-up questions keep the last few turns.

Without a key, the panel uses the built-in template guide, labelled "Demo answers". With a key, it says **AI · Google Gemini** and warns that AI can be wrong.

## 1. Get a free API key (2 minutes, any Google account)

1. Go to <https://aistudio.google.com/apikey> and sign in with a normal Google account.
2. Click **Create API key** and copy it. Keep it secret: don't put it in the code or in a chat.

The free tier is enough for judging. The server also limits each visitor to 8 questions a minute to protect the quota.

## 2. Add it to the Hugging Face Space

Space → **Settings → Variables and secrets → New secret** (a *secret*, not a variable):

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | your key |

Optional: a variable `GEMINI_MODEL` to choose another model (default `gemini-2.5-flash`).

The Space restarts and the panel switches to Gemini. A restart clears the data cache, so open the five challenge targets once afterwards.

**On your own computer:**

```bash
GEMINI_API_KEY='your-key' python3 server.py
```

## How it works

- `server.py`:
  - `GET /guide/status` says whether a key is set.
  - `POST /guide/ask` sends the question to Gemini (`generateContent`, with a fixed system instruction about SkyShift), along with the screen context and the last few turns.
  - The key stays on the server, and requests are size- and rate-limited.
- `app/spherex-immersive/js/data/assistant-ai.js` builds the screen context and calls the server.
- If Gemini is not set up, or fails, the built-in guide answers instead, labelled as such.
