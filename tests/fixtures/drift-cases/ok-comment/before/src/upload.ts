export const MAX_ATTEMPTS = 3;

export async function uploadWithRetry(send: () => Promise<void>): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await send();
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`upload failed after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`);
}
