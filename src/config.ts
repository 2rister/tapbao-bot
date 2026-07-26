import 'dotenv/config';
import path from 'path';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),

  // Optional: restricts /restart to this Telegram numeric user id. If unset,
  // /restart is disabled entirely (safer default for a bot other people can message).
  telegramOwnerId: process.env.TELEGRAM_OWNER_ID ? Number(process.env.TELEGRAM_OWNER_ID) : null,

  // Optional: if unset, translation is skipped and original (Chinese) text
  // is returned as-is instead of failing the whole request.
  azureTranslatorKey: process.env.AZURE_TRANSLATOR_KEY || '',
  azureTranslatorRegion: process.env.AZURE_TRANSLATOR_REGION || 'global',
  azureTranslatorEndpoint:
    process.env.AZURE_TRANSLATOR_ENDPOINT ||
    'https://api.cognitive.microsofttranslator.com',

  // Persistent Chromium profile dir: cookies/login survive across requests
  // and bot restarts, and the browser process itself is kept alive between
  // requests instead of being relaunched for every message.
  taobaoProfileDir: process.env.TAOBAO_PROFILE_DIR
    ? path.resolve(process.env.TAOBAO_PROFILE_DIR)
    : path.resolve('./storage/taobao-profile'),

  playwrightHeadless: process.env.PLAYWRIGHT_HEADLESS !== 'false',

  // Optional HTTP(S) proxy for the scraping browser, e.g. when running
  // behind a corporate/sandbox proxy. Defaults to the standard HTTPS_PROXY
  // env var if set.
  playwrightProxyServer: process.env.PLAYWRIGHT_PROXY_SERVER || process.env.HTTPS_PROXY || '',

  // Only needed behind a TLS-intercepting proxy (e.g. a sandboxed dev
  // environment) whose CA Chromium doesn't trust. Leave off in production.
  playwrightIgnoreHttpsErrors: process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === 'true',

  cacheTtlHours: Number(process.env.CACHE_TTL_HOURS || 12),

  cacheDir: path.resolve('./storage/cache'),
};
