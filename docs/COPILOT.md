# Microsoft Copilot as the astronomy guide

The 3D sky's **Ask the guide** panel answers with a **Microsoft Copilot Studio** agent. Every question is sent with what the user is looking at: the selected object, its coordinates, and SkyShift's own measurements (moving objects, speeds, Gaia/WISE checks). So Copilot answers about *this* screen.

Without setup, the panel uses the built-in template guide, labelled "Demo answers". Once an agent is connected, the panel says **Microsoft Copilot**.

## 1. Create the agent (about 10 minutes)

1. Go to <https://copilotstudio.microsoft.com> and sign in with a Microsoft work/school account, or start the free trial. The Space Apps Microsoft offer should cover this.
2. **Create → New agent**. Skip the chat and go to **Configure**:
   - **Name:** SkyShift Guide
   - **Description:** Astronomy guide for SkyShift, a tool that shows NASA SPHEREx images of the sky over time.
   - **Instructions:** paste this:

     > You are the astronomy guide inside SkyShift, a NASA Space Apps 2026 project (challenge "Planet X and SPHEREx"). SkyShift shows real NASA SPHEREx infrared images of any spot in the sky as a time-lapse, adds NASA WISE/NEOWISE images from 2010–2024, and automatically finds objects that move (nearby stars, brown dwarfs, asteroids) or change brightness (variable stars). It checks movers against ESA Gaia DR3, CatWISE2020 and NASA JPL's asteroid list.
     >
     > Each user message starts with a block "[SkyShift context …]" describing what the user sees: the selected object, coordinates, and SkyShift's measurements. Use it. Quote SkyShift's measured numbers when relevant, and say they are SkyShift's measurements.
     >
     > Be accurate and brief (2–5 sentences unless asked for more). Explain for a curious non-expert; if the context says beginner, use very simple words. If you are not sure, say so. Never invent measurements. If the context says "Answer in Arabic", answer in Arabic.
     >
     > Useful facts: SPHEREx observes the whole sky in 102 infrared colours from 0.75 to 5 µm, about every six months. Proper motion is a star's slow drift across the sky in arcseconds per year. Brown dwarfs are too small to fuse hydrogen and glow mostly in infrared.

3. **Knowledge → Add knowledge → Public websites**: add `https://github.com/Mohammed200923/Mohammed200923`. It's optional, and lets the agent answer questions about how SkyShift works.
4. **Settings → Security → Authentication: No authentication**, then **Save**.
5. **Publish** (top right).
6. **Channels → Mobile app** (it may be called *Web app* or *Native app*). Copy the **Token Endpoint**. It looks like `https://….environment.api.powerplatform.com/powervirtualagents/botsbyschema/…/directline/token?api-version=…`.

## 2. Connect it to SkyShift

**Hugging Face Space:** Settings → **Variables and secrets** → **New variable**:

| Name | Value |
|---|---|
| `SKYSHIFT_COPILOT_TOKEN_URL` | the Token Endpoint from step 6 |

The Space restarts and the panel switches to Microsoft Copilot. A restart clears the data cache, so open the five challenge targets once afterwards.

**Your own computer:**

```bash
SKYSHIFT_COPILOT_TOKEN_URL='https://…/directline/token?api-version=…' python3 server.py
```

If your agent is in a region with its own Direct Line address (for example Europe), also set `SKYSHIFT_COPILOT_DIRECTLINE=https://europe.directline.botframework.com/v3/directline`.

## How it works

- `server.py` `/copilot/token` fetches a short-lived Direct Line token from the Token Endpoint. It only accepts Copilot Studio hosts, and the browser never sees the endpoint.
- `app/spherex-immersive/js/data/assistant-copilot.js` opens a Direct Line conversation and sends each question with the screen context. It polls for the agent's reply.
- If Copilot is not configured, or doesn't answer within 45 s, the built-in guide answers instead, and the reply is labelled as such.
