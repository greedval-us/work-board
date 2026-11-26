export const THEMES = Object.freeze(['light', 'dark', 'system']);
export const APP_APPEARANCE_STYLES = Object.freeze({
  standard: 'Стандартная',
  witcher: 'Ведьмак',
  'harry-potter': 'Гарри Поттер',
  cyberpunk: 'Киберпанк',
  gzhel: 'Гжель',
});
export const APP_FONT_FAMILIES = Object.freeze({ inter: 'Inter', system: 'Системный' });
export const APP_FONT_SIZE_LIMITS = Object.freeze({ min: 12, max: 16 });
export const INSTRUCTION_OPTION_LABELS = Object.freeze({
  documentType: 'Вид документа',
  source: 'Откуда поступил документ',
  executor: 'Исполнитель',
});
export const CONTROL_CARD_OPTION_LABELS = Object.freeze({
  department: 'Подразделение',
  executorPhone: 'Телефон исполнителя',
});
export const CONTROL_CARD_OFFICE_LABEL = 'Участок делопроизводства';
export const CONTROL_CARD_OFFICE_LIMIT = 500;
export const REGISTRY_OPTION_LABELS = Object.freeze({
  ...INSTRUCTION_OPTION_LABELS, ...CONTROL_CARD_OPTION_LABELS, office: CONTROL_CARD_OFFICE_LABEL,
});
export const REGISTRY_OPTION_LIMITS = Object.freeze({
  documentType: 300, source: 300, executor: 300, department: 300, executorPhone: 100, office: CONTROL_CARD_OFFICE_LIMIT,
});
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'light',
  appearanceStyle: 'standard',
  typography: Object.freeze({ fontFamily: 'inter', fontSize: 14 }),
  planningEnabled: false,
  registryOptions: Object.freeze(Object.fromEntries(
    Object.keys(REGISTRY_OPTION_LABELS).map(field => [field, Object.freeze([])]),
  )),
  executorContacts: Object.freeze([]),
  office: '',
});
