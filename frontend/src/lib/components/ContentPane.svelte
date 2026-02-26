<script>
  export let columns = 1; // 1 | 2 | 3 | 4
  export let mobileTop = '2.5vh';
</script>

<div
  class="content-pane"
  style="--active-cols: {columns}; --mobile-top: {mobileTop};"
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

  :global(.content-pane h4) {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--gray-text);
    margin: 0;
  }

  @media (max-width: 640px) {
    .content-pane {
      top: var(--mobile-top, 2.5vh);
      bottom: calc(48px + var(--spacing-sm) * 2 + env(safe-area-inset-bottom, 0px));
      left: 0;
      right: 0;
      width: auto;
      border-radius: 0;
    }
  }
</style>
