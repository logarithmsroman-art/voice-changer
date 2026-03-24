# VoiceShift — Real-Time AI Voice Changer

Single-tenant web app: speak into your mic → voice converted live to a cloned target voice via Seed-VC on Modal GPUs.

## Stack

| Layer | Tool |
|-------|------|
| Frontend + API | Next.js 16 (App Router) |
| Voice model | Seed-VC (zero-shot) |
| GPU serverless | Modal (A10G) |
| Audio streaming | WebSocket |
| Storage | Cloudflare R2 |
| Database | Supabase |
| Deploy | Vercel + Modal |

## Deploy for a New Customer

### 1. Clone & install

```bash
git clone <repo> && cd voice-changer-app
npm install
pip install modal  # for deploying the backend
```

### 2. Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Open the SQL editor and run `supabase/schema.sql`
3. Copy your project URL, anon key, and service role key

### 3. Cloudflare R2

1. Create a new bucket at [dash.cloudflare.com](https://dash.cloudflare.com) → R2
2. Enable public access on the bucket
3. Create an API token with R2 read/write permissions

### 4. Modal

```bash
modal setup   # authenticate
cd modal
modal deploy server.py
```

Copy the WebSocket URL printed at the end (e.g. `wss://your-org--voice-changer-web.modal.run/ws`).

### 5. Environment variables

```bash
cp .env.example .env.local
# Fill in all values
```

### 6. Deploy to Vercel

```bash
npx vercel --prod
# Or push to GitHub and connect the repo in Vercel dashboard
# Add all env vars in Vercel → Project Settings → Environment Variables
```

Done — the customer has their own isolated instance.

---

## Local Development

```bash
npm run dev
# Visit http://localhost:3000
```

For voice conversion to work locally, you need `MODAL_WS_URL` pointing to a deployed Modal server. The upload and profile flows work without Modal.

## Audio Routing (for use in calls)

To use your converted voice in Zoom, Discord, etc.:

**macOS:** Install [BlackHole](https://existential.audio/blackhole/) → set it as the default output → select it as your microphone in the call app.

**Windows:** Install [VB-Cable](https://vb-audio.com/Cable/) → same idea.

## Cost (per customer)

| Resource | Cost |
|----------|------|
| Modal GPU (A10G, active use only) | ~$0.10/hr |
| Cloudflare R2 (under 10 GB) | Free |
| Supabase | Free tier |
| Vercel | Free tier |
| **Total (light use)** | **~$0–$20/month** |

Modal's $30 free credits cover all initial testing.
