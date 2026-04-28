# RPA Logic Optimizer — Deployment Guide

Convert UiPath, Automation Anywhere, and Blue Prism workflows to
production-ready Python LangChain agents in seconds.

---

## Deploy to Vercel (10 minutes)

### Step 1 — Push to GitHub
```bash
cd rpa-logic-optimizer
git init
git add .
git commit -m "Initial deploy"
gh repo create rpa-logic-optimizer --public --push
```

### Step 2 — Connect to Vercel
1. Go to https://vercel.com/new
2. Import your GitHub repo
3. Framework: **Vite** (auto-detected)
4. Click **Deploy**

### Step 3 — Add API Key
1. Vercel dashboard → your project → **Settings → Environment Variables**
2. Add: `ANTHROPIC_API_KEY` = your key from https://console.anthropic.com
3. Click **Redeploy**

Done. Your app is live at `https://your-project.vercel.app`

---

## Run Locally

```bash
npm install
cp .env.example .env.local
# Edit .env.local — add your ANTHROPIC_API_KEY

npm run dev
# → http://localhost:5173
```

---

## Project Structure

```
├── api/
│   └── convert.js        # Vercel serverless function (proxies Anthropic API)
├── src/
│   ├── App.jsx           # Main React component
│   ├── main.jsx          # React entry point
│   └── index.css         # Global reset
├── index.html            # Vite HTML entry
├── package.json
├── vite.config.js
└── vercel.json
```

---

## Architecture

```
Browser → /api/convert (Vercel Function) → Anthropic API
                ↑
         API key stays server-side
         Never exposed to browser
```

**Why this matters for monetization:**
- Rate limiting goes in `api/convert.js` (server-side, cannot be bypassed)
- Stripe webhook validation goes in a new `api/webhook.js`
- Pro tier check: add a `user_tier` lookup before the Anthropic call

---

## Phase 2 Roadmap

- [ ] Stripe Checkout for Pro tier (€9/month)
- [ ] Supabase Auth + Save to Library
- [ ] Ollama integration on Geekom Mini PC (free-tier backend)
- [ ] Enterprise: on-premise deployment option
