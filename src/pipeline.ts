import { config } from './config';
import { extractItemId } from './taobao/parseUrl';
import { scrapeTaobaoProduct, ScrapedProduct } from './taobao/scraper';
import { translateToEnglish } from './translate/azureTranslate';
import { readCache, writeCache } from './cache';

export interface ProductResult {
  itemId: string | null;
  sourceUrl: string;
  title: string;
  images: string[];
  props: { name: string; value: string }[];
  descriptionParagraphs: string[];
  reviews: { author?: string; date?: string; content: string }[];
}

function withoutTranslation(scraped: ScrapedProduct): ProductResult {
  return {
    itemId: scraped.itemId,
    sourceUrl: scraped.finalUrl,
    title: scraped.title,
    images: scraped.images,
    props: scraped.props,
    descriptionParagraphs: scraped.descriptionParagraphs,
    reviews: scraped.reviews,
  };
}

async function translateProduct(scraped: ScrapedProduct): Promise<ProductResult> {
  if (!config.azureTranslatorKey) {
    console.warn('AZURE_TRANSLATOR_KEY not set - skipping translation, returning original text.');
    return withoutTranslation(scraped);
  }

  const propNames = scraped.props.map((p) => p.name);
  const propValues = scraped.props.map((p) => p.value);
  const reviewContents = scraped.reviews.map((r) => r.content);

  const textsToTranslate = [
    scraped.title,
    ...propNames,
    ...propValues,
    ...scraped.descriptionParagraphs,
    ...reviewContents,
  ];

  const translated = await translateToEnglish(textsToTranslate);

  let cursor = 0;
  const title = translated[cursor++] || scraped.title;
  const translatedPropNames = propNames.map(() => translated[cursor++]);
  const translatedPropValues = propValues.map(() => translated[cursor++]);
  const descriptionParagraphs = scraped.descriptionParagraphs.map(() => translated[cursor++]);
  const reviewContentsTranslated = reviewContents.map(() => translated[cursor++]);

  return {
    itemId: scraped.itemId,
    sourceUrl: scraped.finalUrl,
    title,
    images: scraped.images,
    props: scraped.props.map((p, i) => ({
      name: translatedPropNames[i] || p.name,
      value: translatedPropValues[i] || p.value,
    })),
    descriptionParagraphs,
    reviews: scraped.reviews.map((r, i) => ({
      author: r.author,
      date: r.date,
      content: reviewContentsTranslated[i] || r.content,
    })),
  };
}

/**
 * Full pipeline for a Taobao/Tmall product link: resolve -> scrape -> translate,
 * with a cache layer so repeat requests for the same item cost neither a
 * fresh scrape nor fresh translation quota.
 */
export async function getProductInEnglish(url: string): Promise<ProductResult> {
  const quickId = extractItemId(url);
  if (quickId) {
    const cached = readCache<ProductResult>(quickId);
    if (cached) return cached;
  }

  const scraped = await scrapeTaobaoProduct(url);
  const cacheKey = scraped.itemId || quickId;

  if (cacheKey) {
    const cached = readCache<ProductResult>(cacheKey);
    if (cached) return cached;
  }

  const result = await translateProduct(scraped);

  if (cacheKey) {
    writeCache(cacheKey, result);
  }

  return result;
}
