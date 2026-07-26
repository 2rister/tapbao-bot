# tapbao-bot

Telegram bot: send it a Taobao or Tmall product link, get back:

- all the product photos
- an English description (material, size, and other listed attributes)
- the 5 latest reviews, translated to English

Built to run indefinitely on free tiers only — no paid LLM calls. Translation
uses the **Azure Translator free tier** (2,000,000 characters/month, free
forever, not a trial). Product data comes from
[parse.bot's Taobao API](https://parse.bot/marketplace) (free tier: 100
requests/month) when configured, with a local Playwright scraper as a
fallback.

## How it works

1. You paste a `item.taobao.com` / `detail.tmall.com` / `tb.cn` link into the
   chat.
2. The bot resolves the link to a numeric item id and fetches the title,
   images, attributes, description, and reviews — either from parse.bot's API
   (recommended: it already runs from a Chinese vantage point, so it isn't
   affected by Taobao's overseas-IP block or its login requirement) or, if
   that's not configured, by scraping the page directly with a headless
   Chromium (Playwright) that stays running across requests.
3. All Chinese text is translated to English via the Azure Translator API.
4. Everything is cached on disk per product id for `CACHE_TTL_HOURS` (default
   12h), so re-sharing the same link doesn't re-fetch or re-spend translation
   quota.

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

### 3. parse.bot Taobao API key (recommended)

Taobao blocks/redirects requests from non-Chinese IPs and often requires a
login for full item data — parse.bot's hosted API already handles this from
their end, so you don't need your own China proxy or a Taobao account login.

1. Go to [parse.bot](https://parse.bot), sign in, find **"Taobao API"** in
   the marketplace, and **Subscribe** (free tier: 100 requests/month, 5/min).
2. Copy your API key (gear icon in the top bar) into `PARSEBOT_API_KEY`.

Without this key, the bot falls back to the local Playwright scraper (see
step 5 and Known limitations below) — works, but less reliable.

### 4. Install

```bash
npm install        # also runs `playwright install --with-deps chromium`
cp .env.example .env
# fill in .env with the values from steps 1-3
```

### 5. (Only needed without a parse.bot key) Save a logged-in Taobao session

Skip this if you configured `PARSEBOT_API_KEY` above.

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

### 6. Run

```bash
npm run build
npm start
```

or for local development with auto-reload:

```bash
npm run dev
```

## Restarting from Telegram

If `TELEGRAM_OWNER_ID` is set in `.env` (get your numeric id from
[@userinfobot](https://t.me/userinfobot)), a **🔄 Restart** button appears
after `/start` for that user only. It closes the shared Playwright browser
session so the next request starts fresh — handy if scraping gets stuck,
without needing SSH access.

## Deployment

Any small always-on VM/container works (the bot uses long-polling, no public
URL/webhook required). A couple of straightforward options:

- **systemd / pm2** on a small VPS: `pm2 start dist/index.js --name tapbao-bot`
- **Docker**: build an image based on `mcr.microsoft.com/playwright:v1.49.1-jammy`,
  copy the project in, run `npm ci && npm run build`, `CMD ["node", "dist/index.js"]`.
  Mount `./storage` as a volume so the cache and login cookies persist across
  restarts.

## Known limitations

- **parse.bot free tier** is capped at 100 requests/month, 5/min — the disk
  cache helps stretch this, but heavy use will need a paid parse.bot tier.
  Its review list may return fewer than 5 reviews depending on what Taobao
  exposes for a given item.
- **Without a parse.bot key**, the bot relies on scraping the rendered page
  itself, which has no official API and is subject to Taobao's anti-bot
  measures and its overseas-IP redirect (mitigated but not eliminated by a
  `beforeunload` hook — see `src/taobao/scraper.ts`). If scraping starts
  failing, refresh the login state (step 5) and check whether the CSS
  selectors in `src/taobao/scraper.ts` still match the current page markup.
- Translation quality depends on Azure Translator's zh→en model; it's solid
  for general text but won't always nail brand names or slang.

## Environment variables

See `.env.example` for the full list with comments.
