const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../dist');
(async () => {
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const commands = [];
  let fail = false;
  const state = {version:1,running:true,current:'Eir',destination:'',path:[],status:'Eirを認識しました',
    maps:{'New Meadow':{exits:{Eir:{point:[20,250],count:2}},visits:2}},
    destinations:['Eir','Essene','New Meadow'],japanese:{Essene:'エスネ'},preview:'',labels:{npc:[],monster:[]}};
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === '127.0.0.1') {
      if (fail) return route.abort();
      if (request.method() === 'OPTIONS') return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}});
      assert.equal(request.headers().authorization, 'Bearer test-code');
      if (request.method() === 'POST') {
        commands.push([url.pathname, request.postDataJSON()]);
        if (url.pathname === '/destination') { state.destination = request.postDataJSON().name; state.path = ['Eir',state.destination]; }
      }
      return route.fulfill({json:request.method()==='GET'?state:{accepted:true},headers:{'Access-Control-Allow-Origin':'*'}});
    }
    if (url.hostname === 'yysupporttools.github.io') {
      let relative = decodeURIComponent(url.pathname).replace(/^\/xen-rebirth-jp\//,'');
      const file = path.resolve(root, relative);
      if (file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const types = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.zip':'application/zip'};
        return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)] || 'application/octet-stream'});
      }
    }
    // This test exercises the new isolated panel without community database writes.
    return route.fulfill({status:200,body:'',contentType:'application/javascript'});
  });
  await page.goto('https://yysupporttools.github.io/xen-rebirth-jp/capture.html');
  await page.locator('#companion-connect').click();
  assert.match(await page.locator('#companion-status').textContent(), /コード/);
  await page.locator('#companion-code').fill('test-code');
  await page.locator('#companion-connect').click();
  await page.waitForFunction(() => document.querySelector('#companion-current').textContent === 'Eir');
  await page.locator('#companion-destination').fill('エスネ');
  await page.locator('#companion-send').click();
  await page.waitForTimeout(200);
  assert.deepEqual(commands[0], ['/destination',{name:'Essene',transports:false}]);
  await page.locator('#companion-clear').click();
  await page.waitForTimeout(200);
  assert.equal(commands[1][0], '/clear');
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await page.locator('.map-companion').scrollIntoViewIfNeeded();
    assert(await page.locator('.map-companion').evaluate(e => e.scrollWidth <= e.clientWidth));
    await page.locator('.map-companion').screenshot({path:path.resolve(__dirname, `../../../map-companion-${width}.png`)});
  }
  fail = true;
  await page.waitForFunction(() => document.querySelector('#companion-current').textContent === '未接続');
  assert(await page.locator('#companion-send').isDisabled());
  assert(await page.locator('#screen-start').count());
  // Existing capture reports its missing mocked database; no new-panel exceptions allowed.
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: pairing, destination, Japanese search, clear, disconnect, desktop/mobile layout, existing controls');
})().catch(e => {console.error(e); process.exit(1);});
