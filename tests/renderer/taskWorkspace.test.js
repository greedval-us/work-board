import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectScope, reactive, shallowRef } from 'vue';
import { useTaskWorkspace } from '../../src/renderer/features/tasks/useTaskWorkspace.js';

function fixture(t, listTasks) {
  const scope = effectScope();
  t.after(() => scope.stop());
  let appGuard;
  let routeGuard;
  const calendar = reactive({ taskError: shallowRef(''), busyTaskId: shallowRef(null) });
  const app = reactive({
    database: { ready: true, generation: 1 }, revision: 0, databaseSwitching: false,
    registerUnsavedGuard(guard) { appGuard = guard; return () => { appGuard = undefined; }; },
  });
  const workspace = scope.run(() => useTaskWorkspace({
    app, calendar, service: { listTasks }, now: () => new Date(2026, 10, 20, 12), trackDate: false,
    registerRouteLeave(guard) { routeGuard = guard; },
  }));
  return { app, workspace, scope, appGuard: () => appGuard, routeGuard: () => routeGuard };
}

test('the agenda and month queries ignore results from superseded selections, databases and revisions', async t => {
  const pending = [];
  const { app, workspace } = fixture(t, request => new Promise(resolve => pending.push({ request, resolve })));
  await Promise.resolve();
  assert.deepEqual(pending[0].request, { generation: 1, agendaDate: '2026-11-20' });

  workspace.month.value = '2026-12';
  await Promise.resolve();
  assert.deepEqual(pending[1].request, { generation: 1, month: '2026-12' });
  const oldSelection = [{ id: 1 }];
  pending[0].resolve(oldSelection);
  await Promise.resolve();
  assert.deepEqual(workspace.tasks.value, []);

  app.databaseSwitching = true;
  app.database = { ready: true, generation: 2 };
  app.databaseSwitching = false;
  await Promise.resolve();
  assert.deepEqual(pending[2].request, { generation: 2, month: '2026-12' });
  const currentTasks = [{ id: 2 }];
  const refresh = workspace.refresh();
  pending[2].resolve(currentTasks);
  await refresh;
  assert.deepEqual(workspace.tasks.value, currentTasks);

  pending[1].resolve(oldSelection);
  await Promise.resolve();
  assert.deepEqual(workspace.tasks.value, currentTasks);

  app.revision += 1;
  await Promise.resolve();
  app.revision += 1;
  await Promise.resolve();
  pending[3].resolve(oldSelection);
  await Promise.resolve();
  assert.deepEqual(workspace.tasks.value, currentTasks);
  const latestTasks = [{ id: 3 }];
  const latest = workspace.refresh();
  pending[4].resolve(latestTasks);
  await latest;
  assert.deepEqual(workspace.tasks.value, latestTasks);
});

test('the tasks editor uses the selected date and guards both navigation and database changes', t => {
  const { app, workspace, scope, appGuard, routeGuard } = fixture(t, async () => []);
  workspace.newTask();
  assert.deepEqual(workspace.editing.value, { task: null, date: '2026-11-20', generation: 1 });
  workspace.month.value = '2026-12';
  workspace.newTask();
  assert.equal(workspace.editing.value.date, '2026-12-01');
  workspace.editor.value = { requestClose: () => false };
  assert.equal(appGuard()(), false);
  assert.equal(routeGuard()(), false);

  app.database = { ready: true, generation: 2 };
  assert.equal(workspace.editing.value, null);
  workspace.closeTask('2027-01-04');
  assert.equal(workspace.month.value, '2027-01');

  scope.stop();
  assert.equal(appGuard(), undefined);
});
