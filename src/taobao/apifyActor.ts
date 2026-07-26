import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { config } from '../config';
import { buildItemUrl } from './parseUrl';
import { ScrapedProduct } from './scraper';

interface ApifyReviewUser {
  nick?: string;
}

interface ApifyReview {
  content?: string;
  date?: string;
  user?: ApifyReviewUser;
}

interface ApifyProduct {
  itemId: string | number;
  title: string;
  pictures?: string[];
  mainPictureUrl?: string;
  descriptionImages?: string[];
  attributes?: { name?: string; value?: string }[];
  reviews?: ApifyReview[] | null;
  _reviewsFetched?: boolean;
}

export function isApifyConfigured(): boolean {
  return !!config.apifyApiToken;
}

function appendLog(entry: Record<string, unknown>): void {
  try {
    const logDir = path.dirname(config.apifyLogPath);
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      config.apifyLogPath,
      JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + '\n',
      'utf-8'
    );
  } catch {
    // logging failures shouldn't break the request
  }
}

/**
 * Runs the Taobao search actor for a given product title and returns the
 * result whose itemId matches. The actor only supports keyword search (no
 * direct item id/URL lookup), so we search by the product's exact title
 * (extracted from the Taobao share text) and pick the matching row out of
 * the returned candidates.
 */
export async function fetchProductViaApify(
  itemId: string,
  searchTitle: string
): Promise<ScrapedProduct> {
  const input = {
    keyword: searchTitle,
    maxItems: 10,
    sort: 'relevance',
    tmallOnly: false,
    enrichWithDetails: true,
    fetchReviews: true,
    maxReviewsPerItem: config.apifyMaxReviews,
  };

  const startedAt = Date.now();
  let products: ApifyProduct[] = [];
  let errorMessage: string | undefined;

  try {
    const response = await axios.post<ApifyProduct[]>(
      `https://api.apify.com/v2/acts/${config.apifyActorId}/run-sync-get-dataset-items`,
      input,
      {
        params: { token: config.apifyApiToken },
        timeout: 120000,
      }
    );
    products = response.data;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    appendLog({
      itemId,
      searchTitle,
      durationMs: Date.now() - startedAt,
      resultCount: products.length,
      matched: products.some((p) => String(p.itemId) === String(itemId)),
      error: errorMessage,
    });
  }

  const match =
    products.find((p) => String(p.itemId) === String(itemId)) || products[0];

  if (!match) {
    throw new Error(`Apify actor returned no results for keyword "${searchTitle}"`);
  }

  const images = Array.from(
    new Set(
      [match.mainPictureUrl, ...(match.pictures || []), ...(match.descriptionImages || [])].filter(
        (src): src is string => !!src
      )
    )
  ).slice(0, 10);

  const props = (match.attributes || [])
    .filter((a) => a.name && a.value)
    .map((a) => ({ name: a.name as string, value: a.value as string }));

  const reviews = (match.reviews || [])
    .map((r) => ({
      content: (r.content || '').trim(),
      author: r.user?.nick,
      date: r.date,
    }))
    .filter((r) => r.content.length > 0 && !r.content.includes('系统默认好评'))
    .slice(0, 5);

  return {
    itemId: String(match.itemId),
    finalUrl: buildItemUrl(String(match.itemId)),
    title: match.title || searchTitle,
    images,
    props,
    descriptionParagraphs: [],
    reviews,
  };
}
