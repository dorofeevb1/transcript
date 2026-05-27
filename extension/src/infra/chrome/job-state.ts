import type { ProgressState, StoredJob } from '../../domain/types';

const JOB_KEY = 'uiJob';

export function idleJob(): StoredJob {
  return {
    active: false,
    kind: 'idle',
    processedSec: 0,
    totalSec: 0,
    phase: '',
  };
}

export async function loadJob(): Promise<StoredJob> {
  const data = await chrome.storage.local.get(JOB_KEY);
  const job = data[JOB_KEY] as StoredJob | undefined;
  return job ?? idleJob();
}

export async function persistJob(job: StoredJob): Promise<void> {
  await chrome.storage.local.set({ [JOB_KEY]: job });
}

export async function clearJob(): Promise<void> {
  await persistJob(idleJob());
}

export function jobToProgress(job: StoredJob): ProgressState {
  return {
    active: job.active,
    processedSec: job.processedSec,
    totalSec: job.totalSec,
    phase: job.phase,
  };
}
