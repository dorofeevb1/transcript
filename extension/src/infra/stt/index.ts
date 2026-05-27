import type { STT } from '../../domain/stt';
import { localWhisper } from './whisper-client';

/**
 * Available STT implementations. First-available wins. Add cloud providers by
 * pushing them after `localWhisper`.
 */
export const sttProviders: STT[] = [localWhisper];

export { localWhisper, LocalWhisper } from './whisper-client';
