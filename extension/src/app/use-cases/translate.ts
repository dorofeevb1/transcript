/**
 * `translate` — translate a transcript to a target language.
 *
 * Thin wrapper around `lib/translate.translateTranscript` that adds explicit
 * AbortController plumbing. The underlying translator does network IO over
 * Google Translate or the optional Whisper server; cancellation is observed
 * between batches by checking `signal.aborted`.
 */

import { translateTranscript } from '../../infra/translate/translate';
import type { TranslateFetchOptions, TranslateProgressFn } from '../../infra/translate/texts';
import type { ExtensionOptions, TranscriptResult } from '../../domain/types';

/**
 * Input for the `translate` use case.
 *
 * @property result - The transcript to translate.
 * @property targetLang - BCP-47 target language code. Empty string returns
 *   the original.
 * @property options - User options (chosen engine, server URL, etc).
 * @property signal - Abort signal owned by the caller.
 * @property onProgress - Optional progress callback fired between batches.
 * @property fetchOpts - Optional fetch overrides (e.g. tab-context fetch).
 */
export interface TranslateInput {
  result: TranscriptResult;
  targetLang: string;
  options: ExtensionOptions;
  signal: AbortSignal;
  onProgress?: TranslateProgressFn;
  fetchOpts?: TranslateFetchOptions;
}

/**
 * Translate a transcript to `targetLang`.
 *
 * Translation runs in minute-sized batches via the configured engine (Argos
 * on the local server, or Google Translate). Cancellation is observed between
 * batches.
 *
 * @param input - Transcript, target language, options, abort signal.
 * @returns A new `TranscriptResult` with translated segments.
 * @throws `CANCELLED` when `signal` fires before or during the batches.
 * @throws `TRANSLATE_FAILED` when the engine returns an error.
 */
export async function translate(input: TranslateInput): Promise<TranscriptResult> {
  if (input.signal.aborted) throw new Error('CANCELLED');

  const wrappedProgress: TranslateProgressFn | undefined = input.onProgress
    ? (done, total) => {
        if (input.signal.aborted) throw new Error('CANCELLED');
        input.onProgress!(done, total);
      }
    : undefined;

  // The underlying translator does not yet take an AbortSignal directly; we
  // observe abort between progress ticks and from the caller before/after.
  const out = await translateTranscript(
    input.result,
    input.targetLang,
    input.options,
    wrappedProgress,
    input.fetchOpts,
  );

  if (input.signal.aborted) throw new Error('CANCELLED');
  return out;
}
