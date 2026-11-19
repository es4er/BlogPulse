import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdtemp, readFile, realpath, rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {basename, dirname, join} from 'node:path';
import test from 'node:test';
import {setTimeout as pause} from 'node:timers/promises';

const chrome = process.env.BLOGPULSE_CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'
].find(existsSync);
const assets = new URL('./project_page/dist/', import.meta.url);
const types = {html:'text/html', css:'text/css', js:'text/javascript', mjs:'text/javascript',
  json:'application/json', webmanifest:'application/manifest+json', png:'image/png', svg:'image/svg+xml'};

test('phone: install metadata, filter, collect, cold offline navigation and editing', {skip: !chrome, timeout: 45000}, async context => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (!/^\/[\w.-]+$/.test(path)) { response.writeHead(404).end(); return; }
    try {
      const bytes = await readFile(new URL(path.slice(1), assets));
      response.writeHead(200, {'Content-Type': types[path.split('.').at(-1)]}).end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const stop = () => { server.closeAllConnections(); server.close(); };
  context.after(() => { if (server.listening) stop(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const temporaryRoot = await realpath(tmpdir());
  const profile = await mkdtemp(join(temporaryRoot, 'blogpulse-phone-qa-'));
  const proc = spawn(chrome, ['--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-pipe', '--user-data-dir=' + profile], {
    stdio: ['ignore','ignore','ignore','pipe','pipe'], windowsHide:true
  });
  const exited = new Promise(resolve => proc.once('exit', resolve));
  context.after(async () => {
    proc.kill();
    await exited;
    const target = await realpath(profile);
    assert.equal(dirname(target), temporaryRoot);
    assert.ok(basename(target).startsWith('blogpulse-phone-qa-'));
    await rm(target, {recursive:true, force:true, maxRetries:8, retryDelay:100});
  });
  const pending = new Map();
  let counter = 0, buffer = '', session;
  proc.stdio[4].setEncoding('utf8').on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\0')) >= 0) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    }
  });
  async function call(method, params = {}) {
    const id = ++counter;
    const reply = await new Promise(resolve => {
      pending.set(id, resolve);
      proc.stdio[3].write(JSON.stringify({id, method, params, sessionId:session}) + '\0');
    });
    assert.equal(reply.error, undefined, JSON.stringify(reply.error));
    return reply.result;
  }
  async function evaluate(expression) {
    const reply = await call('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true});
    assert.ok(!reply.exceptionDetails, reply.exceptionDetails?.exception?.description);
    return reply.result.value;
  }
  async function until(expression) {
    for (let attempt=0; attempt<75; attempt++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    assert.fail('Timed out: ' + expression);
  }
  const target = await call('Target.createTarget', {url:'about:blank'});
  session = (await call('Target.attachToTarget', {targetId:target.targetId, flatten:true})).sessionId;
  await call('Emulation.setDeviceMetricsOverride', {width:390, height:844, deviceScaleFactor:1, mobile:true});
  await call('Page.navigate', {url:base + '/reader.html'});
  await until("document.querySelectorAll('#phone-source option').length===11 && navigator.serviceWorker.controller");
  assert.equal(await evaluate('document.documentElement.scrollWidth'), 390);
  assert.equal(await evaluate("document.querySelector('.mobile-rail').getBoundingClientRect().bottom"), 844);
  const manifest = await call('Page.getAppManifest');
  assert.deepEqual(manifest.errors, []);
  assert.equal(JSON.parse(manifest.data).display, 'standalone');
  await evaluate("const pick=document.querySelector('#phone-source');pick.value='tml';pick.dispatchEvent(new Event('change'))");
  await until("document.querySelector('#selection')?.textContent.includes('Thinking Machines')");
  await evaluate("document.querySelector('.collect').click()");
  await until("document.querySelector('.collect').textContent.includes('已收录')");
  await call('Network.enable');
  await call('Network.clearBrowserCache');
  stop();
  await call('Page.navigate', {url:base + '/library.html'});
  await until("document.querySelectorAll('.knowledge-card').length===1");
  await evaluate("document.querySelector('.knowledge-card h3 button').click();document.querySelector('#note').value='离线阅读笔记';document.querySelector('#save').click()");
  await until("document.querySelector('.preview-note')?.textContent==='离线阅读笔记'");
  await call('Page.navigate', {url:base + '/reader.html'});
  await until("document.querySelectorAll('#list article').length===18 && document.querySelector('#badge')?.textContent.includes('POCKET')");
  assert.ok(await evaluate('caches.keys().then(keys => keys.length > 0)'));
});
