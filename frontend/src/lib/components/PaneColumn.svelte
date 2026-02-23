<script>
  import { onMount, onDestroy } from 'svelte';

  export let span = 1;
  export let divider = false;

  let columnEl;
  let zoom = 1;
  let ro;

  onMount(() => {
    ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      zoom = w < 300 ? w / 300 : 1;
    });
    ro.observe(columnEl);
  });

  onDestroy(() => {
    if (ro) ro.disconnect();
  });
</script>

<div
  bind:this={columnEl}
  class="pane-column"
  class:divider
  style="width: calc(var(--pane-col-unit) * {span});"
>
  <div class="pane-column-scaler" style="zoom: {zoom};">
    <slot />
  </div>
</div>

<style>
  .pane-column {
    flex: 0 0 auto;
    min-width: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--spacing-2xl);
    box-sizing: border-box;
  }
  .pane-column.divider {
    border-left: 1px solid var(--grey-200);
  }
  .pane-column-scaler {
    transform-origin: top left;
  }
</style>
