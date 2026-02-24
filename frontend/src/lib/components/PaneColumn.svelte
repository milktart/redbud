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
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    padding: var(--spacing-2xl);
    box-sizing: border-box;
  }

  @media (max-width: 640px) {
    .pane-column {
      flex: 1 1 auto;
      width: 100% !important;
      padding-bottom: calc(var(--spacing-2xl) + 90px + env(safe-area-inset-bottom, 0px));
      scrollbar-width: none;
    }

    .pane-column::-webkit-scrollbar {
      display: none;
    }
  }
  .pane-column.divider {
    border-left: 1px solid var(--grey-200);
  }
  .pane-column-scaler {
    transform-origin: top left;
  }
</style>
