import axios from 'axios';
import { Telegraf, Markup } from 'telegraf';
import { InputMediaPhoto } from 'telegraf/typings/core/types/typegram';
import { config } from './config';
import { extractTaobaoUrl } from './taobao/parseUrl';
import { getProductInEnglish, getProductFromArchive, ProductResult } from './pipeline';
import { closeSharedBrowser } from './taobao/scraper';
import { parseArchiveFile } from './taobao/archiveParser';
import { buildInfoMessage, buildReviewsMessage } from './format';

const restartKeyboard = Markup.keyboard([['🔄 Restart']]).resize();

const ARCHIVE_EXTENSIONS = ['.html', '.htm', '.mhtml', '.mht'];

async function sendProduct(ctx: { reply: Function; replyWithMediaGroup: Function }, product: ProductResult) {
  if (product.images.length > 0) {
    const batches: string[][] = [];
    for (let i = 0; i < product.images.length; i += 10) {
      batches.push(product.images.slice(i, i + 10));
    }
    for (let b = 0; b < batches.length; b++) {
      const media: InputMediaPhoto[] = batches[b].map((image, i) => ({
        type: 'photo',
        media: image,
        ...(b === 0 && i === 0 ? { caption: product.title.slice(0, 1024) } : {}),
      }));
      await ctx.replyWithMediaGroup(media);
    }
  }

  await ctx.reply(buildInfoMessage(product), { parse_mode: 'HTML' });

  const reviewsMessage = buildReviewsMessage(product);
  if (reviewsMessage) {
    await ctx.reply(reviewsMessage, { parse_mode: 'HTML' });
  } else {
    await ctx.reply('No reviews could be retrieved for this product.');
  }
}

export function createBot(): Telegraf {
  const bot = new Telegraf(config.telegramBotToken);

  const isOwner = (userId: number | undefined) =>
    config.telegramOwnerId !== null && userId === config.telegramOwnerId;

  bot.start((ctx) =>
    ctx.reply(
      'Send me a Taobao or Tmall product link (or a saved .html/.mhtml page from your own ' +
        'browser - free, no API cost) and I will reply with the photos, an English description, ' +
        'and the latest reviews translated to English.',
      isOwner(ctx.from?.id) ? restartKeyboard : undefined
    )
  );

  bot.hears(['🔄 Restart', '/restart'], async (ctx) => {
    if (!isOwner(ctx.from?.id)) {
      await ctx.reply('Not authorized.');
      return;
    }
    await ctx.reply('Restarting the browser session…');
    await closeSharedBrowser();
    await ctx.reply('Done — the next request will start a fresh browser session.');
  });

  bot.on('document', async (ctx) => {
    const doc = ctx.message.document;
    const filename = doc.file_name || '';
    const isArchive = ARCHIVE_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext));
    if (!isArchive) {
      await ctx.reply('Send a .html or .mhtml page save, or a Taobao/Tmall link as text.');
      return;
    }

    const statusMessage = await ctx.reply('Parsing the saved page…');

    try {
      const fileLink = await ctx.telegram.getFileLink(doc.file_id);
      const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
      const scraped = await parseArchiveFile(Buffer.from(response.data), filename);
      const product = await getProductFromArchive(scraped);
      await sendProduct(ctx, product);
    } catch (error) {
      console.error('Failed to parse uploaded archive:', error);
      await ctx.reply('Could not parse that file - make sure it\'s a saved Taobao/Tmall product page.');
    } finally {
      await ctx.telegram
        .deleteMessage(ctx.chat.id, statusMessage.message_id)
        .catch(() => undefined);
    }
  });

  bot.on('text', async (ctx) => {
    const url = extractTaobaoUrl(ctx.message.text);
    if (!url) {
      await ctx.reply('Send a valid Taobao or Tmall product link.');
      return;
    }

    const statusMessage = await ctx.reply('Fetching product info, this can take a bit…');

    try {
      const product = await getProductInEnglish(url, ctx.message.text);
      await sendProduct(ctx, product);
    } catch (error) {
      console.error('Failed to process product link:', error);
      await ctx.reply(
        'Could not fetch that product. Taobao may be blocking the request — try again in a bit.'
      );
    } finally {
      await ctx.telegram
        .deleteMessage(ctx.chat.id, statusMessage.message_id)
        .catch(() => undefined);
    }
  });

  return bot;
}
