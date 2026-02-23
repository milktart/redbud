<script>
  export let columns = 1; // 1 | 2 | 3 | 4
</script>

<div
  class="content-pane"
  style="--active-cols: {columns};"
>
  <slot />
</div>

<style>
  .content-pane {
    position: absolute;
    top: 2.5vh;
    bottom: 2.5vh;
    left: calc(2.5vh + 50px + 2.5vh);
    width: calc(var(--pane-col-unit) * var(--active-cols));
    background: var(--glass-bg-light);
    backdrop-filter: var(--blur-lg);
    -webkit-backdrop-filter: var(--blur-lg);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-xl);
    z-index: var(--z-fixed);
    overflow: hidden;
    display: flex;
    flex-direction: row;
    box-sizing: border-box;
    transition: width 0.3s ease-in-out;
  }
</style>
