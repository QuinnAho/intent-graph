// Zustand slice: UI-only state (open editors, panel visibility, dialogs).
// today: the edit config the live server gave the page, which concept's add form
// is open, a new node to select once it arrives, and a counter of live updates.

import { create } from 'zustand';

import { readEditConfig, type EditConfig } from '../transport/edit-api.js';

export const STORE_UI_SLICE_PLACEHOLDER = 'store-ui-slice';

interface UiState {
  readonly editConfig: EditConfig;
  /** concept whose add-intent form is open */
  readonly createParent: string | null;
  /** id of a node just created, selected as soon as a live update brings it */
  readonly pendingSelect: string | null;
  /** bumps on every applied live update, so an open panel can reload */
  readonly graphVersion: number;
  setEditConfig(config: EditConfig): void;
  openCreate(parent: string): void;
  closeCreate(): void;
  setPendingSelect(id: string | null): void;
  bumpGraphVersion(): void;
}

export const useUiStore = create<UiState>((set) => ({
  editConfig: readEditConfig(undefined),
  createParent: null,
  pendingSelect: null,
  graphVersion: 0,
  setEditConfig: (editConfig) => set({ editConfig }),
  openCreate: (parent) => set({ createParent: parent }),
  closeCreate: () => set({ createParent: null }),
  setPendingSelect: (pendingSelect) => set({ pendingSelect }),
  bumpGraphVersion: () => set((s) => ({ graphVersion: s.graphVersion + 1 })),
}));
