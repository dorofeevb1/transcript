import type { Platform, PlatformId } from '../../domain/platform';
import { rutubePlatform } from './rutube';
import { vkPlatform } from './vk';
import { youtubePlatform } from './youtube';

/**
 * Registered platform adapters. Ordering controls `findPlatformByUrl`
 * tie-breaks; currently each adapter claims a disjoint host set.
 */
export const platforms: Platform[] = [youtubePlatform, rutubePlatform, vkPlatform];

const byId = new Map<PlatformId, Platform>(platforms.map((p) => [p.id, p]));

/**
 * Look up a `Platform` adapter by its stable ID.
 *
 * @param id - One of `'youtube' | 'rutube' | 'vk'`.
 * @returns The matching adapter.
 * @throws `UNKNOWN_PLATFORM:<id>` when `id` is not registered.
 */
export function getPlatform(id: PlatformId): Platform {
  const p = byId.get(id);
  if (!p) throw new Error(`UNKNOWN_PLATFORM:${id}`);
  return p;
}

/**
 * Find the platform adapter whose host pattern matches `url`.
 *
 * @param url - Parsed page URL.
 * @returns The first matching adapter, or `null` if none claim the host.
 */
export function findPlatformByUrl(url: URL): Platform | null {
  return platforms.find((p) => p.matches(url)) ?? null;
}
