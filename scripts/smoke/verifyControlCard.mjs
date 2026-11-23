import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { deferred } from '../lib/deferred.mjs';
import { createSmokeForms } from './forms.mjs';

export async function verifyControlCard(driver, fixture, { generation, created, executorContact }) {
  const { output, js, api, wait, click, fill } = driver;
  const { controlCardFile, openRequests, today, originalDeadline, firstCheckpointMark, reportSelections, controlCardOffice, alternateOffice, dialogs } = fixture;
  const openRequestCount = openRequests.length;
  const { fillInstruction, controlCardDialog, reportField } = createSmokeForms(driver);
  const officeSelect = JSON.stringify(reportField('office'));

  await js("document.querySelector('.registry-table tbody tr').click()");
  await wait("document.querySelector('.registry-instruction-dialog[open] .registry-form-grid')?.matches(':enabled')");
  const instructionBeforeExport = await api('instructions', 'get', { id: created.id, generation });
  const controlCardSave = `${controlCardDialog} .registry-control-card-save`;
  await click('Ф‑21 в Word', '.registry-instruction-dialog .registry-control-card-open');
  await wait(`Boolean(document.querySelector('${controlCardDialog}'))`);
  const prefilledReport = await js(`Object.fromEntries([...document.querySelectorAll('${controlCardDialog} form [name]')]
    .map(field => [field.name, field.value]))`);
  assert.equal(prefilledReport.instructionNumber, created.instructionNumber);
  assert.equal(prefilledReport.incomingNumber, created.incomingNumber);
  assert.equal(prefilledReport.executor, created.executor);
  assert.equal(prefilledReport.summary, created.summary);
  assert.equal(prefilledReport.deadline, originalDeadline);
  assert.equal(prefilledReport.extendedUntil, today);
  assert.equal(Object.hasOwn(prefilledReport, 'documentDate'), false);
  assert.equal(Object.hasOwn(prefilledReport, 'incomingDate'), false);
  assert.equal(prefilledReport.office, controlCardOffice);
  assert.deepEqual(await js(`[...document.querySelector(${officeSelect}).options].map(option => option.value)`),
    ['', controlCardOffice, alternateOffice]);
  assert.equal(Object.hasOwn(prefilledReport, 'officePhone'), false);
  assert.equal(await js(`document.querySelector('${controlCardDialog} form').checkValidity()`), true);
  for (const [field, option] of Object.entries(reportSelections)) {
    const selector = reportField(field);
    assert.equal(prefilledReport[field], option);
    assert.deepEqual(await js(`(() => {
      const select = document.querySelector(${JSON.stringify(selector)});
      return [...select.options].map(option => option.value);
    })()`), ['', option]);
  }
  await fill(reportField('executor'), { 0: 'Иванов А.А.' });
  for (const field of Object.keys(reportSelections)) {
    assert.equal(await js(`document.querySelector(${JSON.stringify(reportField(field))}).value`), '');
  }
  await fill(reportField('executor'), { 0: executorContact.executor });
  assert.equal(await js(`document.querySelector(${JSON.stringify(reportField('department'))}).value`), executorContact.department);
  await fill(reportField('executorPhone'), { 0: '' });
  await fill(reportField('executionMark'), { 0: '' });

  const cancellation = deferred();
  dialogs.cancelControlCardSave(cancellation.promise);
  await click('Сохранить Word', controlCardSave);
  await wait(`document.querySelector('${controlCardSave}')?.disabled`);
  cancellation.resolve();
  await wait(`document.querySelector('${controlCardSave}')?.matches(':enabled')`);
  assert.equal(existsSync(controlCardFile), false);
  assert.equal(openRequests.length, openRequestCount);
  assert.equal(await js(`document.querySelector(${JSON.stringify(reportField('executorPhone'))}).value`), '');

  const saveReport = async () => {
    await click('Сохранить Word', controlCardSave);
    await wait(`document.querySelector('${controlCardDialog} [role=status]')?.textContent.trim() === 'Контрольная карточка сохранена.'`);
    const bytes = readFileSync(controlCardFile);
    const report = await JSZip.loadAsync(bytes);
    const xml = await report.file('word/document.xml').async('string');
    const content = Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g), match => match[1]).join(' ');
    return { bytes, content };
  };
  const manuallyClearedReport = await saveReport();
  assert.ok(manuallyClearedReport.content.includes(executorContact.department));
  assert.ok(manuallyClearedReport.content.includes(controlCardOffice));
  assert.ok(!manuallyClearedReport.content.includes(executorContact.executorPhone));
  assert.deepEqual((await api('settings', 'get', generation)).executorContacts, [executorContact]);
  await js(`document.querySelector('${controlCardDialog} .registry-close-button').click()`);
  await wait(`!document.querySelector('${controlCardDialog}')`);
  await click('Ф‑21 в Word', '.registry-instruction-dialog .registry-control-card-open');
  await wait(`Boolean(document.querySelector('${controlCardDialog}'))`);
  assert.equal(await js(`document.querySelector(${JSON.stringify(reportField('executorPhone'))}).value`), executorContact.executorPhone);
  assert.equal(await js(`document.querySelector(${officeSelect}).value`), controlCardOffice);
  await fill(reportField('office'), { 0: alternateOffice });
  await fill(reportField('executionMark'), { 0: 'Доклад подготовлен и передан исполнителю.' });
  await fill(reportField('removalMark'), { 0: 'Снято с контроля' });
  await fill(reportField('removalDate'), { 0: today });
  const { bytes: reportBytes, content: reportText } = await saveReport();
  assert.deepEqual(openRequests.slice(openRequestCount), [realpathSync(controlCardFile), realpathSync(controlCardFile)]);
  for (const value of [created.instructionNumber, created.incomingNumber, created.executor, ...Object.values(reportSelections), alternateOffice, firstCheckpointMark, 'Доклад подготовлен и передан исполнителю.', 'Снято с контроля']) {
    assert.ok(reportText.includes(value), `Value missing in control card: ${value}`);
  }
  assert.ok(!reportText.includes(controlCardOffice));
  assert.equal((await api('settings', 'get', generation)).office, controlCardOffice);
  assert.ok(!reportText.includes(instructionBeforeExport.executionMark));
  assert.doesNotMatch(reportText, /Молочная коровка|0988366648|78467593047/);
  assert.deepEqual(await api('instructions', 'get', { id: created.id, generation }), instructionBeforeExport);
  writeFileSync(path.join(output, 'control-card-f21.docx'), reportBytes);
  await js(`document.querySelector('${controlCardDialog} .registry-close-button').click()`);
  await wait(`!document.querySelector('${controlCardDialog}')`);
  await click('Ф‑21 в Word', '.registry-instruction-dialog .registry-control-card-open');
  await wait(`Boolean(document.querySelector('${controlCardDialog}'))`);
  assert.equal(await js(`document.querySelector(${officeSelect}).value`), controlCardOffice);
  await js(`document.querySelector('${controlCardDialog} .registry-close-button').click()`);
  await wait(`!document.querySelector('${controlCardDialog}')`);
  // Seed a legacy status while the card is open. A form save must preserve the stored value.
  await api('instructions', 'update', { id: created.id, generation, data: { status: 'completed' } });
  await fillInstruction({ executionMark: 'Исполнено в срок' });
  await js("document.querySelector('.registry-instruction-form').requestSubmit()");
  await wait("!document.querySelector('.registry-instruction-dialog[open]')");
  const saved = await api('instructions', 'get', { id: created.id, generation });
  assert.equal(saved.status, 'completed');
  assert.equal(saved.executionMark, 'Исполнено в срок');
  await wait("document.querySelector('.registry-row td[data-column=executionMark]')?.textContent.trim() === 'Исполнено в срок'");
  assert.equal(await js("Boolean(document.querySelector('.registry-row .registry-urgency'))"), false);
}
