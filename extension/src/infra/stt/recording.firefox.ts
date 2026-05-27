import { mergeBlobsIntoChunks } from './recording-merge';

export { mergeBlobsIntoChunks };

export async function releaseTabCapture(): Promise<void> {}

export async function waitForOffscreenReady(): Promise<void> {
  throw new Error('STT_UNAVAILABLE');
}

export function stopTabRecording(): void {}

export function recordTabAudio(): Promise<Blob[]> {
  return Promise.reject(new Error('STT_UNAVAILABLE'));
}
