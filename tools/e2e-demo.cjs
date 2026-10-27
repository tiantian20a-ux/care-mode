// 用 Playwright 在演示模式下走一遍完整流程（设置 → 下载备份 → 执行 → 还原）。
// 用法：npm run build && npx vite preview --port 4173，然后 node tools/e2e-demo.cjs <截图目录>
const { chromium } = require('playwright');
(async () => {
  const S = process.argv[2];
  const b = await chromium.launch();
  const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1000, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await p.goto('http://localhost:4173/?demo');
  await p.screenshot({ path: S + '/1-home.png', fullPage: true });
  await p.click('#start');
  await p.click('#connect');
  await p.waitForSelector('#go', { timeout: 20000 });
  await p.screenshot({ path: S + '/2-review.png', fullPage: true });
  // consent missing → message
  await p.check('#r-quick-apps');
  await p.click('#go');
  console.log('consent msg:', await p.textContent('#status'));
  await p.check('input[data-consent="quick-apps"]');
  const dl = p.waitForEvent('download');
  await p.click('#go');
  const d = await dl;
  await d.saveAs(S + '/backup.json');
  console.log('download:', d.suggestedFilename());
  await p.waitForSelector('#saved');
  await p.screenshot({ path: S + '/3-confirm.png', fullPage: true });
  await p.check('#saved');
  await p.click('#run');
  await p.waitForSelector('text=设置完成', { timeout: 120000 });
  await p.screenshot({ path: S + '/4-done.png', fullPage: true });
  console.log(await p.textContent('.result-list'));
  // restore flow
  await p.click('#home');
  await p.click('#restore');
  await p.setInputFiles('#file', S + '/backup.json');
  await p.waitForSelector('text=确认还原');
  await p.click('#go');
  await p.waitForSelector('text=全部还原完成', { timeout: 120000 });
  await p.screenshot({ path: S + '/5-restored.png', fullPage: true });
  // mobile width check
  const m = await b.newPage({ viewport: { width: 375, height: 800 } });
  await m.goto('http://localhost:4173/');
  const sw = await m.evaluate(() => document.documentElement.scrollWidth);
  console.log('mobile scrollWidth', sw);
  await m.screenshot({ path: S + '/6-mobile.png' });
  console.log('errors:', errors);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
