<script setup>
import icon from '../../public/icons/app.svg';
import { useAppStore } from '../app/appStore.js';

defineProps({ size: { type: Number, default: 34 } });
const store = useAppStore();
</script>

<template>
  <img v-if="store.appearanceStyle === 'standard'" :src="icon" :width="size" :height="size" class="app-icon" alt="" aria-hidden="true" draggable="false" />
  <svg v-else class="app-icon app-emblem" :data-emblem-style="store.appearanceStyle" :width="size" :height="size" viewBox="0 0 40 40"
    fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <g v-if="store.appearanceStyle === 'gzhel'">
      <path class="emblem-field" d="M20 1.8c3.3 0 4.5 2.1 7.3 2.5 4.3.6 7.6 3.8 8.4 8 .5 2.7 2.5 4.5 2.5 7.7s-2 5-2.5 7.7c-.8 4.2-4.1 7.4-8.4 8-2.8.4-4 2.5-7.3 2.5s-4.5-2.1-7.3-2.5c-4.3-.6-7.6-3.8-8.4-8-.5-2.7-2.5-4.5-2.5-7.7s2-5 2.5-7.7c.8-4.2 4.1-7.4 8.4-8 2.8-.4 4-2.5 7.3-2.5Z" />
      <g class="emblem-ink">
        <path d="M19.8 19.8c-4-3.1-4.8-6.2-3.3-8.9 1-1.9 3.1-3.9 3.4-6 2.1 2.5 4.3 6 3.9 8.8-.3 2.8-1.8 4.7-4 6.1Zm-2 1.3C12.6 23 8.4 20 7.3 14.5c5.1-.9 9.5 1.9 10.5 6.6Zm4.5 0c1-4.7 5.4-7.5 10.5-6.6-1.1 5.5-5.3 8.5-10.5 6.6Z" />
        <path d="M19.4 32.8c.5-3 .6-5.4.1-9.4l1.9-.1c.6 3.6.3 7.2-.6 9.7Zm-.1-3.4c-4 .6-8.1-1.8-9.7-5.6 4.3-.7 8.2 1.6 9.7 5.6Zm1.6-.6c1.8-3.5 5.1-5.7 9.2-5.4-1.7 3.7-4.9 6.2-9.2 5.4Z" />
      </g>
      <circle class="emblem-detail" cx="20" cy="21.8" r="2.2" />
      <path class="emblem-detail" d="M10.2 12.7c-2-1.6-.8-3.9 2.1-4.3 1 2.6.1 4.4-2.1 4.3Zm19.6 0c2-1.6.8-3.9-2.1-4.3-1 2.6-.1 4.4 2.1 4.3Z" />
    </g>
    <g v-else-if="store.appearanceStyle === 'cyberpunk'" stroke-linejoin="miter" stroke-linecap="square">
      <path class="emblem-field" d="M2.5 11.5 11.5 2.5h26v25l-10 10h-25Z" />
      <path class="emblem-trace" stroke-width="1.7" d="M6.5 13.5 11 9h4m14 20h2v-6m-21 8.5h8" />
      <path class="emblem-ink" d="M8.7 16.3h5.2l3.1 6.3 8.1-11.2h6.2L19 28h-4.5Z" />
      <path class="emblem-detail" d="M27.7 5.4h2.7v2.7h-2.7Zm4.3 0h2.7v2.7H32ZM5.3 24h2.5v4.6H5.3Z" />
    </g>
    <g v-else-if="store.appearanceStyle === 'witcher'" stroke-linejoin="bevel">
      <path class="emblem-field" d="m20 1.6 15 5.2-1.4 16.6-5.2 7.4-8.4 7.6-8.4-7.6-5.2-7.4L5 6.8Z" />
      <path class="emblem-ink" d="m7.8 6.7 9.5 6.2h5.4l9.5-6.2-2.4 10.8 2.4 1.1-6.1 5.6-1.8 5.1-4.3 4.6-4.3-4.6-1.8-5.1-6.1-5.6 2.4-1.1Z" />
      <path class="emblem-cut" d="m10.1 10.2 3.2 6.5 2.8-2.7Zm19.8 0L23.9 14l2.8 2.7ZM10.4 18.3l6.9 1.7.9 3.1-4.2-1.6Zm19.2 0L26 21.5l-4.2 1.6.9-3.1ZM17.3 26.9h5.4L20 30.6Z" />
      <path class="emblem-trace" stroke-width="1.3" d="m16.5 10.8 3.5-4.2 3.5 4.2" />
    </g>
    <g v-else-if="store.appearanceStyle === 'harry-potter'">
      <path class="emblem-field" d="M4 4.5c5.8 1.7 10.9.8 16-2.8 5.1 3.6 10.2 4.5 16 2.8v15.3c0 7.8-6.7 13.4-16 18.3C10.7 33.2 4 27.6 4 19.8Z" />
      <path class="emblem-trace" stroke-width="1.3" d="M7 8.2v11.6c0 5.5 4.6 10.5 13 15.1 8.4-4.6 13-9.6 13-15.1V8.2" />
      <path class="emblem-ink" d="M9 16.6c4.3-.5 7.7.6 10.3 3.1V29c-3-2.6-6.2-3.8-10.3-3.7Zm22 0c-4.3-.5-7.7.6-10.3 3.1V29c3-2.6 6.2-3.8 10.3-3.7Z" />
      <path class="emblem-detail" d="m20 6.1 1.2 3.6 3.4 1.4-3.4 1.4-1.2 3.6-1.3-3.6-3.3-1.4 3.3-1.4Zm7.6 4.8.6 1.5 1.5.6-1.5.7-.6 1.5-.7-1.5-1.5-.7 1.5-.6Z" />
    </g>
  </svg>
</template>

<style scoped>
.app-icon { display: block; flex-shrink: 0; object-fit: contain; }
.app-emblem { --emblem-field: var(--panel); --emblem-ink: var(--accent); --emblem-detail: var(--ornament-ink); --emblem-edge: var(--accent); }
.app-emblem[data-emblem-style='witcher'], .app-emblem[data-emblem-style='harry-potter'] {
  --emblem-field: var(--nav-selected);
  --emblem-ink: var(--nav-selected-ink);
  --emblem-edge: var(--ornament-ink);
}
.app-emblem[data-emblem-style='witcher'] { --emblem-detail: #dbc3a4; }
.app-emblem[data-emblem-style='harry-potter'] { --emblem-detail: #eed08a; }
.emblem-field { fill: var(--emblem-field); stroke: var(--emblem-edge); stroke-width: 1.4; }
.emblem-ink { fill: var(--emblem-ink); }
.emblem-detail { fill: var(--emblem-detail); }
.emblem-trace { stroke: var(--emblem-detail); }
.emblem-cut { fill: var(--emblem-field); }
@media (forced-colors: active) {
  .app-emblem[data-emblem-style] { --emblem-field: Canvas; --emblem-ink: CanvasText; --emblem-edge: CanvasText; --emblem-detail: CanvasText; forced-color-adjust: none; }
}
</style>
