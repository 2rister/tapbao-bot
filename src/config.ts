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

  azureTranslatorKey: required('AZURE_TRANSLATOR_KEY'),
  azureTranslatorRegion: process.env.AZURE_TRANSLATOR_REGION || 'global',
  azureTranslatorEndpoint:
    process.env.AZURE_TRANSLATOR_ENDPOINT ||
    'https://api.cognitive.microsofttranslator.com',

  taobaoStorageStatePath: process.env.TAOBAO_STORAGE_STATE_PATH
    ? path.resolve(process.env.TAOBAO_STORAGE_STATE_PATH)
    : path.resolve('./storage/taobao-state.json'),

  playwrightHeadless: process.env.PLAYWRIGHT_HEADLESS !== 'false',

  cacheTtlHours: Number(process.env.CACHE_TTL_HOURS || 12),

  cacheDir: path.resolve('./storage/cache'),
};
