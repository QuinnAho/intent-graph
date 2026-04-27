// File-system watcher built on chokidar. Emits events the orchestrator
// converts into reparse + diff jobs. Coalesces rapid saves to keep the
// inner loop responsive.

export const WATCHER_CHOKIDAR_PLACEHOLDER = 'watcher-chokidar';
