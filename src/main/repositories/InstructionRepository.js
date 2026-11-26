import { normalizeListRequest, validateInstruction } from '../../shared/registry.js';
import { ControlRecordRepository } from './controlRecords/ControlRecordRepository.js';

export class InstructionRepository extends ControlRecordRepository {
  constructor(database) {
    super(database, {
      table: 'instructions', validate: validateInstruction, normalizeList: normalizeListRequest,
      notFound: 'Указание не найдено.',
    });
  }
}
