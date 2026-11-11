import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compileScript, parse } from '@vue/compiler-sfc';
import { createRenderer, h, markRaw, nextTick, shallowRef } from 'vue';

function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

test('calendar links focus the exact checkpoint and replacing a historical mark keeps its date', async t => {
  const component = new URL('../../src/renderer/components/registry/InstructionControlSchedule.vue', import.meta.url);
  const filename = fileURLToPath(component);
  assert.ok(existsSync(filename), 'the instruction form has a checkpoint editor');
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename });
  const code = compileScript(descriptor, { id: 'control-schedule-test', inlineTemplate: true }).content
    .replace(/from\s+(['"])([^'"]+)\1/g, (_match, quote, path) => `from ${quote}${path.startsWith('.') ? new URL(path, component).href : import.meta.resolve(path)}${quote}`);
  const { default: Editor } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const schedule = shallowRef({ frequency: 'monthly', firstDate: '2026-01-15', customDates: [], marks: [{ date: '2025-12-24', text: 'Старая отметка' }] });
  const selectedDate = shallowRef('2026-02-15');
  const ownerDocument = { activeElement: null };
  const root = { children: [] };
  const renderer = createRenderer({
    createElement: type => markRaw({
      type, children: [], props: {}, ownerDocument, focus() { ownerDocument.activeElement = this; },
      querySelector(selector) {
        const date = selector.match(/\[data-checkpoint-date="([^"]+)"\] textarea/)?.[1];
        const row = date && find(this, node => node.props?.['data-checkpoint-date'] === date);
        return row && find(row, node => node.type === 'textarea');
      },
    }),
    createText: text => ({ text }), createComment: text => ({ text }),
    setText: (node, text) => { node.text = text; }, setElementText: (node, text) => { node.text = text; },
    parentNode: node => node.parent,
    nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
    patchProp: (node, key, _previous, value) => { node.props[key] = value; },
    insert(node, parent, anchor) {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
      node.parent = parent;
      parent.children.splice(anchor ? parent.children.indexOf(anchor) : parent.children.length, 0, node);
    },
    remove(node) {
      node.parent.children.splice(node.parent.children.indexOf(node), 1);
      node.parent = null;
    },
  });
  let editor;
  const app = renderer.createApp({ render: () => h(Editor, {
    ref: value => { editor = value; },
    modelValue: schedule.value, 'onUpdate:modelValue': value => { schedule.value = value; },
    controlDate: '2026-01-01', deadline: '2026-12-31', selectedDate: selectedDate.value,
  }) });
  app.mount(root);
  t.after(() => app.unmount());
  const row = date => find(root, node => node.props?.['data-checkpoint-date'] === date);

  assert.equal(await editor.focusSelectedDate(), true);
  assert.equal(ownerDocument.activeElement, find(row('2026-02-15'), node => node.type === 'textarea'));
  assert.equal(row('2026-01-15'), undefined);

  selectedDate.value = '2025-12-24';
  await nextTick();
  await nextTick();
  assert.ok(ownerDocument.activeElement === find(row('2025-12-24'), node => node.type === 'textarea'), 'changing the calendar link focuses the new checkpoint');
  const mark = ownerDocument.activeElement;
  assert.equal(mark.props.value, 'Старая отметка');
  mark.props.onInput({ target: { value: '' } });
  await nextTick();
  assert.equal(find(row('2025-12-24'), node => node.type === 'textarea'), mark);
  mark.props.onInput({ target: { value: 'Новая отметка' } });
  assert.deepEqual(schedule.value.marks, [{ date: '2025-12-24', text: 'Новая отметка' }]);
  assert.equal(schedule.value.frequency, 'monthly');
});
