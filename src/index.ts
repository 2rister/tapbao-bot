import { createBot } from './bot';
import { closeSharedBrowser } from './taobao/scraper';

const bot = createBot();

bot.launch().then(() => {
  console.log('tapbao-bot is running');
});

async function shutdown(signal: string) {
  bot.stop(signal);
  await closeSharedBrowser();
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
