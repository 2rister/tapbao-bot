import { Telegraf, Markup } from 'telegraf';
import { InputMediaPhoto } from 'telegraf/typings/core/types/typegram';
import { config } from './config';
import { extractTaobaoUrl } from './taobao/parseUrl';
import { getProductInEnglish } from './pipeline';
import { closeSharedBrowser } from './taobao/scraper';
import { buildInfoMessage, buildReviewsMessage } from './format';

const restartKeyboard = Markup.keyboard([['🔄 Restart']]).resize();

export function createBot(): Telegraf {
  const bot = new Telegraf(config.telegramBotToken);

  const isOwner = (userId: number | undefined) =>
    config.telegramOwnerId !== null && userId === config.telegramOwnerId;

  bot.start((ctx) =>
    ctx.reply(
      'Send me a Taobao or Tmall product link and I will reply with the photos, ' +
        'an English description, and the 5 latest reviews translated to English.',
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

  bot.on('text', async (ctx) => {
    const url = extractTaobaoUrl(ctx.message.text);
    if (!url) {
      await ctx.reply('Send a valid Taobao or Tmall product link.');
      return;
    }

    const statusMessage = await ctx.reply('Fetching product info, this can take a bit…');

    try {
      const product = await getProductInEnglish(url);

      if (product.images.length > 0) {
        const media: InputMediaPhoto[] = product.images.map((image, i) => ({
          type: 'photo',
          media: image,
          ...(i === 0 ? { caption: product.title.slice(0, 1024) } : {}),
        }));
        await ctx.replyWithMediaGroup(media);
      }

      await ctx.reply(buildInfoMessage(product), { parse_mode: 'HTML' });

      const reviewsMessage = buildReviewsMessage(product);
      if (reviewsMessage) {
        await ctx.reply(reviewsMessage, { parse_mode: 'HTML' });
      } else {
        await ctx.reply('No reviews could be retrieved for this product.');
      }
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
