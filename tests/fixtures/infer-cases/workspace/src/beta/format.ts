/* Turns a duration in seconds into short text. */
export function shortDuration(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
}
