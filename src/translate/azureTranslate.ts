import axios from 'axios';
import { config } from '../config';

const MAX_ITEMS_PER_REQUEST = 90;
const MAX_CHARS_PER_REQUEST = 9000;

interface AzureTranslateResult {
  translations: { text: string; to: string }[];
}

/**
 * Translates a batch of Chinese strings to English using the Azure
 * Translator free tier. Preserves input order and count; empty inputs are
 * passed through as empty strings without spending quota on them.
 */
export async function translateToEnglish(texts: string[]): Promise<string[]> {
  const results: string[] = new Array(texts.length).fill('');

  const indices = texts
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => text.trim().length > 0);

  let batch: { text: string; index: number }[] = [];
  let batchChars = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const translated = await callAzure(batch.map((b) => b.text));
    batch.forEach((b, i) => {
      results[b.index] = translated[i] ?? b.text;
    });
    batch = [];
    batchChars = 0;
  };

  for (const item of indices) {
    if (
      batch.length >= MAX_ITEMS_PER_REQUEST ||
      batchChars + item.text.length > MAX_CHARS_PER_REQUEST
    ) {
      await flush();
    }
    batch.push(item);
    batchChars += item.text.length;
  }
  await flush();

  return results;
}

async function callAzure(texts: string[]): Promise<string[]> {
  const response = await axios.post<AzureTranslateResult[]>(
    `${config.azureTranslatorEndpoint}/translate`,
    texts.map((text) => ({ Text: text })),
    {
      params: { 'api-version': '3.0', to: 'en' },
      headers: {
        'Ocp-Apim-Subscription-Key': config.azureTranslatorKey,
        'Ocp-Apim-Subscription-Region': config.azureTranslatorRegion,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  return response.data.map((entry) => entry.translations[0]?.text ?? '');
}
