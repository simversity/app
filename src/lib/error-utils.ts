/** Check if an error is an AbortError (from AbortController.abort()). */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
