import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { deferred } from '../lib/deferred.mjs';
import { createSmokeForms } from './forms.mjs';

export async function verifyControlCard(driver, fixture, { generation, created, executorContact }) {
  const { output, js, api, wait, click, fill } = driver;
  const { controlCardFile, today, originalDeadline, firstCheckpointMark, reportSelections, dialogs } = fixture;
  const { fillInstruction, controlCardDialog, reportField } = createSmokeForms(driver);

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
  assert.equal(prefilledReport.documentDate, '');
  assert.equal(prefilledReport.incomingDate, '');
  assert.equal(Object.hasOwn(prefilledReport, 'office'), false);
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
  assert.ok(!manuallyClearedReport.content.includes(executorContact.executorPhone));
  assert.deepEqual((await api('settings', 'get', generation)).executorContacts, [executorContact]);
  await js(`document.querySelector('${controlCardDialog} .registry-close-button').click()`);
  await wait(`!document.querySelector('${controlCardDialog}')`);
  await click('Ф‑21 в Word', '.registry-instruction-dialog .registry-control-card-open');
  await wait(`Boolean(document.querySelector('${controlCardDialog}'))`);
  assert.equal(await js(`document.querySelector(${JSON.stringify(reportField('executorPhone'))}).value`), executorContact.executorPhone);
  await fill(reportField('executionMark'), { 0: '' });
  const { bytes: reportBytes, content: reportText } = await saveReport();
  for (const value of [created.instructionNumber, created.incomingNumber, created.executor, ...Object.values(reportSelections), firstCheckpointMark]) {
    assert.ok(reportText.includes(value), `Value missing in control card: ${value}`);
  }
  assert.ok(!reportText.includes(instructionBeforeExport.executionMark));
  assert.doesNotMatch(reportText, /Делопроизводство/);
  assert.deepEqual(await api('instructions', 'get', { id: created.id, generation }), instructionBeforeExport);
  writeFileSync(path.join(output, 'control-card-f21.docx'), reportBytes);
  await js(`document.querySelector('${controlCardDialog} .registry-close-button').click()`);
  await wait(`!document.querySelector('${controlCardDialog}')`);
  await fillInstruction({ status: 'completed', executionMark: 'Исполнено в срок' });
  await js("document.querySelector('.registry-instruction-form').requestSubmit()");
  await wait("!document.querySelector('.registry-instruction-dialog[open]')");
  assert.equal((await api('instructions', 'get', { id: created.id, generation })).status, 'completed');
}
