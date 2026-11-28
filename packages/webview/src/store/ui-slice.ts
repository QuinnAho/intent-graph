// Zustand slice: UI-only state (open editors, panel visibility, dialogs).
// the edit config the live server gave the page, which concept's add form is open,
// a new node to select once it arrives, a counter of live updates, and direct editing:
// which node's title is a field, the right-click menu, and whether the panel holds unsaved text.

import { create } from 'zustand';

import { readEditConfig, type EditConfig } from '../transport/edit-api.js';

export const STORE_UI_SLICE_PLACEHOLDER = 'store-ui-slice';

/** an open right-click menu. nodeId and kind are null on the empty canvas. */
export interface MenuState {
  readonly x: number;
  readonly y: number;
  readonly nodeId: string | null;
  readonly kind: string | null;
  /** set when the menu is for a wire */
  readonly wireId?: string;
}

export interface NoticeState {
  readonly text: string;
  readonly tone: 'done' | 'refused';
  readonly undo: boolean;
  /** bumps on every notice, so the same text twice still restarts its timer */
  readonly seq: number;
}

interface UiState {
  readonly editConfig: EditConfig;
  /** concept whose add-intent form is open */
  readonly createParent: string | null;
  /** id of a node just created, selected as soon as a live update brings it */
  readonly pendingSelect: string | null;
  /** bumps on every applied live update, so an open panel can reload */
  readonly graphVersion: number;
  /** node whose title is a text field on the canvas */
  readonly renameId: string | null;
  /** titles just saved from the canvas, shown until the live update brings them */
  readonly pendingTitles: Readonly<Record<string, string>>;
  readonly menu: MenuState | null;
  /** the short line after a change or a refused drop. undo shows the Undo button. */
  readonly notice: NoticeState | null;
  /** the wire picked with a click, so Delete knows which one */
  readonly selectedWire: string | null;
  /** node whose panel holds unsaved text */
  readonly panelDirtyId: string | null;
  /** node whose panel should take focus in its title field, once it can */
  readonly panelFocusId: string | null;
  /** the legend beside the canvas, opened from the "?" at the end of the state bar */
  readonly legendOpen: boolean;
  /** folds that are open (lane 12): concept ids, and the root box id. a reload starts with none. */
  readonly unfolded: ReadonlySet<string>;
  /** a move of the view the canvas makes once, so a concept stays put on screen when it folds. seq bumps each time. */
  readonly viewShift: { readonly dx: number; readonly dy: number; readonly seq: number } | null;
  /** intents opened in place to list their code (lane 13). survives live updates, a reload starts with none. */
  readonly nested: ReadonlySet<string>;
  /** a node the canvas brings into view once, seq bumps each time */
  readonly viewFocus: { readonly id: string; readonly seq: number } | null;
  setEditConfig(config: EditConfig): void;
  openCreate(parent: string): void;
  closeCreate(): void;
  setPendingSelect(id: string | null): void;
  bumpGraphVersion(): void;
  setRenameId(id: string | null): void;
  setPendingTitle(id: string, title: string | null): void;
  openMenu(menu: MenuState): void;
  closeMenu(): void;
  showNotice(text: string, tone: NoticeState['tone'], undo: boolean): void;
  clearNotice(): void;
  setSelectedWire(id: string | null): void;
  setPanelDirtyId(id: string | null): void;
  setPanelFocusId(id: string | null): void;
  setLegendOpen(open: boolean): void;
  openFold(key: string): void;
  closeFold(key: string): void;
  shiftView(dx: number, dy: number): void;
  openNest(id: string): void;
  closeNest(id: string): void;
  focusView(id: string): void;
}

export const useUiStore = create<UiState>((set) => ({
  editConfig: readEditConfig(undefined),
  createParent: null,
  pendingSelect: null,
  graphVersion: 0,
  renameId: null,
  pendingTitles: {},
  menu: null,
  panelDirtyId: null,
  panelFocusId: null,
  setEditConfig: (editConfig) => set({ editConfig }),
  openCreate: (parent) => set({ createParent: parent }),
  closeCreate: () => set({ createParent: null }),
  setPendingSelect: (pendingSelect) => set({ pendingSelect }),
  bumpGraphVersion: () => set((s) => ({ graphVersion: s.graphVersion + 1 })),
  setRenameId: (renameId) => set({ renameId }),
  setPendingTitle: (id, title) =>
    set((s) => {
      const next = { ...s.pendingTitles };
      if (title === null) delete next[id];
      else next[id] = title;
      return { pendingTitles: next };
    }),
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set((s) => (s.menu ? { menu: null } : s)),
  notice: null,
  selectedWire: null,
  showNotice: (text, tone, undo) => set((s) => ({ notice: { text, tone, undo, seq: (s.notice?.seq ?? 0) + 1 } })),
  clearNotice: () => set({ notice: null }),
  setSelectedWire: (selectedWire) => set((s) => (s.selectedWire === selectedWire ? s : { selectedWire })),
  setPanelDirtyId: (panelDirtyId) => set((s) => (s.panelDirtyId === panelDirtyId ? s : { panelDirtyId })),
  setPanelFocusId: (panelFocusId) => set({ panelFocusId }),
  legendOpen: false,
  setLegendOpen: (legendOpen) => set((s) => (s.legendOpen === legendOpen ? s : { legendOpen })),
  unfolded: new Set<string>(),
  openFold: (key) => set((s) => (s.unfolded.has(key) ? s : { unfolded: new Set([...s.unfolded, key]) })),
  closeFold: (key) => set((s) => (s.unfolded.has(key) ? { unfolded: new Set([...s.unfolded].filter((k) => k !== key)) } : s)),
  viewShift: null,
  shiftView: (dx, dy) => set((s) => ({ viewShift: { dx, dy, seq: (s.viewShift?.seq ?? 0) + 1 } })),
  nested: new Set<string>(),
  openNest: (id) => set((s) => (s.nested.has(id) ? s : { nested: new Set([...s.nested, id]) })),
  closeNest: (id) => set((s) => (s.nested.has(id) ? { nested: new Set([...s.nested].filter((k) => k !== id)) } : s)),
  viewFocus: null,
  focusView: (id) => set((s) => ({ viewFocus: { id, seq: (s.viewFocus?.seq ?? 0) + 1 } })),
}));
