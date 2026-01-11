
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function takeScreenshots() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const outputDir = path.join(process.cwd(), 'public', 'screenshots');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const screenshots = [
    { name: 'dashboard', url: 'http://localhost:3000/?mode=screenshot' },
    { name: 'stock', url: 'http://localhost:3000/stock?mode=screenshot' },
    { name: 'expenses', url: 'http://localhost:3000/expenses?mode=screenshot' },
    { name: 'vat', url: 'http://localhost:3000/vat?mode=screenshot' }
  ];

  try {
    for (const shot of screenshots) {
        console.log(`Navigating to ${shot.name}...`);
        try {
            await page.goto(shot.url, { waitUntil: 'networkidle0', timeout: 60000 });
            // Wait for nav to ensure app loaded
            await page.waitForSelector('nav', { timeout: 15000 });
            // Wait for data to render
            await new Promise(r => setTimeout(r, 2000));

            await page.screenshot({ path: path.join(outputDir, `${shot.name}.png`) });
            console.log(`${shot.name} captured.`);
        } catch (e) {
            console.error(`Failed to capture ${shot.name}:`, e);
        }
    }
  } catch (error) {
    console.error('Global error:', error);
  } finally {
    await browser.close();
  }
}

takeScreenshots();
