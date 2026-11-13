const instructionField = field => `.registry-form-grid [name="${field}"]`;
const optionForm = field => `[data-registry-option="${field}"]`;
const optionRow = (field, value) =>
  `.registry-option-group:has(> ${optionForm(field)}) [data-registry-option-value=${JSON.stringify(value)}]`;
const controlCardDialog = '.registry-control-card-dialog[open]';
const reportField = name => `${controlCardDialog} [name="${name}"]`;

export function createSmokeForms({ fill, wait, js }) {
  async function fillInstruction(values) {
    for (const [field, value] of Object.entries(values)) await fill(instructionField(field), { 0: value });
  }

  async function addRegistryOption(field, value, contacts = {}) {
    const form = optionForm(field);
    const input = `${form} input`;
    await wait(`document.querySelector(${JSON.stringify(input)})?.matches(':enabled')`);
    await fill(input, { 0: value });
    for (const [contact, selected] of Object.entries(contacts)) {
      await fill(`${form} select[name=${contact}]`, { 0: selected });
    }
    await js(`document.querySelector(${JSON.stringify(form)}).requestSubmit()`);
    await wait(`document.querySelector(${JSON.stringify(input)})?.value === ''`);
  }

  return { instructionField, fillInstruction, optionForm, optionRow, addRegistryOption, controlCardDialog, reportField };
}
