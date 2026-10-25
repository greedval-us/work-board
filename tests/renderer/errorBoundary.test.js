import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { compileScript, parse } from '@vue/compiler-sfc';
import { createPinia } from 'pinia';
import {
  callWithAsyncErrorHandling, createRenderer, getCurrentInstance, h,
  nextTick, onBeforeUnmount, onMounted, shallowRef,
} from 'vue';
import { useAppStore } from '../../src/renderer/stores/appStore.js';
import { useErrorStore } from '../../src/renderer/stores/errorStore.js';

// Compile the shipped component so the test covers its real hooks and template.
const filename = path.resolve('src/renderer/components/ui/ErrorBoundary.vue');
const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename });
const compiled = compileScript(descriptor, { id: 'boundary-test', inlineTemplate: true }).content
  .replaceAll('from "vue"', `from "${import.meta.resolve('vue')}"`)
  .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  .replace("from '../../stores/errorStore.js'", `from '${pathToFileURL(path.resolve('src/renderer/stores/errorStore.js')).href}'`);
const { default: ErrorBoundary } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function renderer() {
  return createRenderer({
    createElement: type => ({ type, children: [], props: {} }),
    createText: text => ({ text }), createComment: text => ({ text }),
    setText: (node, text) => { node.text = text; },
    setElementText: (node, text) => { node.text = text; },
    parentNode: node => node?.parent,
    nextSibling: node => node?.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
    patchProp: (node, key, _old, value) => { node.props[key] = value; },
    insert(node, parent, anchor) {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
      node.parent = parent;
      const index = anchor ? parent.children.indexOf(anchor) : -1;
      if (index < 0) parent.children.push(node);
      else parent.children.splice(index, 0, node);
    },
    remove(node) {
      const parent = node?.parent;
      if (parent) { parent.children.splice(parent.children.indexOf(node), 1); node.parent = null; }
    },
  });
}

function findNode(node, predicate) {
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
}

function fixture(t) {
  t.mock.method(console, 'error', () => {});
  const pinia = createPinia();
  const appStore = useAppStore(pinia);
  const errors = useErrorStore(pinia);
  const shouldFail = shallowRef(false);
  const sibling = shallowRef(null);
  let child;
  let boundary;
  let mounted = 0;
  let unmounted = 0;
  let uncaptured = 0;
  const Child = {
    setup() {
      const draft = shallowRef('original');
      child = { instance: getCurrentInstance(), draft };
      mounted++;
      const unregister = appStore.registerUnsavedGuard(() => draft.value === 'original');
      onBeforeUnmount(() => { unmounted++; unregister(); });
      return () => {
        if (shouldFail.value) throw new Error('SELECT private_data FROM C:/private/work.sqlite');
        return h('input', { value: draft.value });
      };
    },
  };
  const root = { children: [] };
  const app = renderer().createApp({
    render: () => h(ErrorBoundary, { ref: value => { boundary = value; } }, {
      default: () => [h(Child), sibling.value ? h(sibling.value) : null],
    }),
  });
  app.config.errorHandler = () => { uncaptured++; };
  app.use(pinia);
  app.mount(root);
  t.after(() => app.unmount());
  child.draft.value = 'unsaved edit';
  return {
    appStore, errors, root, shouldFail, sibling,
    get child() { return child; },
    get boundary() { return boundary; },
    get mounted() { return mounted; },
    get unmounted() { return unmounted; },
    get uncaptured() { return uncaptured; },
  };
}

test('native and asynchronous event failures preserve the dirty child and its close guard', async t => {
  const state = fixture(t);
  const original = state.child.instance;
  for (const operation of [
    () => { throw new Error('SELECT private_data FROM C:/private/work.sqlite'); },
    async () => { throw new Error('SELECT private_data FROM C:/private/work.sqlite'); },
  ]) {
    await callWithAsyncErrorHandling(operation, state.child.instance, 5)?.catch(() => {});
    await nextTick();
    assert.equal(state.child.instance, original);
    assert.equal(state.child.draft.value, 'unsaved edit');
    assert.equal(state.unmounted, 0);
    assert.equal(state.appStore.hasUnsavedGuards(), true);
    assert.equal(await state.appStore.prepareToClose(), false);
    assert.doesNotMatch(JSON.stringify(state.errors.$state), /SELECT|private|sqlite/);
  }
  assert.equal(state.errors.notification.id, 2);
  assert.equal(state.uncaptured, 0);
});

test('setup and lifecycle errors in another child preserve the existing dirty form', async t => {
  const state = fixture(t);
  state.sibling.value = {
    setup() { throw new Error('setup failure'); },
    render: () => h('span', null, 'setup sibling'),
  };
  await nextTick();
  assert.equal(state.unmounted, 0);
  state.sibling.value = {
    setup() { onMounted(() => { throw new Error('mounted failure'); }); return () => h('span'); },
  };
  await nextTick();
  assert.equal(state.unmounted, 0);
  assert.equal(state.child.draft.value, 'unsaved edit');
  assert.equal(await state.appStore.prepareToClose(), false);
  assert.equal(state.errors.notification.id, 2);
  assert.equal(state.uncaptured, 0);
});

test('an actual render failure shows recovery and Retry mounts a working workspace', async t => {
  const state = fixture(t);
  state.shouldFail.value = true;
  await nextTick();
  assert.equal(state.unmounted, 1);
  const retry = findNode(state.root, node => node.type === 'button' && node.text === 'Повторить');
  assert.ok(retry);
  assert.equal(state.errors.notification.id, 1);
  assert.doesNotMatch(JSON.stringify(state.errors.$state), /SELECT|private|sqlite/);
  state.shouldFail.value = false;
  retry.props.onClick();
  await nextTick();
  assert.equal(state.mounted, 2);
  assert.ok(findNode(state.root, node => node.type === 'input'));
  assert.equal(state.errors.notification, null);
  assert.equal(state.uncaptured, 0);
});

test('only the exact production render context replaces the workspace', async t => {
  const state = fixture(t);
  const capture = state.boundary.$.ec[0];
  capture(new Error('event failure'), state.child.instance.proxy, 'https://vuejs.org/error-reference/#runtime-5');
  await nextTick();
  assert.equal(state.unmounted, 0);
  capture(new Error('render failure'), state.child.instance.proxy, 'https://vuejs.org/error-reference/#runtime-1');
  await nextTick();
  assert.equal(state.unmounted, 1);
  assert.ok(findNode(state.root, node => node.type === 'button' && node.text === 'Повторить'));
  assert.equal(state.uncaptured, 0);
});
