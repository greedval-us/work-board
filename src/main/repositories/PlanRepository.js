import { normalizePlanListRequest, validatePlan } from '../../shared/planning.js';
import { ControlRecordRepository } from './controlRecords/ControlRecordRepository.js';
import { controlRecord } from './controlRecords/row.js';

export class PlanRepository extends ControlRecordRepository {
  constructor(database) {
    super(database, {
      table: 'plans', validate: validatePlan, normalizeList: normalizePlanListRequest,
      notFound: 'План не найден.',
      extraColumns: 'plan_item AS planItem',
      toRecord: data => ({ ...controlRecord(data), plan_item: data.planItem }),
      groupColumn: 'instruction_number_search',
      extraSortColumns: { planItem: 'plan_item' },
    });
  }
}
