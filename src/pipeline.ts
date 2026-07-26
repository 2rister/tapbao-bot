import { config } from './config';
import { extractItemId, extractShareTitle } from './taobao/parseUrl';
import { resolveShortLink, scrapeTaobaoProduct, ScrapedProduct } from './taobao/scraper';
import { fetchProductViaApify, isApifyConfigured } from './taobao/apifyActor';
import { fetchProductDetail, isParseBotConfigured } from './taobao/parsebotApi';
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

async function resolveItemId(url: string): Promise<string | null> {
  const quickId = extractItemId(url);
  if (quickId) return quickId;

  const resolvedUrl = await resolveShortLink(url);
  return extractItemId(resolvedUrl);
}

/**
 * Full pipeline for a Taobao/Tmall product link: resolve -> fetch -> translate,
 * with a cache layer so repeat requests for the same item cost neither a
 * fresh fetch nor fresh translation quota.
 *
 * Data source preference (best data quality first):
 * 1. Apify's Taobao search actor - full photo gallery + real reviews, but
 *    needs a search keyword, so only used when the share text includes the
 *    product title (Taobao wraps it in 「...」).
 * 2. parse.bot's Taobao API - cheap/free-tier, direct item id lookup, but
 *    often only returns 1 photo/review for a given listing.
 * 3. The local Playwright scraper, as a last resort.
 */
export async function getProductInEnglish(url: string, messageText?: string): Promise<ProductResult> {
  const itemId = await resolveItemId(url);
  if (itemId) {
    const cached = readCache<ProductResult>(itemId);
    if (cached) return cached;
  }

  const shareTitle = messageText ? extractShareTitle(messageText) : null;

  let scraped: ScrapedProduct | undefined;

  if (itemId && shareTitle && isApifyConfigured()) {
    try {
      scraped = await fetchProductViaApify(itemId, shareTitle);
    } catch (error) {
      console.warn('Apify actor fetch failed, falling back:', error);
    }
  }

  if (!scraped && itemId && isParseBotConfigured()) {
    try {
      scraped = await fetchProductDetail(itemId);
    } catch (error) {
      console.warn('parse.bot fetch failed, falling back to Playwright scraper:', error);
    }
  }

  if (!scraped) {
    scraped = await scrapeTaobaoProduct(url);
  }

  const cacheKey = scraped.itemId || itemId;

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
