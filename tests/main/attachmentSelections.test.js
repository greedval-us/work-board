import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttachmentSelections } from '../../src/main/attachments/AttachmentSelections.js';

test('pending selections enforce per-pick and total capacity and reset for a new database', () => {
  const selections = new AttachmentSelections();
  const context = { generation: 1, entityType: 'tasks' };
  const files = Array.from({ length: 100 }, (_, index) => ({ name: `${index}.txt`, source: `/files/${index}.txt`, size: 1 }));
  assert.throws(() => selections.register([...files, files[0]], context), /не более 100/i);
  let picked;
  for (let index = 0; index < 10; index++) picked = selections.register(files, context);
  assert.throws(() => selections.register([files[0]], context), /не более 100/i);
  selections.release([picked[0].token], context);
  const [replacement] = selections.register([files[0]], context);
  assert.equal(selections.changes({ add: [replacement] }, context, []).additions.length, 1);
  const nextContext = { ...context, generation: 2 };
  assert.equal(selections.register(files, nextContext).length, 100);
  assert.throws(() => selections.changes({ add: [replacement] }, nextContext, []), /повторно выберите/i);
});
