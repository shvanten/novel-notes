/* 通用笔记 · 静态缓存（离线可用）。改版后请把版本号 +1 强制更新。 */
const CACHE = 'chaowen-v24';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/app.js',
  'js/sync.js',
  'js/notes.js',
  'data/rank.json',
  'data/rank-history.json',
  'assets/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isData = url.pathname.indexOf('/data/') >= 0;   // 榜单/历史等动态数据
  if (isData) {
    // 数据走 network-first：在线永远取最新（清单/每日文件会随归档更新），
    // 离线时回退到已缓存副本，保证可用。
    e.respondWith(
      fetch(e.request).then((resp) => {
        const cp = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, cp)).catch(() => {});
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // 其余静态资源维持 cache-first
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const net = fetch(e.request).then((resp) => {
        const cp = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, cp)).catch(() => {});
        return resp;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
