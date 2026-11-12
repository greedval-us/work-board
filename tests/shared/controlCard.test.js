import assert from 'node:assert/strict';
import { test } from 'node:test';
import { controlCardFields, normalizeControlCardFields } from '../../src/shared/controlCard.js';
import { validateRegistryOption } from '../../src/shared/constants/settings.js';
import { ValidationError } from '../../src/shared/errors.js';

test('Ф‑21 prefills only the fields with the same meaning as the registry data', () => {
  const values = controlCardFields({
    instructionNumber: '001/К', incomingNumber: '002/В', source: 'Архив', title: 'Проверка',
    summary: 'Подготовить заключение', executor: 'Сидоров И. И.', controlType: 'Еженедельный',
    deadline: '2026-11-15', extendedUntil: '2026-11-20', controlDate: '2026-11-11',
  });
  assert.deepEqual(values, {
    instructionNumber: '001/К', documentDate: '', incomingNumber: '002/В', incomingDate: '',
    source: 'Архив', title: 'Проверка', summary: 'Подготовить заключение',
    deadline: '2026-11-15', extendedUntil: '2026-11-20', executor: 'Сидоров И. И.', department: '', executorPhone: '',
    executionMark: '', removalMark: '', removalDate: '',
  });
});

test('Ф‑21 overrides may clear prefilled fields, supply optional fields, or keep saved defaults', () => {
  const defaults = controlCardFields({ instructionNumber: '001/К', title: 'Длинный текст'.repeat(50), deadline: '2026-11-15' });
  const values = normalizeControlCardFields({ instructionNumber: '', executorPhone: '  123  ', incomingDate: '2026-11-10', deadline: '' }, defaults);
  assert.equal(values.instructionNumber, '');
  assert.equal(values.executorPhone, '123');
  assert.equal(values.incomingDate, '2026-11-10');
  assert.equal(values.deadline, '');
  assert.equal(values.title, defaults.title);
  assert.equal(defaults.instructionNumber, '001/К');
  assert.throws(() => normalizeControlCardFields({ documentDate: '2026-02-30' }), ValidationError);
  assert.throws(() => normalizeControlCardFields({ executorPhone: 123 }), ValidationError);
});

test('Ф‑21 accepts both contact options and discards obsolete office fields', () => {
  const department = validateRegistryOption('department', '  Отдел контроля  ');
  const executorPhone = validateRegistryOption('executorPhone', '  +7 900 555-01-23 доб. 17 ');
  const values = normalizeControlCardFields({ department, executorPhone, office: 'Канцелярия', officePhone: '01' });
  assert.equal(values.department, 'Отдел контроля');
  assert.equal(values.executorPhone, '+7 900 555-01-23 доб. 17');
  assert.equal(Object.hasOwn(values, 'office'), false);
  assert.equal(Object.hasOwn(values, 'officePhone'), false);
  assert.throws(() => validateRegistryOption('executorPhone', '1'.repeat(101)), ValidationError);
});

test('Ф‑21 prefills the matched executor contact and allows clearing it for one report', () => {
  const contacts = [
    { executor: 'Иванов И. И.', department: 'Отдел контроля', executorPhone: '103' },
    { executor: 'Петров П. П.', department: '', executorPhone: '104' },
  ];
  const defaults = controlCardFields({ executor: '  ИВАНОВ И. И.  ' }, contacts);
  assert.equal(defaults.department, 'Отдел контроля');
  assert.equal(defaults.executorPhone, '103');
  assert.equal(controlCardFields({ executor: 'Петров П. П.' }, contacts).executorPhone, '104');
  assert.equal(controlCardFields({ executor: 'Другой исполнитель' }, contacts).executorPhone, '');
  assert.equal(normalizeControlCardFields({ executorPhone: '' }, defaults).executorPhone, '');
});
