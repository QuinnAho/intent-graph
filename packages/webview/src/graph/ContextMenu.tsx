// the right-click menu. opens at the pointer (or at the selected node for the menu key),
// stays inside the window, takes the arrow keys, Enter and Esc, and closes on a click
// elsewhere or when the view moves. disabled entries say why.

import { useReactFlow, type FitViewOptions } from '@xyflow/react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { addIntentTo, focusNode, openDetails, renameNode } from '../app/direct-edit-actions.js';
import { clampMenu, menuItems, stepMenu, type MenuItem } from '../app/direct-edit-model.js';
import { MENU_TUNING } from '../app/direct-edit-tuning.js';
import { useUiStore } from '../store/ui-slice.js';

const BOX: CSSProperties = {
  position: 'fixed',
  zIndex: 50,
  width: `${MENU_TUNING.width}px`,
  boxSizing: 'border-box',
  padding: `${MENU_TUNING.padding}px`,
  background: 'var(--ig-node)',
  border: '1px solid var(--ig-edge)',
  borderRadius: '10px',
  boxShadow: '0 10px 24px rgba(0, 0, 0, 0.45)',
  color: 'var(--ig-text)',
  fontSize: '13px',
  outline: 'none',
};

const ITEM: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: `${MENU_TUNING.itemHeight}px`,
  padding: '0 10px',
  border: 'none',
  borderRadius: '6px',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

const NOTE: CSSProperties = { padding: '6px 10px 4px', fontSize: '11px', lineHeight: 1.4, opacity: 0.75 };

export function ContextMenu(props: { fitViewOptions: FitViewOptions }): JSX.Element | null {
  const menu = useUiStore((s) => s.menu);
  const config = useUiStore((s) => s.editConfig);
  const closeMenu = useUiStore((s) => s.closeMenu);
  const rf = useReactFlow();
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const items: MenuItem[] = menu ? menuItems(menu.kind, { write: config.write, reason: config.readOnlyReason }) : [];
  const nodeId = menu?.nodeId ?? null;

  // measure, then place inside the window before the first paint
  useLayoutEffect(() => {
    if (!menu || !box.current) {
      setAt(null);
      return;
    }
    const r = box.current.getBoundingClientRect();
    setAt(clampMenu({ x: menu.x, y: menu.y }, { width: r.width, height: r.height }, { width: window.innerWidth, height: window.innerHeight }));
    setActive(Math.max(0, items.findIndex((i) => !i.disabled)));

    // the menu is placed once per opening
  }, [menu]);

  // focus once the box is visible, a hidden element cannot take it
  useEffect(() => {
    if (at) box.current?.focus({ preventScroll: true });
  }, [at]);

  // a press outside closes it. a press that starts a view move closes it through the canvas.
  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (e: PointerEvent): void => {
      if (e.target instanceof Element && e.target.closest('[data-context-menu]')) return;
      closeMenu();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [menu, closeMenu]);

  if (!menu || items.length === 0) return null;

  const pick = (item: MenuItem): void => {
    if (item.disabled) return;
    closeMenu();
    if (item.id === 'fit-view') void rf.fitView(props.fitViewOptions);
    else if (nodeId === null) return;
    else if (item.id === 'rename') renameNode(nodeId);
    else if (item.id === 'edit-details') openDetails(nodeId);
    else addIntentTo(nodeId);
  };

  const onKeyDown = (e: ReactKeyboardEvent): void => {
    const own = (): void => {
      e.preventDefault();
      e.nativeEvent.stopPropagation();
    };
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      own();
      const next = stepMenu(items, active, e.key === 'ArrowDown' ? 1 : -1);
      if (next !== null) setActive(next);
    } else if (e.key === 'Enter' || e.key === ' ') {
      own();
      pick(items[active]!);
    } else if (e.key === 'Escape') {
      own();
      closeMenu();
      focusNode(nodeId);
    } else if (e.key === 'Tab') {
      own();
      closeMenu();
      focusNode(nodeId);
    }
  };

  const disabledReason = items.find((i) => i.disabled)?.reason ?? null;

  return (
    <div
      ref={box}
      role="menu"
      tabIndex={-1}
      data-context-menu={menu.kind ?? 'pane'}
      aria-label={menu.kind ? `${menu.kind} menu` : 'canvas menu'}
      aria-activedescendant={`ig-menu-${items[active]?.id ?? ''}`}
      style={{ ...BOX, left: at?.x ?? menu.x, top: at?.y ?? menu.y, visibility: at ? 'visible' : 'hidden' }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        <button
          key={item.id}
          id={`ig-menu-${item.id}`}
          type="button"
          role="menuitem"
          tabIndex={-1}
          data-menu-item={item.id}
          aria-disabled={item.disabled}
          title={item.reason ?? undefined}
          style={{
            ...ITEM,
            opacity: item.disabled ? 0.45 : 1,
            cursor: item.disabled ? 'not-allowed' : 'pointer',
            background: i === active ? 'rgba(120, 169, 255, 0.18)' : 'transparent',
            boxShadow: i === active ? 'inset 0 0 0 1px rgba(120, 169, 255, 0.8)' : 'none',
          }}
          onMouseEnter={() => setActive(i)}
          onClick={() => pick(item)}
        >
          {item.label}
        </button>
      ))}
      {disabledReason ? (
        <div style={NOTE} data-menu-reason="">
          {disabledReason}
        </div>
      ) : null}
    </div>
  );
}
