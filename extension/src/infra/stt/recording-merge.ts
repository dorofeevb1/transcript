/** Чанки по ~75 с для Whisper (без Chrome API). */
export function mergeBlobsIntoChunks(blobs: Blob[], chunkDurationSec: number): Blob[] {
  if (blobs.length === 0) return [];
  const merged = new Blob(blobs, { type: blobs[0].type || 'audio/webm' });
  const chunkBytes = chunkDurationSec * 16000;
  if (merged.size <= chunkBytes * 1.5) return [merged];

  const out: Blob[] = [];
  let offset = 0;
  while (offset < merged.size) {
    const end = Math.min(offset + chunkBytes, merged.size);
    out.push(merged.slice(offset, end));
    offset = end;
  }
  return out.length > 0 ? out : [merged];
}
