# tapbao-bot

Telegram bot: send it a Taobao or Tmall product link, get back:

- all the product photos
- an English description (material, size, and other listed attributes)
- the 5 latest reviews, translated to English

Translation uses the **Azure Translator free tier** (2,000,000 characters/month,
free forever, not a trial) — no paid LLM calls. Product data comes from one of
four sources, tried in order of data quality:

0. **A page you (or a friend) upload** - save the product page from your own
   browser as `.html` or `.mhtml` and send that file to the bot instead of a
   link. Completely free (no API call at all) since your browser already did
   the work of loading the real page. See below.
1. **Apify's Taobao search actor** (best quality: full photo gallery + real
   reviews, pay-per-event, ~$0.5-0.6/lookup) — used when the shared message
   includes the product title
2. **parse.bot's Taobao API** (free tier: 100 requests/month, but often only
   1 photo/review per listing)
3. A local Playwright scraper, as a last resort

## Free option: upload a saved page instead of a link

If you don't want every lookup to cost Apify credits (e.g. sharing the bot
with friends), have them save the product page from their own browser and
send the file to the bot instead of a link:

- **Chrome/Edge**: open the product page → `⋮` menu → **Save and share** →
  **Save page** → choose **Webpage, Single File** (produces a `.mhtml`)
- Or **File → Save Page As…** → **Webpage, Complete** (produces a `.html`)

Send that file to the bot as a Telegram document (not as a photo). It's
parsed locally with no network calls to Taobao and no Apify/parse.bot cost -
whatever the person's own browser could see (already past any geo-block or
login wall on their end) is what the bot extracts. Reviews only come through
if they were visible/loaded on the page before saving.

## How it works

1. You paste a `item.taobao.com` / `detail.tmall.com` / `tb.cn` link into the
   chat (forwarding the original Taobao share message works best - see below).
2. The bot resolves the link to a numeric item id, then fetches the title,
   images, attributes, and reviews from whichever configured source ranks
   highest (see above).
3. All Chinese text is translated to English via the Azure Translator API.
4. Everything is cached on disk per product id for `CACHE_TTL_HOURS` (default
   12h), so re-sharing the same link doesn't re-fetch or re-spend quota.

### Why forwarding the original share message matters

Taobao share messages wrap the product title in Chinese brackets, e.g.:

```
【淘宝】7天无理由退货 https://e.tb.cn/h.xxxxx?tk=xxxx
「ANTERIOR LOVED 超重工羊毛立领挺括带帽毛呢牛角扣长风衣」
```

The Apify actor (source #1 above, the one with full photo galleries and real
reviews) only supports keyword search, not direct item id/URL lookup - so the
bot extracts that bracketed title and searches for it, then matches the
result back to your item id. If you paste a bare link with no title text,
the bot falls back to parse.bot or the local scraper instead.

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

### 3. Apify API token (best data quality)

1. Sign up at [apify.com](https://apify.com) and add the
   [Taobao Tmall Product Scraper](https://apify.com/zen-studio/taobao-search-scraper)
   actor from the Store.
2. Get an API token from
   [console.apify.com/settings/integrations](https://console.apify.com/settings/integrations)
   and put it in `APIFY_API_TOKEN`.

This is pay-per-event (~$0.5-0.6 per lookup with reviews) — cheap for
personal/occasional use, but not free. `APIFY_MAX_REVIEWS` (default 5)
controls the review add-on cost. Every call is logged to `APIFY_LOG_PATH`
(default `storage/logs/apify.jsonl`) as one JSON line per request (keyword,
result count, whether it matched, cost-relevant fields) - useful both for
debugging and as a reference if you want to build a self-hosted replacement
later to cut the per-request cost.

### 4. parse.bot Taobao API key (free fallback)

1. Go to [parse.bot](https://parse.bot), sign in, find **"Taobao API"** in
   the marketplace, and **Subscribe** (free tier: 100 requests/month, 5/min).
2. Copy your API key (gear icon in the top bar) into `PARSEBOT_API_KEY`.

### 5. Install

```bash
npm install        # also runs `playwright install --with-deps chromium`
cp .env.example .env
# fill in .env with the values from steps 1-4
```

### 6. (Only needed without Apify/parse.bot configured) Save a logged-in Taobao session

Skip this if you configured `APIFY_API_TOKEN` or `PARSEBOT_API_KEY` above.

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

### 7. Run

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

- **Apify** only runs when the share text includes the bracketed product
  title (see "Why forwarding the original share message matters" above), and
  costs real money per lookup (~$0.5-0.6 with reviews) - not free like the
  other two sources.
- **parse.bot free tier** is capped at 100 requests/month, 5/min - the disk
  cache helps stretch this. Its gallery/review extraction has been unreliable
  for some listings (returning 1 photo/review even when more exist) despite
  several rounds of fixes from their support agent.
- **Without Apify or a parse.bot key**, the bot relies on scraping the
  rendered page itself, which has no official API and is subject to Taobao's
  anti-bot measures and its overseas-IP redirect (mitigated but not
  eliminated by a `beforeunload` hook — see `src/taobao/scraper.ts`). Datacenter
  proxies (even China-located ones) did not bypass this in testing - Taobao
  appears to also detect non-residential IPs. If scraping starts failing,
  refresh the login state (step 6) and check whether the CSS selectors in
  `src/taobao/scraper.ts` still match the current page markup.
- Translation quality depends on Azure Translator's zh→en model; it's solid
  for general text but won't always nail brand names or slang.

## Environment variables

See `.env.example` for the full list with comments.
