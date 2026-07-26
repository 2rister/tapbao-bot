import { ProductResult } from './pipeline';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const TELEGRAM_TEXT_LIMIT = 4096;

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function buildInfoMessage(product: ProductResult): string {
  const lines: string[] = [];
  lines.push(`<b>${escapeHtml(product.title || 'Untitled product')}</b>`);

  if (product.props.length > 0) {
    lines.push('');
    lines.push('<b>Details:</b>');
    for (const { name, value } of product.props) {
      if (!value) continue;
      lines.push(name ? `• ${escapeHtml(name)}: ${escapeHtml(value)}` : `• ${escapeHtml(value)}`);
    }
  }

  if (product.descriptionParagraphs.length > 0) {
    lines.push('');
    lines.push('<b>Description:</b>');
    for (const paragraph of product.descriptionParagraphs) {
      lines.push(escapeHtml(paragraph));
    }
  }

  lines.push('');
  lines.push(`<a href="${product.sourceUrl}">Original Taobao listing</a>`);

  return truncate(lines.join('\n'), TELEGRAM_TEXT_LIMIT);
}

export function buildReviewsMessage(product: ProductResult): string | null {
  if (product.reviews.length === 0) return null;

  const lines: string[] = ['<b>Latest reviews:</b>', ''];
  product.reviews.forEach((review, i) => {
    const meta = [review.author, review.date].filter(Boolean).join(' · ');
    lines.push(`${i + 1}. "${escapeHtml(review.content)}"${meta ? ` — ${escapeHtml(meta)}` : ''}`);
    lines.push('');
  });

  return truncate(lines.join('\n').trim(), TELEGRAM_TEXT_LIMIT);
}
