const root = self.registration.scope;
const prefix = 'blogpulse-shell:' + root + ':';
const version = prefix + '1';
const assets = [
  'reader.html', 'library.html', 'reader.html?demo=1', 'library.html?demo=1', 'index.html',
  'reader.js', 'catalog.js', 'library.js', 'station.js', 'notebook.mjs', 'mobile.mjs',
  'station.css', 'notebook.css', 'mobile.css', 'observatory.svg', 'mark.svg',
  'app.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'edition.json'
].map(name => new URL(name, root).href);
const allowed = new Set(assets);

async function appropriate(response, url) {
  if (!response.ok || response.redirected || response.type !== 'basic') return false;
  const type = response.headers.get('content-type') || '';
  const path = new URL(url).pathname;
  if (path.endsWith('.html')) return type.includes('text/html') && (await response.clone().text()).includes('./mark.svg');
  if (path.endsWith('.json')) return type.includes('json') && (await response.clone().json()).version === 1;
  return !type.includes('text/html');
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(version);
    await Promise.all(assets.map(async url => {
      const response = await fetch(url, {cache: 'reload'});
      if (!await appropriate(response, url)) throw Error('Asset unavailable');
      await cache.put(url, response);
    }));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(prefix) && name !== version) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET' || !allowed.has(request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(version);
    let response;
    try { response = await fetch(request); }
    catch (error) {
      const cached = await cache.match(request.url);
      if (cached) return cached;
      throw error;
    }
    if (await appropriate(response, request.url)) {
      try { await cache.put(request.url, response.clone()); } catch {}
    }
    return response;
  })());
});
