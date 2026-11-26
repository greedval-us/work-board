import assert from 'node:assert/strict';
import { test } from 'node:test';
import { vResizableColumns } from '../../src/renderer/ui/resizableColumns.js';

function fixture() {
  const storage = new Map();
  const attributes = new Map();
  let notifySize;
  const view = {
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    ResizeObserver: class {
      constructor(callback) { notifySize = callback; }
      observe() {}
      disconnect() {}
    },
  };
  const ownerDocument = { defaultView: view, createElement() {
    const listeners = new Map();
    return {
      setAttribute() {}, focus() {}, remove() { this.parentNode = null; },
      setPointerCapture(id) { this.pointer = id; }, hasPointerCapture(id) { return this.pointer === id; },
      addEventListener: (name, callback) => listeners.set(name, callback),
      fire: (name, values = {}) => listeners.get(name)({ preventDefault() {}, button: 0, pointerId: 1, ...values }),
    };
  } };
  const headers = ['title', 'deadline'].map(id => ({
    ownerDocument, dataset: { column: id }, title: id, style: {}, natural: 100,
    getAttribute: () => null, append(node) { this.handle = node; node.parentNode = this; },
    getBoundingClientRect() { return { width: this.natural && (parseFloat(this.style.width) || this.natural) }; },
  }));
  const table = {
    ownerDocument, parentElement: { clientWidth: 200 }, tHead: { rows: [{ cells: headers }] }, style: {},
    removeAttribute: key => attributes.delete(key), toggleAttribute: (key, present) => attributes.set(key, present),
  };
  const mount = value => vResizableColumns.mounted(table, { value });
  const unmount = () => vResizableColumns.beforeUnmount(table);
  return { table, headers, storage, mount, unmount, resize: () => notifySize() };
}

test('pointer and keyboard resizing persists across remounts, keeps layouts separate and resets a column', () => {
  const { table, headers: [title, deadline], mount, unmount } = fixture();
  mount('registry');
  title.handle.fire('pointerdown', { clientX: 100 });
  title.handle.fire('pointerup', { clientX: 150 });
  assert.equal(table.style.width, '250px');
  title.handle.fire('keydown', { key: 'ArrowRight' });
  assert.equal(title.style.width, '158px');
  unmount();
  mount('registry-wide');
  assert.equal(table.style.width, '');
  unmount();
  mount('registry');
  assert.equal(title.style.width, '158px');
  deadline.handle.fire('keydown', { key: 'ArrowLeft', shiftKey: true });
  assert.equal(deadline.style.width, '68px');
  title.handle.fire('dblclick');
  assert.equal(title.style.width, '100px');
  assert.equal(deadline.style.width, '68px');
  deadline.handle.fire('keydown', { key: 'Home' });
  assert.equal(table.style.width, '');
});

test('cancelling a pointer drag restores the existing width, and hidden columns reserve no space', () => {
  const { table, headers: [title, deadline], mount, resize } = fixture();
  mount('analytics');
  title.handle.fire('keydown', { key: 'ArrowRight' });
  title.handle.fire('pointerdown', { clientX: 108 });
  title.handle.fire('pointermove', { clientX: 160 });
  assert.equal(title.style.width, '160px');
  title.handle.fire('lostpointercapture');
  assert.equal(title.style.width, '108px');
  table.parentElement.clientWidth = 80;
  deadline.natural = 0;
  resize();
  assert.equal(table.style.width, '108px');
  assert.equal(deadline.style.width, '');
  title.natural = 0;
  deadline.natural = 80;
  table.parentElement.clientWidth = 81;
  resize();
  assert.equal(table.style.width, '');
});
