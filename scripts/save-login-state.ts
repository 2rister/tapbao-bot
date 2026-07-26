/**
 * Run once, locally, with a visible browser, to log into Taobao manually
 * (scan the QR code with the Taobao app). This opens the same persistent
 * Chromium profile the bot itself uses, so once you log in here the bot
 * picks up the session automatically on its next scrape - no file to copy.
 *
 * Usage: npx ts-node scripts/save-login-state.ts
 */
import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const profileDir = path.resolve(process.env.TAOBAO_PROFILE_DIR || './storage/taobao-profile');

  const context = await chromium.launchPersistentContext(profileDir, { headless: false });
  const page = await context.newPage();

  await page.goto('https://login.taobao.com/');
  console.log('Log in (scan the QR code in the Taobao app), then press Enter here…');

  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  console.log(`Login session saved to ${profileDir}`);
  await context.close();
  process.exit(0);
}

main();
