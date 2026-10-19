export const FLOATING_POSITION_KEY = 'floating-button-position-v1';

export function normalizeFloatingPosition(value) {
  if (!value || !['x', 'y'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 1)) return null;
  return { x: value.x, y: value.y };
}

export function bindFloatingButton(button, { position: initial, save, onMove = () => {} }) {
  const view = button.ownerDocument.defaultView, gap = 8;
  let position = normalizeFloatingPosition(initial), gesture, suppressClick = false;
  const area = () => {
    const style = view.getComputedStyle(button);
    return { x: Math.max(0, view.innerWidth - parseFloat(style.width) - gap * 2), y: Math.max(0, view.innerHeight - parseFloat(style.height) - gap * 2) };
  };
  function apply() {
    if (position) {
      const available = area();
      button.style.right = 'auto';
      button.style.left = `${gap + available.x * position.x}px`;
      button.style.top = `${gap + available.y * position.y}px`;
    } else {
      for (const property of ['left', 'right', 'top']) button.style.removeProperty(property);
    }
    onMove();
  }
  function move(left, top) {
    const available = area();
    position = { x: available.x ? Math.min(1, Math.max(0, (left - gap) / available.x)) : 0,
      y: available.y ? Math.min(1, Math.max(0, (top - gap) / available.y)) : 0 };
    apply();
  }
  function finish(event, cancelled = false) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const previous = gesture;
    gesture = undefined; button.removeAttribute('data-dragging');
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    if (!previous.moved) return;
    suppressClick = true;
    if (cancelled) { position = previous.position; apply(); }
    else save({ ...position });
  }
  button.addEventListener('pointerdown', event => {
    if (!event.isTrusted || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    suppressClick = false;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, left: button.offsetLeft, top: button.offsetTop, position, moved: false };
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', event => {
    if (!event.isTrusted || !gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
    gesture.moved = true; button.setAttribute('data-dragging', '');
    move(gesture.left + dx, gesture.top + dy);
  });
  button.addEventListener('pointerup', event => finish(event));
  button.addEventListener('pointercancel', event => finish(event, true));
  button.addEventListener('lostpointercapture', event => finish(event, true));
  button.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false; event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  button.addEventListener('keydown', event => {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!event.isTrusted || !direction) return;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 32 : 8;
    move(button.offsetLeft + direction[0] * step, button.offsetTop + direction[1] * step);
  });
  button.addEventListener('keyup', event => {
    if (event.isTrusted && event.key.startsWith('Arrow') && position) save({ ...position });
  });
  view.addEventListener('resize', apply);
  apply();
}
