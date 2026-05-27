import { t } from './i18n';
import type { VideoPlatform } from '../domain/types';

export type { VideoPlatform };

export interface VideoRef {
  platform: VideoPlatform;
  videoId: string;
}

const VK_VIDEO_RE = /video(-?\d+)_(\d+)/i;

export function parseVideoRef(url: string): VideoRef | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id ? { platform: 'youtube', videoId: id } : null;
    }

    if (host.includes('youtube.com')) {
      if (u.pathname === '/watch') {
        const v = u.searchParams.get('v');
        return v ? { platform: 'youtube', videoId: v } : null;
      }
      const shorts = u.pathname.match(/^\/shorts\/([^/?]+)/);
      if (shorts) return { platform: 'youtube', videoId: shorts[1] };
      return null;
    }

    if (host === 'rutube.ru' || host.endsWith('.rutube.ru')) {
      const m =
        u.pathname.match(/\/video\/([0-9a-f-]{32,36})/i) ??
        u.pathname.match(/\/play\/embed\/([0-9a-f-]{32,36})/i) ??
        u.pathname.match(/\/video\/private\/([0-9a-f-]{32,36})/i);
      if (m) return { platform: 'rutube', videoId: m[1] };
      return null;
    }

    if (host === 'vk.com' || host === 'vkvideo.ru' || host.endsWith('.vk.com')) {
      const fromPath = u.pathname.match(VK_VIDEO_RE);
      if (fromPath) {
        return { platform: 'vk', videoId: `${fromPath[1]}_${fromPath[2]}` };
      }
      const z = u.searchParams.get('z');
      if (z) {
        const m = z.match(/video(-?\d+)_(\d+)/i);
        if (m) return { platform: 'vk', videoId: `${m[1]}_${m[2]}` };
      }
      return null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function isVideoPageUrl(url: string): boolean {
  return parseVideoRef(url) != null;
}

export function storageVideoKey(platform: VideoPlatform, videoId: string): string {
  return `${platform}:${videoId}`;
}

export function platformLabel(platform: VideoPlatform): string {
  switch (platform) {
    case 'youtube':
      return 'YouTube';
    case 'rutube':
      return 'Rutube';
    case 'vk':
      return t('platformVk');
  }
}
