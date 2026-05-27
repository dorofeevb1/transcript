import type { ExtensionOptions, Segment } from './types';

/**
 * STT adapter contract.
 *
 * `LocalWhisper` is the first concrete implementation (posts to
 * 127.0.0.1:8765/transcribe). Future cloud implementations slot in here with
 * no change to the calling use case.
 */
export interface STT {
  readonly id: string;
  /** Cheap availability probe. Should swallow network errors and return `false`. */
  available(options: ExtensionOptions): Promise<boolean>;
  /**
   * Transcribe one audio chunk. Implementations are expected to be chunk-aware:
   * the caller passes chunks of recording and stitches the result.
   */
  transcribe(
    chunk: Blob,
    options: ExtensionOptions,
    signal: AbortSignal,
  ): Promise<Segment[]>;
}
