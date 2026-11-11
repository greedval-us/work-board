import assert from 'node:assert/strict';
import { test } from 'node:test';
import { controlCardFields, normalizeControlCardFields } from '../../src/shared/controlCard.js';
import { ValidationError } from '../../src/shared/errors.js';

test('Ф‑21 prefills only the fields with the same meaning as the registry data', () => {
  const values = controlCardFields({
    instructionNumber: '001/К', incomingNumber: '002/В', source: 'Архив', title: 'Проверка',
    summary: 'Подготовить заключение', executor: 'Сидоров И. И.', controlType: 'Еженедельный',
    deadline: '2026-11-15', extendedUntil: '2026-11-20', controlDate: '2026-11-11',
  });
  assert.deepEqual(values, {
    instructionNumber: '001/К', documentDate: '', incomingNumber: '002/В', incomingDate: '',
    source: 'Архив', office: '', officePhone: '', title: 'Проверка', summary: 'Подготовить заключение',
    deadline: '2026-11-15', extendedUntil: '2026-11-20', executor: 'Сидоров И. И.', department: '', executorPhone: '',
    executionMark: '', removalMark: '', removalDate: '',
  });
});

test('Ф‑21 overrides may clear prefilled fields, supply optional fields, or keep saved defaults', () => {
  const defaults = controlCardFields({ instructionNumber: '001/К', title: 'Длинный текст'.repeat(50), deadline: '2026-11-15' });
  const values = normalizeControlCardFields({ instructionNumber: '', officePhone: '  123  ', incomingDate: '2026-11-10', deadline: '' }, defaults);
  assert.equal(values.instructionNumber, '');
  assert.equal(values.officePhone, '123');
  assert.equal(values.incomingDate, '2026-11-10');
  assert.equal(values.deadline, '');
  assert.equal(values.title, defaults.title);
  assert.equal(defaults.instructionNumber, '001/К');
  assert.throws(() => normalizeControlCardFields({ documentDate: '2026-02-30' }), ValidationError);
  assert.throws(() => normalizeControlCardFields({ officePhone: 123 }), ValidationError);
});
