const URL_REGEX = /https?:\/\/[^\s，,。]+/gi;

const TAOBAO_HOST_HINTS = [
  'taobao.com',
  'tmall.com',
  'tmall.hk',
  'tb.cn',
  'm.tb.cn',
];

/** Pulls the first Taobao/Tmall-looking URL out of an arbitrary message. */
export function extractTaobaoUrl(text: string): string | null {
  const matches = text.match(URL_REGEX);
  if (!matches) return null;

  for (const raw of matches) {
    const url = raw.replace(/[)\]】」]+$/, '');
    try {
      const host = new URL(url).hostname;
      if (TAOBAO_HOST_HINTS.some((hint) => host.endsWith(hint))) {
        return url;
      }
    } catch {
      // not a valid URL, skip
    }
  }
  return null;
}

/**
 * Extracts the numeric item id from a resolved Taobao/Tmall item page URL,
 * e.g. https://item.taobao.com/item.htm?id=123456789 -> "123456789"
 */
export function extractItemId(resolvedUrl: string): string | null {
  try {
    const url = new URL(resolvedUrl);
    const id = url.searchParams.get('id');
    if (id && /^\d+$/.test(id)) return id;
  } catch {
    // ignore
  }
  const match = resolvedUrl.match(/[?&]id=(\d+)/);
  return match ? match[1] : null;
}

export function isShortLink(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.endsWith('tb.cn');
  } catch {
    return false;
  }
}

/** Builds the direct desktop item page URL, bypassing the short-link app-open interstitial. */
export function buildItemUrl(itemId: string): string {
  return `https://item.taobao.com/item.htm?id=${itemId}`;
}

/**
 * Taobao share messages wrap the product title in Chinese corner brackets,
 * e.g. 「ANTERIOR LOVED 超重工羊毛立领挺括带帽毛呢牛角扣长风衣」. Extracting it lets us
 * search for the exact product without an extra paid lookup just to find its name.
 */
export function extractShareTitle(text: string): string | null {
  const match = text.match(/「([^」]+)」/);
  return match ? match[1].trim() : null;
}
