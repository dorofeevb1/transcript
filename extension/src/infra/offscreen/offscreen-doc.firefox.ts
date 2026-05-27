/** Заглушки для Firefox-сборки (без offscreen API в бандле). */
export async function ensureOffscreen(): Promise<void> {}

export async function closeOffscreen(): Promise<void> {}

export async function releaseOffscreenCapture(): Promise<void> {}
