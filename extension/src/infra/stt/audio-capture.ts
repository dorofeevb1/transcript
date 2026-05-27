/**
 * Захват аудио выполняется в offscreen-документе (src/offscreen/offscreen.ts),
 * т.к. service worker не поддерживает MediaRecorder.
 */
export const AUDIO_CAPTURE_OFFSCREEN = true;
