
import puppeteer from 'puppeteer';
import path from 'path';

async function takeLandingScreenshot() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 3000 }); // Tall viewport to capture full page

  try {
    console.log('Navigating to Landing Page...');
    // No mode=screenshot, so it defaults to landing
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });

    // Wait for images to load? They are local, so should be fast.
    await new Promise(r => setTimeout(r, 2000));

    await page.screenshot({ path: path.join(process.cwd(), 'public', 'screenshots', 'landing_full.png') });
    console.log('Landing page screenshot captured.');
  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}

takeLandingScreenshot();
