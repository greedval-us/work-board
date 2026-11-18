<script setup>
import { computed, nextTick, shallowRef, useId, watch } from 'vue';
import { CONTROL_CARD_OFFICE_LABEL } from '../../../shared/constants/settings.js';

const props = defineProps({
  office: { type: String, default: '' },
  options: { type: Array, required: true },
  error: { type: String, default: '' },
  disabled: Boolean,
  saveOffice: { type: Function, required: true },
});
const officeDraft = shallowRef(props.office);
const officeNotice = shallowRef('');
const showOfficeError = shallowRef(false);
const officeHelpId = useId();
const officeErrorId = useId();
const officeChanged = computed(() => officeDraft.value !== props.office);
const officeErrorVisible = computed(() => showOfficeError.value && Boolean(props.error));

watch(() => props.office, (value) => {
  officeDraft.value = value;
  clearOfficeFeedback();
});

watch(() => props.options, (options) => {
  if (officeDraft.value && !options.includes(officeDraft.value)) {
    officeDraft.value = props.office;
    clearOfficeFeedback();
  }
});

function clearOfficeFeedback() {
  officeNotice.value = '';
  showOfficeError.value = false;
}

async function saveOffice(event) {
  if (props.disabled || !officeChanged.value) return;
  const select = event.currentTarget.elements.namedItem('office');
  const value = officeDraft.value;
  clearOfficeFeedback();
  if (await props.saveOffice(value)) {
    officeDraft.value = value;
    officeNotice.value = 'Значение сохранено.';
  } else {
    showOfficeError.value = true;
  }
  await nextTick();
  if (select.isConnected && document.activeElement === document.body) select.focus({ preventScroll: true });
}
</script>

<template>
  <form data-control-card-office @submit.prevent="saveOffice">
    <label>
      <span>{{ CONTROL_CARD_OFFICE_LABEL }}</span>
      <select v-model="officeDraft" name="office" :disabled="props.disabled"
        :aria-describedby="officeErrorVisible ? `${officeHelpId} ${officeErrorId}` : officeHelpId"
        :aria-invalid="officeErrorVisible || undefined" @change="clearOfficeFeedback">
        <option value="">Не указано</option>
        <option v-for="choice in props.options" :key="choice" :value="choice">{{ choice }}</option>
      </select>
    </label>
    <button type="submit" :disabled="props.disabled || !officeChanged">Сохранить</button>
  </form>
  <p :id="officeHelpId" class="registry-settings-help">Выбирается по умолчанию при выгрузке Ф‑21 из этой базы.</p>
  <p v-if="officeErrorVisible" :id="officeErrorId" class="registry-option-error" role="alert">{{ props.error }}</p>
  <p v-else class="registry-option-notice" role="status">{{ officeNotice }}</p>
</template>
