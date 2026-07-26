# tapbao-bot

Telegram bot: send it a Taobao or Tmall product link, get back:

- all the product photos
- an English description (material, size, and other listed attributes)
- the 5 latest reviews, translated to English

Built to run indefinitely on free tiers only — no paid LLM calls. Translation
uses the **Azure Translator free tier** (2,000,000 characters/month, free
forever, not a trial), and product data comes from scraping the product page
directly with a real browser (Playwright) rather than a paid data API.

## How it works

1. You paste a `item.taobao.com` / `detail.tmall.com` / `tb.cn` link into the
   chat.
2. The bot resolves the link and scrapes the title, gallery images,
   attributes table, description text, and (best-effort) the review list
   using a headless Chromium (Playwright) that stays running and logged in
   across requests, instead of relaunching for every message.
3. All Chinese text is translated to English via the Azure Translator API.
4. Everything is cached on disk per product id for `CACHE_TTL_HOURS` (default
   12h), so re-sharing the same link doesn't re-scrape Taobao or re-spend
   translation quota.

## Setup

### 1. Telegram bot token

Talk to [@BotFather](https://t.me/BotFather) on Telegram, `/newbot`, copy the
token into `TELEGRAM_BOT_TOKEN`.

### 2. Azure Translator free key

1. Sign in to [portal.azure.com](https://portal.azure.com) (a free Microsoft
   account is enough).
2. Create a resource → search **"Translator"** → create it with pricing tier
   **F0 (Free)**. Region can be left as-is; if you don't have a preference,
   use `global` in `.env`.
3. Once created, open the resource → **Keys and Endpoint** → copy **Key 1**
   into `AZURE_TRANSLATOR_KEY`, and the region shown there into
   `AZURE_TRANSLATOR_REGION`.

F0 gives 2,000,000 characters/month for free, permanently — no credit card
charge as long as you stay on the free tier.

### 3. Install

```bash
npm install        # also runs `playwright install --with-deps chromium`
cp .env.example .env
# fill in .env with the values from steps 1-2
```

### 4. (Strongly recommended) Save a logged-in Taobao session

Taobao aggressively rate-limits and blocks anonymous/headless traffic, and
the reviews list in particular is often only served to logged-in sessions.
Run this once, locally, with a visible window:

```bash
npx ts-node scripts/save-login-state.ts
```

It opens a real browser to the Taobao login page, using the same persistent
Chromium profile the bot itself uses (`storage/taobao-profile/` by default,
`TAOBAO_PROFILE_DIR` in `.env`) — scan the QR code with the Taobao app, then
press Enter in the terminal. The bot picks up the session automatically on
its next scrape, no file to copy. Re-run this occasionally if the session
expires.

### 5. Run

```bash
npm run build
npm start
```

or for local development with auto-reload:

```bash
npm run dev
```

## Deployment

Any small always-on VM/container works (the bot uses long-polling, no public
URL/webhook required). A couple of straightforward options:

- **systemd / pm2** on a small VPS: `pm2 start dist/index.js --name tapbao-bot`
- **Docker**: build an image based on `mcr.microsoft.com/playwright:v1.49.1-jammy`,
  copy the project in, run `npm ci && npm run build`, `CMD ["node", "dist/index.js"]`.
  Mount `./storage` as a volume so the cache and login cookies persist across
  restarts.

## Known limitations

- Taobao has no official public API for external developers, so this relies
  on scraping the rendered page. Their anti-bot measures change over time —
  if scraping starts failing, refresh the login state (step 4) and check
  whether the CSS selectors in `src/taobao/scraper.ts` still match the
  current page markup.
- The reviews list is fetched by intercepting the page's own signed network
  request client-side (no request signing is reimplemented), so it depends
  on the page actually firing that request — this can fail silently on
  layout changes. When it fails, the bot still returns photos + description,
  just without reviews.
- Translation quality depends on Azure Translator's zh→en model; it's solid
  for general text but won't always nail brand names or slang.

## Environment variables

See `.env.example` for the full list with comments.
