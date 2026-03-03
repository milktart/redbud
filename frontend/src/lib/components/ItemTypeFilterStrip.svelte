<script>
  export let visibleItemTypes = {
    trip: true, flight: true, hotel: true,
    transportation: true, car_rental: true, event: true
  };
  export let onToggle = null; // (type) => void — called when a filter button is clicked
  export let showTrip = true; // whether to show the "trip" filter button
</script>

<div class="type-filter-strip">
  {#if showTrip}
    <button
      class="type-filter-btn"
      class:type-filter-off={!visibleItemTypes.trip}
      style="--filter-color: #3b82f6"
      on:click={() => onToggle && onToggle('trip')}
      title="Trip"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M303.5-376.5Q327-400 360-400t56.5 23.5Q440-353 440-320t-23.5 56.5Q393-240 360-240t-56.5-23.5Q280-287 280-320t23.5-56.5ZM480-400h240q33 0 56.5 23.5T800-320v280h-80v-80H240v80h-80v-400h80v240h240v-200Zm150-40L512-654 406-548l10 68-30 30-47-88-88-48 30-30 68 9 106-106-215-117 38-38 264 68 108-108q12-12 29-12t29 12q12 12 12 29t-12 29L600-742l68 264-38 38Zm90 240v-120H560v120h160Zm-160 0v-120 120Z"/></svg>
    </button>
  {/if}
  <button
    class="type-filter-btn"
    class:type-filter-off={!visibleItemTypes.flight}
    style="--filter-color: #10b981"
    on:click={() => onToggle && onToggle('flight')}
    title="Flight"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>
  </button>
  <button
    class="type-filter-btn"
    class:type-filter-off={!visibleItemTypes.hotel}
    style="--filter-color: #f59e0b"
    on:click={() => onToggle && onToggle('hotel')}
    title="Hotel"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3m12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9a4 4 0 0 0-4-4"/></svg>
  </button>
  <button
    class="type-filter-btn"
    class:type-filter-off={!visibleItemTypes.transportation}
    style="--filter-color: #8b5cf6"
    on:click={() => onToggle && onToggle('transportation')}
    title="Transportation"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3M6 10V6h12v4z"/></svg>
  </button>
  <button
    class="type-filter-btn"
    class:type-filter-off={!visibleItemTypes.car_rental}
    style="--filter-color: #ec4899"
    on:click={() => onToggle && onToggle('car_rental')}
    title="Car Rental"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h12v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-8zM6.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3M5 11l1.5-4.5h11L19 11z"/></svg>
  </button>
  <button
    class="type-filter-btn"
    class:type-filter-off={!visibleItemTypes.event}
    style="--filter-color: #06b6d4"
    on:click={() => onToggle && onToggle('event')}
    title="Event"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12h-5v5h5zM16 1v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V1zm3 18H5V8h14z"/></svg>
  </button>
</div>

<style>
  .type-filter-strip {
    display: flex;
    flex-direction: row;
    gap: var(--spacing-xs);
    width: 100%;
    justify-content: center;
  }

  .type-filter-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1 1 0;
    aspect-ratio: 1;
    max-width: 48px;
    border-radius: var(--radius-sm);
    border: none;
    background: color-mix(in srgb, var(--filter-color) 15%, transparent);
    color: var(--filter-color);
    cursor: pointer;
    transition: opacity 0.15s, background 0.15s;
    padding: 0;
    min-width: 0;
  }

  .type-filter-btn svg {
    width: 55%;
    height: 55%;
    display: block;
  }

  .type-filter-btn:hover {
    background: color-mix(in srgb, var(--filter-color) 25%, transparent);
  }

  .type-filter-btn.type-filter-off {
    opacity: 0.3;
    background: var(--glass-bg-light);
    color: var(--text-muted);
  }
</style>
