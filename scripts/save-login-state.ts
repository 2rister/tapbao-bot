/**
 * Run once, locally, with a visible browser, to log into Taobao manually
 * (scan the QR code with the Taobao app) and save the resulting cookies so
 * the bot can reuse them. Logged-in requests are far less likely to be
 * blocked and are usually required to see the reviews list.
 *
 * Usage: npx ts-node scripts/save-login-state.ts
 */
import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://login.taobao.com/');
  console.log('Log in (scan the QR code in the Taobao app), then press Enter here…');

  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  const outPath = path.resolve('./storage/taobao-state.json');
  await context.storageState({ path: outPath });
  console.log(`Saved login state to ${outPath}`);

  await browser.close();
  process.exit(0);
}

main();
