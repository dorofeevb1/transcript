/**
 * Local Whisper STT client.
 *
 * One of N possible `STT` implementations. Posts audio chunks to the FastAPI
 * server at `options.serverUrl` (defaults to 127.0.0.1:8765). Future cloud
 * implementations slot in alongside this one with no use-case change.
 */

import { checkServerHealth, transcribeChunk } from './local-stt';
import type { ExtensionOptions, Segment } from '../../domain/types';
import type { STT } from '../../domain/stt';

/**
 * `STT` implementation backed by the local FastAPI Whisper server.
 *
 * The server is opt-in: the user starts it on `127.0.0.1:8765` (or the URL
 * configured in options). All audio stays on the user's machine.
 */
export class LocalWhisper implements STT {
  readonly id = 'local-whisper';

  /**
   * Ping the server's `/health` endpoint.
   *
   * @param options - User options containing `serverUrl`.
   * @returns `true` when the server responds, `false` otherwise.
   */
  async available(options: ExtensionOptions): Promise<boolean> {
    try {
      await checkServerHealth(options.serverUrl);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Send one audio chunk to the server and return its transcribed segments.
   *
   * @param chunk - Audio blob (typically a short slice of tab-capture output).
   * @param options - User options (`serverUrl`, `sttLanguage`).
   * @param signal - Abort signal for the upload.
   * @returns Segments produced by the Whisper model.
   * @throws Network or server errors are surfaced unchanged.
   */
  async transcribe(
    chunk: Blob,
    options: ExtensionOptions,
    signal: AbortSignal,
  ): Promise<Segment[]> {
    return transcribeChunk(options.serverUrl, chunk, options.sttLanguage, signal);
  }
}

/** Default instance — wire this into use cases until a DI container exists. */
export const localWhisper = new LocalWhisper();
