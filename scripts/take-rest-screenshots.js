
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

async function takeScreenshots() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Capture console logs
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  await page.setViewport({ width: 1280, height: 800 });

  const outputDir = path.join(process.cwd(), 'public', 'screenshots');

  try {
    // 3. Expenses
    console.log('Navigating to Expenses...');
    await page.goto('http://localhost:3000/expenses?mode=screenshot', { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('nav', { timeout: 10000 });
    // Give it a moment to render charts/tables
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(outputDir, 'expenses.png') });
    console.log('Expenses captured.');

    // 4. VAT
    console.log('Navigating to VAT...');
    await page.goto('http://localhost:3000/vat?mode=screenshot', { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('nav', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(outputDir, 'vat.png') });
    console.log('VAT captured.');

  } catch (error) {
    console.error('Error taking screenshots:', error);
  } finally {
    await browser.close();
  }
}

takeScreenshots();
