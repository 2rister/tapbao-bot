import * as cheerio from 'cheerio';
import { simpleParser } from 'mailparser';
import { ScrapedProduct } from './scraper';
import { extractItemId } from './parseUrl';

/**
 * Extracts the underlying page HTML from a file a user saved from their own
 * browser (already past Taobao's overseas-IP block / login, since it's
 * their own live session) - either a plain .html save or a single-file
 * .mhtml/.mht save (a MIME message wrapping the HTML + embedded resources).
 */
async function extractHtml(buffer: Buffer, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.mhtml') || lower.endsWith('.mht')) {
    const parsed = await simpleParser(buffer);
    if (typeof parsed.html === 'string' && parsed.html.length > 0) return parsed.html;
    if (typeof parsed.text === 'string') return parsed.text;
    throw new Error('Could not find HTML content in the .mhtml file');
  }
  return buffer.toString('utf-8');
}

function normalizeImageUrl(src: string): string {
  return src.startsWith('//') ? `https:${src}` : src;
}

function collectImages($: cheerio.CheerioAPI): string[] {
  const gallerySelectors = ['#picGalleryEle img', '[class*="picGallery--"] img', '[class*="PicGallery--"] img'];

  const extract = (selector: string): string[] =>
    $(selector)
      .map((_, el) => $(el).attr('src') || $(el).attr('data-src') || '')
      .get()
      .filter(Boolean);

  let raw: string[] = [];
  for (const selector of gallerySelectors) {
    raw = extract(selector);
    if (raw.length > 0) break;
  }
  if (raw.length === 0) raw = extract('img');

  const cleaned = raw
    .filter((src) => /alicdn\.com/.test(src))
    .map(normalizeImageUrl)
    .map((src) => src.replace(/_\d+x\d+.*?\.(jpg|jpeg|png|webp)/i, '.$1'))
    .filter((src) => !/logo|icon|sprite|blank\.gif/i.test(src));

  return Array.from(new Set(cleaned)).slice(0, 20);
}

function collectProps($: cheerio.CheerioAPI): { name: string; value: string }[] {
  const selectors = ['#J_AttrUL li', '.attributes-list li', '.tb-key', '[class*="skuItem--"]'];
  for (const selector of selectors) {
    const items = $(selector)
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    if (items.length > 0) {
      return items.map((text) => {
        const [name, ...rest] = text.split(/[:：]/);
        return rest.length > 0
          ? { name: name.trim(), value: rest.join(':').trim() }
          : { name: '', value: text };
      });
    }
  }
  return [];
}

function collectDescriptionParagraphs($: cheerio.CheerioAPI): string[] {
  const selectors = ['#description', '.detail-content', '#J_DivItemDesc', '[class*="desc-root"]'];
  for (const selector of selectors) {
    const text = $(selector).first().text().trim();
    if (text.length > 0) {
      return text
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 1)
        .slice(0, 40);
    }
  }
  return [];
}

function collectReviews($: cheerio.CheerioAPI): { author?: string; content: string }[] {
  const cards = $('[class*="Comment--"]')
    .slice(0, 5)
    .map((_, node) => {
      const author = $(node).find('[class*="userName--"]').first().text().trim() || undefined;
      const content = $(node).find('[class*="content--"]').first().text().trim();
      return { author, content };
    })
    .get();

  return cards.filter((c) => c.content.length > 1);
}

export async function parseArchiveFile(
  buffer: Buffer,
  filename: string
): Promise<ScrapedProduct> {
  const html = await extractHtml(buffer, filename);
  const $ = cheerio.load(html);

  const title =
    $('h1, .tb-main-title, [class*="Title--mainTitle"]').first().text().trim() ||
    $('title').first().text().trim();

  const canonicalHref =
    $('link[rel="canonical"]').attr('href') ||
    $('meta[property="og:url"]').attr('content') ||
    '';
  const itemId = extractItemId(canonicalHref) || extractItemId(html);

  return {
    itemId,
    finalUrl: itemId ? `https://item.taobao.com/item.htm?id=${itemId}` : canonicalHref,
    title,
    images: collectImages($),
    props: collectProps($),
    descriptionParagraphs: collectDescriptionParagraphs($),
    reviews: collectReviews($),
  };
}
