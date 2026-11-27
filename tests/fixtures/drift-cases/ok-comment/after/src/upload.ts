export const MAX_ATTEMPTS = 3;

/**
 * Sends with retries. Gives up after MAX_ATTEMPTS and rethrows.
 */
export async function uploadWithRetry(send: () => Promise<void>): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await send();
      return;
    } catch (err) {
      // keep the last error for the final message
      lastError = err;
    }
  }
  throw new Error(`upload failed after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`);
}
