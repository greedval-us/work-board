<script setup>
defineProps({
  message: { type: String, required: true },
  filePath: { type: String, required: true },
});
</script>

<template>
  <div class="registry-export-warning" role="status">
    <p>{{ message }} Не удалось открыть файл автоматически.</p>
    <p v-if="filePath" class="registry-export-path" tabindex="0">{{ filePath }}</p>
  </div>
</template>
