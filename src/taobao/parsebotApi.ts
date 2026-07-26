import axios from 'axios';
import { config } from '../config';
import { buildItemUrl } from './parseUrl';
import { ScrapedProduct } from './scraper';

interface ParsebotReview {
  reviewer_name?: string;
  rating?: number;
  date?: string;
  comment?: string;
}

interface ParsebotData {
  item_id: string;
  title: string;
  first_image_url?: string;
  images?: string[];
  specifications?: Record<string, unknown>;
  description?: { description_text?: string; description_images?: string[] };
  description_text?: string;
  description_images?: string[];
  reviews?: { reviews?: ParsebotReview[] };
}

interface ParsebotResponse {
  status: string;
  data: ParsebotData;
}

export function isParseBotConfigured(): boolean {
  return !!config.parseBotApiKey;
}

export async function fetchProductDetail(itemId: string): Promise<ScrapedProduct> {
  const response = await axios.get<ParsebotResponse>(`${config.parseBotBaseUrl}/get_product_detail`, {
    params: { item_id: itemId },
    headers: { 'X-API-Key': config.parseBotApiKey },
    timeout: 15000,
  });

  if (response.data.status !== 'success') {
    throw new Error('parse.bot returned a non-success status');
  }

  const d = response.data.data;

  const images = Array.from(
    new Set(
      [d.first_image_url, ...(d.images || []), ...(d.description_images || d.description?.description_images || [])].filter(
        (src): src is string => !!src
      )
    )
  ).slice(0, 20);

  const props = Object.entries(d.specifications || {}).map(([name, value]) => ({
    name,
    value: String(value),
  }));

  const descriptionText = d.description_text || d.description?.description_text || '';
  const descriptionParagraphs = descriptionText
    .split(/[。\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 1)
    .slice(0, 40);

  const reviews = (d.reviews?.reviews || [])
    .map((r) => ({
      content: (r.comment || '').trim(),
      author: r.reviewer_name,
      date: r.date,
    }))
    .filter((r) => r.content.length > 0)
    .slice(0, 5);

  return {
    itemId: d.item_id,
    finalUrl: buildItemUrl(d.item_id),
    title: d.title || '',
    images,
    props,
    descriptionParagraphs,
    reviews,
  };
}
