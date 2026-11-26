const MIN_WIDTH = 28;
const MAX_WIDTH = 2048;
const controllers = new WeakMap();

function clampWidth(value) {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(value)));
}

function readWidths(view, key, columns) {
  try {
    const saved = JSON.parse(view.localStorage.getItem(key));
    return Object.fromEntries(columns.filter(({ id }) => Number.isFinite(saved?.[id]))
      .map(({ id }) => [id, clampWidth(saved[id])]));
  } catch { return {}; }
}

function createController(table) {
  const view = table.ownerDocument.defaultView;
  const scroller = table.parentElement;
  let columns = [];
  let widths = {};
  let storageKey = '';
  let drag = null;
  let containerWidth = -1;

  function persist() {
    try {
      if (Object.keys(widths).length) view.localStorage.setItem(storageKey, JSON.stringify(widths));
      else view.localStorage.removeItem(storageKey);
    } catch { /* The table still resizes when local storage is unavailable. */ }
  }

  function layout() {
    const customized = columns.some(column => column.natural > 0 && Object.hasOwn(widths, column.id));
    let total = 0;
    for (const column of columns) {
      const visible = column.natural > 0;
      const size = widths[column.id] ?? column.natural;
      if (visible) total += size;
      column.header.style.width = customized && visible ? `${size}px` : '';
      column.handle.setAttribute('aria-valuenow', String(Math.round(size)));
      column.handle.setAttribute('aria-valuetext', `${Math.round(size)} пикс.`);
    }
    table.toggleAttribute('data-custom-widths', customized);
    table.style.width = customized ? `${total}px` : '';
  }

  // Read the original CSS layout at each viewport width. Hidden columns take
  // no space, and untouched columns continue to follow the responsive design.
  function measure() {
    table.removeAttribute('data-custom-widths');
    table.style.width = '';
    for (const column of columns) column.header.style.width = '';
    for (const column of columns) column.natural = column.header.getBoundingClientRect().width;
    containerWidth = scroller.clientWidth;
    layout();
  }

  function setWidth(column, size) {
    widths[column.id] = clampWidth(size);
    layout();
  }

  function resetWidth(column) {
    delete widths[column.id];
    measure();
    persist();
  }

  function installHandle(column) {
    const { header, label } = column;
    const handle = header.ownerDocument.createElement('span');
    column.handle = handle;
    handle.className = 'column-resize-handle';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', `Ширина столбца «${label}»`);
    handle.setAttribute('aria-valuemin', String(MIN_WIDTH));
    handle.setAttribute('aria-valuemax', String(MAX_WIDTH));
    handle.title = `Ширина столбца «${label}». Перетащите границу или нажмите ←/→. Двойной щелчок или Home сбрасывает ширину.`;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      handle.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, x: event.clientX, start: header.getBoundingClientRect().width, previous: widths[column.id] };
    });
    handle.addEventListener('pointermove', event => {
      if (event.pointerId === drag?.id && handle.hasPointerCapture(event.pointerId)) {
        setWidth(column, drag.start + event.clientX - drag.x);
      }
    });
    handle.addEventListener('pointerup', event => {
      if (event.pointerId !== drag?.id) return;
      if (event.clientX !== drag.x) setWidth(column, drag.start + event.clientX - drag.x);
      drag = null;
      persist();
    });
    handle.addEventListener('lostpointercapture', event => {
      if (event.pointerId !== drag?.id) return;
      if (drag.previous === undefined) delete widths[column.id];
      else widths[column.id] = drag.previous;
      drag = null;
      layout();
    });
    handle.addEventListener('dblclick', () => resetWidth(column));
    handle.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') return resetWidth(column);
      const step = event.shiftKey ? 32 : 8;
      setWidth(column, header.getBoundingClientRect().width + (event.key === 'ArrowRight' ? step : -step));
      persist();
    });
    header.append(handle);
  }

  function update(scope) {
    const headers = Array.from(table.tHead.rows[0].cells);
    const entries = headers.map(header => {
      const label = header.getAttribute('aria-label') || header.title || header.textContent.trim();
      return { header, label, id: header.dataset.column || label };
    });
    const key = 'work-board.column-widths.v1.' + JSON.stringify([scope, entries.map(entry => entry.id)]);
    if (key === storageKey && entries.every((entry, i) =>
      columns[i]?.handle.parentNode === entry.header && columns[i].label === entry.label)) return;
    drag = null;
    for (const column of columns) { column.handle.remove(); column.header.style.width = ''; }
    columns = entries;
    storageKey = key;
    widths = readWidths(view, key, columns);
    for (const column of columns) installHandle(column);
    measure();
  }

  const observer = new view.ResizeObserver(() => {
    if (scroller.clientWidth !== containerWidth) measure();
  });
  observer.observe(scroller);
  return { update, dispose() {
    observer.disconnect();
    for (const column of columns) column.handle.remove();
  } };
}

export const vResizableColumns = {
  mounted(table, { value }) {
    const controller = createController(table);
    controllers.set(table, controller);
    controller.update(value);
  },
  updated(table, { value }) { controllers.get(table).update(value); },
  beforeUnmount(table) { controllers.get(table).dispose(); controllers.delete(table); },
};
