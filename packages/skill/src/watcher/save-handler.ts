// onDidSave handler entry point. Routes a saved-file event into the backward-
// sync pipeline (reparse → 4-tier diff → drift events on affected intent
// nodes). The extension forwards VS Code's onDidSaveTextDocument to here over
// MCP; the watcher forwards external edits to the same surface.

export const WATCHER_SAVE_HANDLER_PLACEHOLDER = 'save-handler';
