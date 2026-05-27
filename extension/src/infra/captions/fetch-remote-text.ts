/** Загрузка субтитров с CDN (okcdn и т.п.) — только из service worker. */
export async function fetchRemoteText(url: string, referer?: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Referer: referer ?? 'https://vk.com/',
      Accept: '*/*',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} при загрузке субтитров`);
  }
  return res.text();
}
