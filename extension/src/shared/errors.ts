/**
 * Cross-boundary error contract.
 *
 * Use-cases throw `AppError`; the messaging layer maps it onto the wire shape
 * `{ ok: false, error: { code, message } }`. Popup never inspects raw strings —
 * it switches on `ErrorCode`.
 */

export type ErrorCode =
  | 'NO_CAPTIONS'
  | 'PLATFORM_UNSUPPORTED'
  | 'TRANSLATE_FAILED'
  | 'STT_UNAVAILABLE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
