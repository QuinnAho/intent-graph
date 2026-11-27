// after a drop the pointer rests over a title, and the rename hint on hover would look like
// an input field there. the hint stays off until the pointer moves again.

const CLASS = 'ig-after-drop';

export function calmHoverUntilMove(): void {
  document.body.classList.add(CLASS);
  const off = (): void => {
    document.body.classList.remove(CLASS);
    window.removeEventListener('pointermove', off, true);
  };
  window.addEventListener('pointermove', off, true);
}
