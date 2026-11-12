import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compileScript, parse } from '@vue/compiler-sfc';
import { createRenderer, h, markRaw, nextTick, shallowRef } from 'vue';

function find(node, predicate) {
  if (!node) return undefined;
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

async function mountEditor(t, value, options = {}) {
  const component = new URL('../../src/renderer/components/registry/InstructionControlSchedule.vue', import.meta.url);
  const filename = fileURLToPath(component);
  assert.ok(existsSync(filename), 'the instruction form has a checkpoint editor');
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename });
  const code = compileScript(descriptor, { id: 'control-schedule-test', inlineTemplate: true }).content
    .replace(/from\s+(['"])([^'"]+)\1/g, (_match, quote, path) => `from ${quote}${path.startsWith('.') ? new URL(path, component).href : import.meta.resolve(path)}${quote}`);
  const { default: Editor } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const schedule = shallowRef(value);
  const selectedDate = shallowRef(options.selectedDate ?? '2026-02-15');
  const controlDate = shallowRef(options.controlDate ?? '2026-01-01');
  const deadline = shallowRef(options.deadline ?? '2026-12-31');
  const disabled = shallowRef(false);
  const ownerDocument = { activeElement: null };
  const root = { children: [] };
  const renderer = createRenderer({
    createElement: type => markRaw({
      type, children: [], props: {}, ownerDocument, focus() { ownerDocument.activeElement = this; },
      setCustomValidity(message) { this.validationMessage = message; },
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
    controlDate: controlDate.value, deadline: deadline.value, selectedDate: selectedDate.value, disabled: disabled.value,
  }) });
  app.mount(root);
  t.after(() => app.unmount());
  const row = date => find(root, node => node.props?.['data-checkpoint-date'] === date);
  const field = (date, name) => find(row(date), node => node.props?.name === name);
  const textarea = date => find(row(date), node => node.type === 'textarea');
  const moveButton = date => find(row(date), node => node.type === 'button' && node.props?.class?.includes('control-schedule-move'));
  const cancelMoveButton = date => find(row(date), node => node.type === 'button' && node.props?.class?.includes('control-schedule-cancel-move'));
  const input = async (node, value) => {
    assert.ok(node, 'the requested editor input is rendered');
    node.props.onInput({ target: { value } });
    await nextTick();
  };
  return { editor, schedule, selectedDate, controlDate, deadline, disabled, ownerDocument, root, row, field, textarea, moveButton, cancelMoveButton, input };
}

test('calendar links focus the exact checkpoint and replacing a historical mark keeps its date', async t => {
  const { editor, schedule, selectedDate, ownerDocument, row } = await mountEditor(t, {
    frequency: 'monthly', firstDate: '2026-01-15', customDates: [], marks: [{ date: '2025-12-24', text: 'Старая отметка' }],
  });

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

test('moving one checkpoint across months retains its mark, actual date and editor focus', async t => {
  const { editor, schedule, row, field, textarea, moveButton, input, ownerDocument } = await mountEditor(t, {
    frequency: 'monthly', firstDate: '2026-01-15', customDates: [],
    marks: [{ date: '2026-02-15', text: 'Проверено', actualDate: '2026-02-12' }],
  });
  await editor.focusSelectedDate();
  await input(field('2026-02-15', 'control-planned-date'), '2026-03-03');
  await moveButton('2026-02-15').props.onClick();
  await nextTick();
  assert.deepEqual(schedule.value.moves, [{ from: '2026-02-15', to: '2026-03-03' }]);
  assert.equal(schedule.value.firstDate, '2026-01-15');
  assert.ok(row('2026-03-15'), 'the following recurrence keeps its original date');
  assert.equal(row('2026-02-15'), undefined);
  assert.deepEqual(schedule.value.marks, [{ date: '2026-03-03', text: 'Проверено', actualDate: '2026-02-12' }]);
  assert.equal(ownerDocument.activeElement, textarea('2026-03-03'));
  await input(field('2026-03-03', 'control-planned-date'), '2026-02-15');
  await moveButton('2026-03-03').props.onClick();
  await nextTick();
  assert.equal(schedule.value.moves, undefined);
  assert.equal(ownerDocument.activeElement, textarea('2026-02-15'));
});

test('a collision leaves the schedule unchanged and presents an inline error', async t => {
  const value = { frequency: 'monthly', firstDate: '2026-01-15', customDates: [], marks: [] };
  const { editor, schedule, root, field, moveButton, input } = await mountEditor(t, value);
  await editor.focusSelectedDate();
  await input(field('2026-02-15', 'control-planned-date'), '2026-03-15');
  await moveButton('2026-02-15').props.onClick();
  await nextTick();
  assert.deepEqual(schedule.value, value);
  assert.ok(find(root, node => node.props?.role === 'alert')?.text);
});

test('a backdated factual date is kept until a mark is entered and survives comment replacement', async t => {
  const { editor, schedule, field, textarea, input } = await mountEditor(t, {
    frequency: 'monthly', firstDate: '2026-01-15', customDates: [], marks: [],
  });
  await editor.focusSelectedDate();
  const actual = field('2026-02-15', 'control-actual-date');
  assert.ok(actual, 'a factual date can be chosen before writing the mark');
  assert.ok(actual.props.min < '2025-12-24', 'factual dates are independent of the planned control period');
  await input(actual, '2025-12-24');
  assert.deepEqual(schedule.value.marks, []);
  await input(textarea('2026-02-15'), 'Получено ранее');
  assert.deepEqual(schedule.value.marks, [{ date: '2026-02-15', text: 'Получено ранее', actualDate: '2025-12-24' }]);
  await input(textarea('2026-02-15'), '');
  await input(textarea('2026-02-15'), 'Уточнено');
  assert.equal(schedule.value.marks[0].actualDate, '2025-12-24');
  await input(field('2026-02-15', 'control-actual-date'), '2025-12-25');
  assert.equal(schedule.value.marks[0].actualDate, '2025-12-25');
});

test('disabled editors ignore mutations of planned dates, factual dates and text', async t => {
  const value = { frequency: 'monthly', firstDate: '2026-01-15', customDates: [], marks: [{ date: '2026-02-15', text: 'Проверено', actualDate: '2026-02-14' }] };
  const { editor, schedule, disabled, field, textarea, moveButton, input } = await mountEditor(t, value);
  await editor.focusSelectedDate();
  await input(field('2026-02-15', 'control-planned-date'), '2026-02-16');
  disabled.value = true;
  await nextTick();
  assert.equal(moveButton('2026-02-15').props.disabled, true);
  assert.equal(field('2026-02-15', 'control-actual-date').props.readonly, true);
  await moveButton('2026-02-15').props.onClick();
  await input(field('2026-02-15', 'control-actual-date'), '2025-12-24');
  await input(textarea('2026-02-15'), 'Изменено');
  assert.deepEqual(schedule.value, value);
});

test('changing the recurring anchor resets individual moves while preserving historical marks', async t => {
  const history = { date: '2026-02-17', text: 'Проверено', actualDate: '2026-02-16' };
  const { schedule, root, input } = await mountEditor(t, {
    frequency: 'monthly', firstDate: '2026-01-15', customDates: [], moves: [{ from: '2026-02-15', to: '2026-02-17' }], marks: [history],
  });
  await input(find(root, node => node.props?.name === 'control-first-date'), '2026-01-20');
  assert.equal(schedule.value.moves, undefined);
  assert.deepEqual(schedule.value.marks, [history]);
});

test('moving a legacy mark after editing it preserves the original factual date on later edits', async t => {
  const { editor, schedule, field, textarea, moveButton, input } = await mountEditor(t, {
    frequency: 'monthly', firstDate: '2026-01-15', customDates: [], marks: [{ date: '2026-02-15', text: 'Получено' }],
  });
  await editor.focusSelectedDate();
  await input(textarea('2026-02-15'), 'Получено полностью');
  await input(field('2026-02-15', 'control-planned-date'), '2026-03-03');
  await moveButton('2026-02-15').props.onClick();
  await nextTick();
  await input(textarea('2026-03-03'), 'Уточнено после переноса');
  assert.deepEqual(schedule.value.marks, [{ date: '2026-03-03', text: 'Уточнено после переноса', actualDate: '2026-02-15' }]);
});

test('moving and removing a custom date keeps a single effective row and preserves the mark as history', async t => {
  const { editor, schedule, root, row, field, textarea, moveButton, input } = await mountEditor(t, {
    frequency: 'custom', firstDate: '', customDates: ['2026-02-15', '2026-03-15'], marks: [],
  });
  await editor.focusSelectedDate();
  await input(field('2026-02-15', 'control-actual-date'), '2026-02-10');
  await input(field('2026-02-15', 'control-planned-date'), '2026-03-03');
  await moveButton('2026-02-15').props.onClick();
  await nextTick();
  await input(textarea('2026-03-03'), 'Принято');
  assert.equal(schedule.value.marks[0].actualDate, '2026-02-10', 'an unsaved factual date follows the moved checkpoint');
  const remove = find(row('2026-03-03'), node => node.props?.class?.includes('control-schedule-remove'));
  assert.ok(remove, 'a moved custom date remains removable');
  remove.props.onClick();
  await nextTick();
  assert.deepEqual(schedule.value.customDates, ['2026-03-15']);
  assert.equal(schedule.value.moves, undefined);
  assert.ok(textarea('2026-03-03'), 'the marked date remains open as history');
  assert.equal(field('2026-03-03', 'control-planned-date'), undefined, 'a historical date cannot be rescheduled');
  const month = find(root, node => node.props?.type === 'month');
  month.props.onChange({ target: { value: '2026-02' } });
  await nextTick();
  assert.equal(row('2026-02-15'), undefined, 'the original custom date does not reappear');
});

test('changing frequency resets moves and keeps completed dates in history', async t => {
  const history = { date: '2026-02-17', text: 'Проверено', actualDate: '2026-02-16' };
  const { schedule, root } = await mountEditor(t, {
    frequency: 'monthly', firstDate: '2026-01-15', customDates: [], moves: [{ from: '2026-02-15', to: '2026-02-17' }], marks: [history],
  });
  find(root, node => node.props?.name === 'control-frequency').props.onChange({ target: { value: 'weekly' } });
  await nextTick();
  assert.equal(schedule.value.moves, undefined);
  assert.deepEqual(schedule.value.marks, [history]);
});

test('shortening the deadline keeps an out-of-period move editable and allows correcting it', async t => {
  const { editor, schedule, deadline, root, row, field, textarea, moveButton, input, ownerDocument } = await mountEditor(t, {
    frequency: 'monthly', firstDate: '2026-01-31', customDates: [], marks: [],
    moves: [{ from: '2026-02-28', to: '2026-03-02' }],
  }, { selectedDate: '2026-03-02' });
  await editor.focusSelectedDate();
  deadline.value = '2026-02-28';
  await nextTick();
  assert.ok(row('2026-03-02'), 'the invalid moved date remains visible for correction');
  assert.ok(find(root, node => node.props?.class?.includes('control-schedule-warning')), 'the invalid destination has a bounds warning');
  await input(field('2026-03-02', 'control-planned-date'), '2026-02-27');
  await moveButton('2026-03-02').props.onClick();
  await nextTick();
  assert.deepEqual(schedule.value.moves, [{ from: '2026-02-28', to: '2026-02-27' }]);
  assert.equal(ownerDocument.activeElement, textarea('2026-02-27'));
});

test('cancelling a move returns to the original date and preserves factual completion', async t => {
  const { editor, schedule, cancelMoveButton, textarea, ownerDocument } = await mountEditor(t, {
    frequency: 'monthly', firstDate: '2026-01-31', customDates: [],
    moves: [{ from: '2026-02-28', to: '2026-03-02' }],
    marks: [{ date: '2026-03-02', text: 'Принято', actualDate: '2026-03-01' }],
  }, { selectedDate: '2026-03-02' });
  await editor.focusSelectedDate();
  assert.ok(cancelMoveButton('2026-03-02'), 'moved dates have an explicit cancellation action');
  await cancelMoveButton('2026-03-02').props.onClick();
  await nextTick();
  assert.equal(schedule.value.moves, undefined);
  assert.deepEqual(schedule.value.marks, [{ date: '2026-02-28', text: 'Принято', actualDate: '2026-03-01' }]);
  assert.equal(ownerDocument.activeElement, textarea('2026-02-28'));
});

test('cancelling a move whose original date is outside a shortened period keeps its mark as history', async t => {
  const history = { date: '2026-04-02', text: 'Принято', actualDate: '2026-04-01' };
  const { editor, schedule, deadline, field, cancelMoveButton, textarea } = await mountEditor(t, {
    frequency: 'monthly', firstDate: '2026-01-31', customDates: [],
    moves: [{ from: '2026-03-31', to: '2026-04-02' }], marks: [history],
  }, { selectedDate: '2026-04-02' });
  await editor.focusSelectedDate();
  deadline.value = '2026-02-28';
  await nextTick();
  assert.ok(cancelMoveButton('2026-04-02'), 'an invalid original date does not prevent removing the override');
  await cancelMoveButton('2026-04-02').props.onClick();
  await nextTick();
  assert.equal(schedule.value.moves, undefined);
  assert.deepEqual(schedule.value.marks, [history]);
  assert.ok(textarea('2026-04-02'), 'the factual history remains open');
  assert.equal(field('2026-04-02', 'control-planned-date'), undefined);
});

test('cancelling an unmarked move outside the period removes its empty editor row', async t => {
  const { editor, schedule, deadline, row, textarea, input, cancelMoveButton } = await mountEditor(t, {
    frequency: 'monthly', firstDate: '2026-01-31', customDates: [], marks: [],
    moves: [{ from: '2026-03-31', to: '2026-04-02' }],
  }, { selectedDate: '2026-04-02' });
  await editor.focusSelectedDate();
  deadline.value = '2026-02-28';
  await nextTick();
  await input(textarea('2026-04-02'), '');
  await cancelMoveButton('2026-04-02').props.onClick();
  await nextTick();
  assert.equal(schedule.value.moves, undefined);
  assert.ok(!row('2026-04-02'), 'an empty historical editor is removed with the cancelled move');
});

test('a custom source before a changed control date remains scheduled at its valid moved destination', async t => {
  const { editor, controlDate, row, field, cancelMoveButton, disabled, schedule } = await mountEditor(t, {
    frequency: 'custom', firstDate: '', customDates: ['2026-02-01'], marks: [],
    moves: [{ from: '2026-02-01', to: '2026-03-01' }],
  }, { selectedDate: '2026-03-01' });
  await editor.focusSelectedDate();
  controlDate.value = '2026-02-15';
  await nextTick();
  const status = find(row('2026-03-01'), node => node.props?.class?.includes('registry-status'));
  assert.doesNotMatch(status.text, /Вне периода|Вне текущего/);
  assert.ok(field('2026-03-01', 'control-planned-date'));
  assert.ok(cancelMoveButton('2026-03-01'));
  disabled.value = true;
  await nextTick();
  assert.equal(cancelMoveButton('2026-03-01').props.disabled, true);
  await cancelMoveButton('2026-03-01').props.onClick();
  assert.deepEqual(schedule.value.moves, [{ from: '2026-02-01', to: '2026-03-01' }]);
});
