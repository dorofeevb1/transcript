/**
 * Wire-level messaging contract between popup ↔ background service worker.
 *
 * Mirrors `docs/ARCHITECTURE.md` §3. The legacy union lives in `lib/types.ts`
 * as `MessageType` — this file is the discriminated, layered shape that new
 * code should reach for. Both can coexist while call sites migrate.
 */

import type { ErrorCode } from '../shared/errors';
import type { Segment } from './types';
import type { PlatformId } from './platform';

export type Lang = string;

export type Request =
  | { type: 'SW_PING' }
  | { type: 'GET_TRANSCRIPT'; tabId: number; platform: PlatformId; videoUrl: string }
  | { type: 'GET_PROGRESS'; jobId: string }
  | { type: 'CANCEL_STT'; jobId: string }
  | { type: 'TRANSLATE'; segments: Segment[]; from: Lang; to: Lang }
  | { type: 'FETCH_REMOTE_TEXT'; url: string }
  | { type: 'RELEASE_TAB_CAPTURE'; tabId: number };

export type Response<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

export type { ErrorCode };
