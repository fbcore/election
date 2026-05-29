const cheerio = require('cheerio');
const fs = require('fs');

async function testNewsLive() {
  try {
    const query = '지방선거 조전혁';
    const searchUrl = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const html = await response.text();
    fs.writeFileSync('C:\\Users\\fbcore\\.gemini\\antigravity\\brain\\f6feffa1-ce0a-449f-984f-350132e2d2a5\\scratch\\naver_live.html', html);
    const $ = cheerio.load(html);

    console.log('HTML Length:', html.length);
    console.log('Is blocked or captcha?', html.includes('captcha') || html.includes('unusual traffic') || html.length < 5000);

    const items = $('[data-heatmap-target=".tit"]');
    console.log('items count:', items.length);

    if (items.length > 0) {
      items.each((i, el) => {
        if (i >= 2) return;
        const titleEl = $(el);
        const title = titleEl.text().trim();
        const link = titleEl.attr('href');
        const cardArea = titleEl.closest('[class*="desktop_mode"], div.gvH4i3x6Vuf5y8wHb_DX, div.sds-comps-vertical-layout');
        console.log(`[${i}] cardArea found:`, cardArea.length);
        const descEl = cardArea.find('[data-heatmap-target=".body"]');
        console.log(`[${i}] descEl length:`, descEl.length, 'text:', descEl.text().trim().substring(0, 30));
        const pressEl = cardArea.find('[data-heatmap-target=".prof"]').eq(1);
        console.log(`[${i}] pressEl length:`, pressEl.length, 'text:', pressEl.text().trim());
      });
    }
  } catch (err) {
    console.error(err);
  }
}

testNewsLive();
