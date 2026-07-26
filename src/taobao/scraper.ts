import fs from 'fs';
import { chromium, Page, Response as PWResponse } from 'playwright';
import { config } from '../config';
import { extractItemId } from './parseUrl';

export interface ScrapedReview {
  author?: string;
  content: string;
  date?: string;
}

export interface ScrapedProduct {
  itemId: string | null;
  finalUrl: string;
  title: string;
  images: string[];
  props: { name: string; value: string }[];
  descriptionParagraphs: string[];
  reviews: ScrapedReview[];
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const REVIEW_TEXT_KEYS = [
  'rateContent',
  'content',
  'comment',
  'feedback',
  'reviewContent',
  'commentContent',
  'desc',
];
const REVIEW_AUTHOR_KEYS = ['userNick', 'nick', 'memberName', 'buyerNick', 'userName'];
const REVIEW_DATE_KEYS = ['rateDate', 'commentDate', 'gmtCreate', 'date', 'createTime'];

/** Best-effort deep search for an array of review-like objects inside an arbitrary JSON blob. */
function findReviewArray(node: unknown, depth = 0): Record<string, unknown>[] | null {
  if (depth > 6 || node == null) return null;

  if (Array.isArray(node)) {
    const objectItems = node.filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item)
    );
    if (objectItems.length >= 1) {
      const hasReviewShape = objectItems.some((item) =>
        REVIEW_TEXT_KEYS.some(
          (key) => typeof item[key] === 'string' && (item[key] as string).trim().length > 1
        )
      );
      if (hasReviewShape) return objectItems;
    }
    for (const item of node) {
      const found = findReviewArray(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      const found = findReviewArray(value, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function pickField(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

async function collectReviewsFromNetwork(page: Page): Promise<ScrapedReview[]> {
  const candidates: Record<string, unknown>[] = [];

  const onResponse = async (response: PWResponse) => {
    try {
      const url = response.url();
      if (!/rate|comment|feedback|review/i.test(url)) return;
      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('json') && !contentType.includes('javascript')) return;

      const text = await response.text();
      const jsonText = text.replace(/^[^(]*\((.*)\)[^)]*$/s, '$1'); // unwrap jsonp if present
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        return;
      }
      const found = findReviewArray(parsed);
      if (found) candidates.push(...found);
    } catch {
      // ignore individual response parse failures
    }
  };

  page.on('response', onResponse);

  // Try to trigger the reviews tab so the page fires its own signed review request.
  const tabSelectors = [
    'text=评价',
    'text=累计评价',
    'text=Reviews',
    '[data-role="reviews"]',
    'a[href*="rate"]',
  ];
  for (const selector of tabSelectors) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 1500 })) {
        await el.click({ timeout: 1500 }).catch(() => undefined);
        break;
      }
    } catch {
      // selector not present, try next
    }
  }

  await page.waitForTimeout(3500);
  page.off('response', onResponse);

  const seen = new Set<string>();
  const reviews: ScrapedReview[] = [];
  for (const item of candidates) {
    const content = pickField(item, REVIEW_TEXT_KEYS);
    if (!content || content.length < 2) continue;
    if (seen.has(content)) continue;
    seen.add(content);
    reviews.push({
      content,
      author: pickField(item, REVIEW_AUTHOR_KEYS),
      date: pickField(item, REVIEW_DATE_KEYS),
    });
  }
  return reviews.slice(0, 5);
}

async function collectImages(page: Page): Promise<string[]> {
  const raw = await page.$$eval('img', (imgs) =>
    imgs.map((img) => (img as HTMLImageElement).currentSrc || img.src)
  );

  const normalize = (src: string) => (src.startsWith('//') ? `https:${src}` : src);

  const cleaned = raw
    .filter((src) => !!src && /alicdn\.com/.test(src))
    .map(normalize)
    // strip Taobao's size/quality suffix so we request the original image
    .map((src) => src.replace(/_\d+x\d+.*?\.(jpg|jpeg|png|webp)/i, '.$1'))
    .filter((src) => !/logo|icon|sprite|blank\.gif/i.test(src));

  return Array.from(new Set(cleaned)).slice(0, 9);
}

async function collectProps(page: Page): Promise<{ name: string; value: string }[]> {
  const selectors = ['#J_AttrUL li', '.attributes-list li', '.tb-key', 'ul.attributes-list li'];
  for (const selector of selectors) {
    try {
      const items = await page.$$eval(selector, (nodes) =>
        nodes
          .map((n) => n.textContent?.trim() || '')
          .filter(Boolean)
      );
      if (items.length > 0) {
        return items.map((text) => {
          const [name, ...rest] = text.split(/[:：]/);
          return rest.length > 0
            ? { name: name.trim(), value: rest.join(':').trim() }
            : { name: '', value: text };
        });
      }
    } catch {
      // try next selector
    }
  }
  return [];
}

async function collectDescriptionParagraphs(page: Page): Promise<string[]> {
  const selectors = ['#description', '.detail-content', '#J_DivItemDesc'];
  for (const selector of selectors) {
    try {
      const frame = page
        .frames()
        .find((f) => f.url().includes('description') || f.url().includes('desc'));
      const source = frame ?? page;
      const text: string = await source
        .$eval(selector, (el) => el.textContent || '')
        .catch(() => '');
      if (text && text.trim().length > 0) {
        return text
          .split(/\n+/)
          .map((line) => line.trim())
          .filter((line) => line.length > 1)
          .slice(0, 40);
      }
    } catch {
      // try next
    }
  }
  return [];
}

export async function scrapeTaobaoProduct(url: string): Promise<ScrapedProduct> {
  const browser = await chromium.launch({ headless: config.playwrightHeadless });
  const hasStorageState = fs.existsSync(config.taobaoStorageStatePath);

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
    locale: 'zh-CN',
    storageState: hasStorageState ? config.taobaoStorageStatePath : undefined,
  });

  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    const itemId = extractItemId(finalUrl);

    const title = await page
      .locator('h1, .tb-main-title, [class*="Title--mainTitle"]')
      .first()
      .textContent({ timeout: 5000 })
      .then((t) => t?.trim() || '')
      .catch(() => '');

    const [images, props, descriptionParagraphs, reviews] = await Promise.all([
      collectImages(page).catch(() => []),
      collectProps(page).catch(() => []),
      collectDescriptionParagraphs(page).catch(() => []),
      collectReviewsFromNetwork(page).catch(() => []),
    ]);

    return { itemId, finalUrl, title, images, props, descriptionParagraphs, reviews };
  } finally {
    await context.close();
    await browser.close();
  }
}
