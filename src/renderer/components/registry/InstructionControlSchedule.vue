<script setup>
import { useId, useTemplateRef } from 'vue';
import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-vue-next';
import { CONTROL_FREQUENCIES, CONTROL_MARK_LIMIT } from '../../../shared/controlSchedule.js';
import { DATE_LIMITS } from '../../../shared/constants/dates.js';
import { formatDate } from '../../../shared/dates.js';
import { moveMonth } from '../../domain/calendarDates.js';
import { useControlScheduleEditor } from './useControlScheduleEditor.js';

const props = defineProps({
  controlDate: { type: String, default: '' },
  deadline: { type: String, default: '' },
  selectedDate: { type: String, default: '' },
  disabled: Boolean,
});
const schedule = defineModel({ type: Object, required: true });
const section = useTemplateRef('section');
const customDateInput = useTemplateRef('customDateInput');
const sectionId = useId();
const {
  customDate, openDate, plannedDate, moveError, month, recurring, custom, configuredDates,
  invalidCheckpointDate, duplicateDate, canAddDate, showPreview, marksByDate, rows,
  inControlPeriod, selectFrequency, selectFirstDate, addCustomDate, removeCustomDate,
  showMonth, selectMonth, toggleMark, actualDateDraft, updateActualDate, updateMark,
  updatePlannedDate, moveCheckpoint, cancelMove, focusSelectedDate,
} = useControlScheduleEditor(schedule, props, { section, customDateInput });

defineExpose({ focusSelectedDate });
</script>

<template>
  <section ref="section" class="control-schedule" :aria-labelledby="sectionId">
    <h3 :id="sectionId">Промежуточный контроль</h3>
    <fieldset class="control-schedule-fields" :disabled="props.disabled">
      <label class="registry-field">
        <span>Периодичность</span>
        <select name="control-frequency" :value="schedule.frequency" @change="selectFrequency($event.target.value)">
          <option v-for="(label, value) in CONTROL_FREQUENCIES" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label v-if="recurring" class="registry-field">
        <span>Первая дата контроля *</span>
        <input name="control-first-date" type="date" required :value="schedule.firstDate"
          :min="props.controlDate || DATE_LIMITS.MIN" :max="props.deadline || DATE_LIMITS.MAX" @input="selectFirstDate($event.target.value)" />
      </label>
      <div v-if="custom" class="control-schedule-custom">
        <label class="registry-field">
          <span>Дата контроля</span>
          <input ref="customDateInput" name="control-custom-date" type="date" :value="customDate"
            :min="props.controlDate || DATE_LIMITS.MIN" :max="props.deadline || DATE_LIMITS.MAX"
            @input="customDate = $event.target.value" @keydown.enter.prevent="addCustomDate" />
        </label>
        <button type="button" class="registry-button" :disabled="!canAddDate" @click="addCustomDate">Добавить дату</button>
      </div>
    </fieldset>
    <p v-if="duplicateDate" class="registry-help" role="status">Эта дата уже в графике.</p>
    <p v-else-if="custom && !configuredDates.size" class="registry-help">Добавьте даты промежуточного контроля.</p>
    <p v-if="invalidCheckpointDate" class="control-schedule-warning">
      Дата {{ formatDate(invalidCheckpointDate) }} вне периода контроля.
      <button type="button" class="registry-inline-action" @click="showMonth(invalidCheckpointDate.slice(0, 7))">Показать дату</button>
    </p>

    <div v-if="showPreview" class="control-schedule-preview">
      <div class="control-schedule-month">
        <h4>Контрольные даты</h4>
        <div class="control-schedule-navigation">
          <button type="button" class="registry-button" aria-label="Предыдущий месяц"
            :disabled="month === DATE_LIMITS.MIN.slice(0, 7)" @click="showMonth(moveMonth(month, -1))"><ChevronLeft :size="16" aria-hidden="true" /></button>
          <label class="registry-field">
            <span class="registry-visually-hidden">Месяц контрольных дат</span>
            <input type="month" :value="month" :min="DATE_LIMITS.MIN.slice(0, 7)" :max="DATE_LIMITS.MAX.slice(0, 7)" @change="selectMonth" @keydown.enter.prevent />
          </label>
          <button type="button" class="registry-button" aria-label="Следующий месяц"
            :disabled="month === DATE_LIMITS.MAX.slice(0, 7)" @click="showMonth(moveMonth(month, 1))"><ChevronRight :size="16" aria-hidden="true" /></button>
        </div>
      </div>
      <p v-if="!rows.length" class="registry-help control-schedule-empty">В этом месяце нет контрольных дат.</p>
      <ul v-else class="control-schedule-list" aria-label="Контрольные даты выбранного месяца">
        <li v-for="row in rows" :key="row.date" :data-checkpoint-date="row.date">
          <div class="control-schedule-row">
            <component :is="row.canOpen ? 'button' : 'div'" class="control-schedule-row-details"
              :type="row.canOpen ? 'button' : undefined" :aria-expanded="row.canOpen ? openDate === row.date : undefined"
              @click="row.canOpen && toggleMark(row.date)">
              <time :datetime="row.date">{{ formatDate(row.date) }}</time>
              <span class="registry-status" :class="row.status.tone && `registry-tone-${row.status.tone}`">{{ row.status.label }}</span>
              <span v-if="row.mark && !row.scheduled" class="registry-help">Вне текущего графика</span>
              <span v-if="row.originalDate" class="registry-help">Перенесено с {{ formatDate(row.originalDate) }}</span>
              <ChevronDown v-if="row.canOpen" class="control-schedule-chevron" :size="15" aria-hidden="true" />
            </component>
            <button v-if="row.configured" type="button" class="registry-button control-schedule-remove"
              :aria-label="`Убрать дату ${formatDate(row.date)} из графика`" :disabled="props.disabled" @click="removeCustomDate(row.date)"><X :size="15" aria-hidden="true" /></button>
          </div>
          <div v-if="row.canOpen && openDate === row.date" class="control-schedule-editor">
            <template v-if="row.movable">
              <div class="control-schedule-reschedule">
                <label class="registry-field">
                  <span>Плановая дата контроля</span>
                  <input name="control-planned-date" type="date" :value="plannedDate" :readonly="props.disabled"
                    :min="props.controlDate || DATE_LIMITS.MIN" :max="props.deadline || DATE_LIMITS.MAX"
                    @input="updatePlannedDate($event.target.value)" @keydown.enter.prevent="moveCheckpoint(row)" />
                </label>
                <button type="button" class="registry-button control-schedule-move" :disabled="props.disabled || !plannedDate || plannedDate === row.date"
                  @click="moveCheckpoint(row)">Перенести</button>
                <button v-if="row.originalDate" type="button" class="registry-button control-schedule-cancel-move" :disabled="props.disabled"
                  @click="cancelMove(row)">Отменить перенос</button>
              </div>
              <p class="registry-help">Изменится только эта дата. Остальной график сохранится.</p>
              <p v-if="row.originalDate && !inControlPeriod(row.originalDate)" class="registry-help">
                Исходная дата вне периода контроля. При отмене переноса отметка сохранится в истории.
              </p>
              <p v-if="moveError" class="control-schedule-error" role="alert">{{ moveError }}</p>
            </template>
            <label class="registry-field control-schedule-actual-date">
              <span>Фактическая дата исполнения</span>
              <input name="control-actual-date" type="date" :readonly="props.disabled" :required="Boolean(marksByDate.get(row.date)?.text.trim())"
                :value="actualDateDraft(row).date" :min="DATE_LIMITS.MIN" :max="DATE_LIMITS.MAX"
                @input="updateActualDate(row, $event.target.value)" />
            </label>
            <label class="registry-field control-schedule-mark">
              <span>Отметка об исполнении</span>
              <textarea rows="2" :readonly="props.disabled" :maxlength="CONTROL_MARK_LIMIT" :value="marksByDate.get(row.date)?.text ?? ''"
                :aria-label="`Отметка об исполнении за ${formatDate(row.date)}`" @input="updateMark(row, $event.target.value)" />
            </label>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.control-schedule { display: grid; gap: 12px; margin-block: 22px; padding: 16px; border: 1px solid var(--border); border-radius: 14px; background: var(--grouped); }
.control-schedule h3 { font-size: 14px; font-weight: 600; }
.control-schedule h4 { font-size: 12px; font-weight: 600; }
.control-schedule-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 215px), 1fr)); gap: 12px; min-width: 0; border: 0; margin: 0; padding: 0; }
.control-schedule-custom, .control-schedule-month, .control-schedule-navigation, .control-schedule-row, .control-schedule-row-details { display: flex; align-items: center; gap: 8px; min-width: 0; }
.control-schedule-custom { align-items: end; flex-wrap: wrap; }
.control-schedule-custom label { flex: 1 1 130px; }
.control-schedule-custom .registry-button { min-height: 40px; }
.control-schedule-preview { min-width: 0; }
.control-schedule-month { justify-content: space-between; flex-wrap: wrap; margin-bottom: 8px; }
.control-schedule-navigation { gap: 5px; }
.control-schedule-navigation .registry-button, .control-schedule-navigation input { min-height: 34px; padding: 5px 8px; }
.control-schedule-empty { padding-block: 8px; }
.control-schedule-warning { color: var(--registry-warning); font-size: 12px; }
.control-schedule-list { margin: 0; padding: 0; overflow: hidden; list-style: none; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); }
.control-schedule-list li + li { border-top: 1px solid var(--border); }
.control-schedule-row { gap: 0; }
.control-schedule-row-details { flex: 1; flex-wrap: wrap; padding: 9px 10px; min-height: 36px; border: 0; color: var(--text); background: transparent; text-align: left; font-size: 12px; }
.control-schedule-row-details time { font-variant-numeric: tabular-nums; }
button.control-schedule-row-details:hover, button.control-schedule-row-details[aria-expanded='true'] { background: var(--raised); }
button.control-schedule-row-details:focus-visible { outline-offset: -3px; }
.control-schedule-chevron { margin-left: auto; color: var(--muted); }
[aria-expanded='true'] .control-schedule-chevron { transform: rotate(180deg); }
.control-schedule-row .control-schedule-remove { min-height: 32px; padding: 5px 7px; margin-right: 4px; border-color: transparent; color: var(--muted); }
.control-schedule-editor { display: grid; gap: 10px; padding: 10px 12px 12px; }
.control-schedule-reschedule { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; }
.control-schedule-reschedule .registry-field { flex: 1 1 190px; }
.control-schedule-reschedule .registry-button { min-height: 40px; }
.control-schedule-actual-date { max-width: 280px; }
.control-schedule-error { color: var(--error); font-size: 12px; }
.control-schedule-mark textarea { min-height: 65px; }
</style>
