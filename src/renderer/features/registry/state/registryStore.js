import { INSTRUCTION_COLUMNS } from '../../../../shared/registry.js';
import { createControlStore } from '../../control/state/createControlStore.js';
import { snapshotInstruction } from '../instructionDraft.js';
import { registryService } from '../RegistryService.js';

function persist(service, { id, values, generation }) {
  const data = snapshotInstruction(values);
  return id ? service.update({ id, data, generation }) : service.create({ data, generation });
}

export function createRegistryStore({ app, service = registryService, now, closed = false } = {}) {
  return createControlStore({
    storeId: closed ? 'closedRegistry' : 'registry', app, service, now, closed, columns: INSTRUCTION_COLUMNS, persist,
    messages: {
      added: 'Указание добавлено.', removed: 'Указание удалено.',
      closed: 'Указание перенесено в раздел «Закрытый контроль».', loadError: 'Не удалось загрузить реестр. Повторите попытку.',
    },
  });
}

export const useRegistryStore = createRegistryStore();
export const useClosedRegistryStore = createRegistryStore({ closed: true });
