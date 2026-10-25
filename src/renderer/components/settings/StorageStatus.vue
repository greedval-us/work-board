<script setup>
defineProps({ status: { type: Object, default: null }, loading: { type: Boolean, default: false } });
</script>

<template>
  <section class="settings-section" aria-labelledby="storage-title">
    <div class="section-heading">
      <h2 id="storage-title">Локальные данные</h2>
      <p>Данные хранятся на компьютере и доступны без подключения к интернету.</p>
    </div>
    <dl class="details-list">
      <div><dt>Состояние</dt><dd role="status">{{ loading ? 'Подключение…' : status?.ready ? 'Хранилище подключено' : 'Хранилище недоступно' }}</dd></div>
      <template v-if="status?.ready">
        <div><dt>Хранилище</dt><dd>{{ status.engine }} {{ status.sqliteVersion }}</dd></div>
        <div><dt>Расположение</dt><dd class="file-path">{{ status.filePath }}</dd></div>
      </template>
    </dl>
  </section>
</template>
