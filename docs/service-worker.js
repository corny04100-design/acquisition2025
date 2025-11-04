/* 2025 취득세 계산기 - Service Worker (revised) */
const CACHE = 'acqtax-v2-20250916';
const PRECACHE_URLS = [
  './',
  './index.html',
  // HTML과 동일하게 쿼리스트링 포함
  './manifest.webmanifest?v=20250916',
  // HTML과 일치하는 아이콘 버전
  './icon-192-v7.png',
  './icon-512-v7.png'
];

// ----- 설치 -----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ----- 활성화(구 캐시 정리 + Navigation Preload 활성화) -----
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : Promise.resolve(true))));
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
  })());
  self.clients.claim();
});

// ----- 메시지 처리 -----
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// ----- 요청 가로채기 -----
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 동일 오리진만 처리
  if (url.origin !== location.origin) return;

  // 1) 네비게이션 요청(App Shell 전략 + Navigation Preload)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // Navigation Preload 응답 우선 사용
        const preload = await event.preloadResponse;
        if (preload) return preload;

        // 네트워크 성공 시 캐시 갱신
        const net = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, net.clone());
        return net;
      } catch (e) {
        // 오프라인/실패 시 index.html로 폴백
        const cachedShell = await caches.match('./index.html', { ignoreSearch: true });
        if (cachedShell) return cachedShell;
        const root = await caches.match('./', { ignoreSearch: true });
        return root || Response.error();
      }
    })());
    return;
  }

  // 2) 그 외 정적 리소스: stale-while-revalidate + ignoreSearch
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await caches.match(req, { ignoreSearch: true });

    const networkFetch = fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => cached);

    return cached || networkFetch;
  })());
});
