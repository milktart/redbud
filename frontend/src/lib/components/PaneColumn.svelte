<script>
  import { onMount, onDestroy } from 'svelte';

  export let span = 1;
  export let divider = false;

  let columnEl;
  let zoom = 1;
  let ro;
  let rafId;

  onMount(() => {
    ro = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const w = entry.contentRect.width;
        zoom = w < 275 ? w / 275 : 1;
      });
    });
    ro.observe(columnEl);
  });

  onDestroy(() => {
    if (ro) ro.disconnect();
    cancelAnimationFrame(rafId);
  });

  $: scalerStyle = zoom < 1
    ? `transform: scale(${zoom}); width: ${(1 / zoom) * 100}%; transform-origin: top left;`
    : '';

  $: paddingStyle = `padding: calc(var(--spacing-2xl) * ${zoom});`;
</script>

<div
  bind:this={columnEl}
  class="pane-column"
  class:divider
  style="width: calc(var(--pane-col-unit) * {span}); {paddingStyle}"
>
  <div class="pane-column-scaler" style={scalerStyle}>
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
    flex-shrink: 0;
  }
</style>
