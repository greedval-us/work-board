import { computed, shallowRef } from 'vue';
import { DesktopError, ERROR_CODES } from '../../../../shared/errors.js';
import { snapshotInstruction } from '../instructionDraft.js';
import { errorMessage } from '../../../infrastructure/errorMessage.js';
import { createRegistryRead } from './read.js';

export function createRegistryRecords({ app, service, closed, ready, isCurrent, error, showNotice }) {
  const opening = shallowRef(false);
  const saving = shallowRef(false);
  const deleting = shallowRef(false);
  const closingControl = shallowRef(false);
  const mutationError = shallowRef('');
  const busy = computed(() => saving.value || deleting.value || closingControl.value);
  const canMutate = computed(() => ready.value && !app.databaseSwitching && !busy.value);
  const requests = createRegistryRead(null);

  function cancelRecordRead() {
    requests.invalidate();
    opening.value = false;
  }

  function clearMutationError() {
    mutationError.value = '';
  }

  function getRecord(value, generation = app.database?.generation) {
    const id = Number(value);
    if (!isCurrent(generation) || !Number.isSafeInteger(id) || id < 1) return Promise.resolve(null);
    const key = JSON.stringify([id, generation, app.revision]);
    return requests.run(key, async isReadCurrent => {
      opening.value = true;
      error.value = '';
      try {
        const record = await service.get({ id, generation });
        if (!isReadCurrent()) return null;
        if (!record) throw new DesktopError(ERROR_CODES.NOT_FOUND, 'Указание не найдено. Возможно, оно было удалено.');
        return record;
      } catch (cause) {
        if (isReadCurrent()) error.value = errorMessage(cause, 'Не удалось открыть указание.');
        return null;
      } finally {
        if (isReadCurrent()) opening.value = false;
      }
    });
  }

  async function mutate(generation, pending, operation, { success, failure, feedback = mutationError }) {
    pending.value = true;
    feedback.value = '';
    try {
      await app.withOperation(operation);
      if (!isCurrent(generation)) return false;
      app.touchData();
      showNotice(success);
      return true;
    } catch (cause) {
      if (isCurrent(generation)) feedback.value = errorMessage(cause, failure);
      return false;
    } finally {
      pending.value = false;
    }
  }

  async function saveRecord({ id = null, data: values, generation }) {
    if (!canMutate.value || !isCurrent(generation)) return false;
    const data = snapshotInstruction(values);
    const persist = () => id ? service.update({ id, data, generation }) : service.create({ data, generation });
    return mutate(generation, saving, persist, {
      success: id ? 'Изменения сохранены.' : 'Указание добавлено.',
      failure: 'Не удалось сохранить указание. Введённые данные сохранены в форме.',
    });
  }

  async function removeRecord({ id, generation }) {
    if (!canMutate.value || !id || !isCurrent(generation)) return false;
    return mutate(generation, deleting, () => service.remove({ id, generation }), {
      success: 'Указание удалено.',
      failure: 'Не удалось удалить указание.',
    });
  }

  async function closeControl({ id, generation, fromCard = false }) {
    if (closed || !canMutate.value || !id || !isCurrent(generation)) return false;
    showNotice('');
    return mutate(generation, closingControl, () => service.closeControl({ id, generation }), {
      success: 'Указание перенесено в раздел «Закрытый контроль».',
      failure: 'Не удалось закрыть контроль.',
      feedback: fromCard ? mutationError : error,
    });
  }

  return {
    opening, saving, deleting, closingControl, mutationError, busy, canMutate,
    getRecord, cancelRecordRead, clearMutationError, saveRecord, removeRecord, closeControl,
  };
}
