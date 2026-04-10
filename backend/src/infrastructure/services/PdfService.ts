import puppeteer, { type Browser } from 'puppeteer';

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) return browserInstance;
  browserInstance = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });
  return browserInstance;
}

/**
 * Generates a PDF buffer from an HTML string.
 * Uses A4 format with print-friendly styling.
 */
export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/** Close the shared browser instance (call on shutdown). */
export async function closePdfBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
