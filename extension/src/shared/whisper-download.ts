/**
 * Single source of truth for the "where do users download the local Whisper server"
 * link. Used by popup status lines, options page hint, and error messages.
 *
 * Releases are produced by `.github/workflows/release-whisper.yml` on tag pushes.
 * The `/releases/latest` URL resolves to the most recent published release.
 */
export const WHISPER_SERVER_DOWNLOAD_URL =
  'https://github.com/dorofeevb1/transcript/releases/latest';

/** Append the download URL to an error message in a non-localized way. */
export function withDownloadLink(message: string): string {
  return `${message} ${WHISPER_SERVER_DOWNLOAD_URL}`;
}
