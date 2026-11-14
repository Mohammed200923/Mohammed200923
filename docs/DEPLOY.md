# Putting SkyShift online

Judges need a **public link that works without installing anything**. Real SPHEREx data only works through SkyShift's small proxy server (`server.py`), because NASA's IRSA archive doesn't allow direct browser requests (no CORS headers). So the app needs a host that can run a container, not only static files.

The repo includes a `Dockerfile`. It needs only the Python standard library, listens on `$PORT`, and serves the app plus the allow-listed `/proxy`. Locally that's equivalent to:

```bash
PORT=8080 HOST=0.0.0.0 python3 server.py
```

## Option A: Google Cloud Run (recommended, free tier)

Claim the Google Cloud credit from your Space Apps profile → Offers first. Then, from the repo folder:

```bash
gcloud auth login
```

```bash
gcloud run deploy skyshift --source . --region me-central2 --allow-unauthenticated
```

`me-central2` is Dammam, Saudi Arabia; any region works. The command prints a public `https://skyshift-….run.app` link. Open it in a private window to confirm it works without a login, then load Barnard's Star with the data source set to NASA SPHEREx.

## Option B: Azure Container Apps

Claim the Azure offer, then:

```bash
az login
```

```bash
az containerapp up --name skyshift --source . --ingress external --target-port 8080
```

## Option C: Hugging Face Spaces (free, no card, no approval)

1. Create a free account at huggingface.co.
2. Go to **New → Space**, name it `skyshift`, choose **Docker → Blank** and **Public**, then **Create Space**.
3. Unzip `dist/skyshift-huggingface-space.zip` on your computer.
4. In the Space, open **Files → Add file → Upload files**. Drag in *everything* from the unzipped folder: `README.md`, `Dockerfile`, `server.py` and the `app` folder. Then click **Commit**.
5. Wait for the build (2–3 minutes; status at the top). The app appears on the Space page, and its direct link is `https://<username>-skyshift.hf.space`.

## Optional: a short domain (GoDaddy free domain)

Point the free domain at whichever host you used. Both Cloud Run and Azure Container Apps let you add a custom domain from their console; they show the DNS records to create in GoDaddy. A domain is a nice touch, not a requirement: the `run.app` or `azurecontainerapps.io` link is enough for submission.

## No server at all (fallback)

`dist/skyshift.html` and GitHub Pages work everywhere, but only with simulated data, because there's no proxy. Use this only as a backup for the demo.

## Which free Space Apps offers help this project

| Offer | Use it? | For what |
|---|---|---|
| **Google Cloud** | ✅ | Hosting the app + proxy on Cloud Run (Option A) |
| **Microsoft Azure** | ✅ (alternative) | Hosting on Container Apps (Option B) |
| **GoDaddy free domain** | Optional | A short, memorable link for the pitch |
| **Miro** (education plan, templates) | ✅ | Team task board, the 7-slide storyboard, an architecture diagram |
| **Microsoft Teams** | Optional | Team chat and calls over the weekend |
| **GitHub Copilot / Microsoft Copilot** | Optional | Coding and writing help. Declare it on the project page like any AI tool. |
| Microsoft Planetary Computer | ✗ | Earth-observation data (Landsat, Sentinel), not sky data |
| Meteomatics weather API | ✗ | Weather data, not relevant to SPHEREx |
