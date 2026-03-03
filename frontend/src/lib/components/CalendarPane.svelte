<script>
  import ContentPane from './ContentPane.svelte';
  import PaneColumn from './PaneColumn.svelte';
  import CalendarView from './CalendarView.svelte';
  import ItemTypeFilterStrip from './ItemTypeFilterStrip.svelte';

  export let trips = [];
  export let standaloneItems = [];
  export let attendeeStandaloneItems = [];
  export let companionStandaloneItems = [];
  export let friendsTrips = [];
  export let companions = [];
  export let visibleItemTypes = { trip: true, flight: true, hotel: true, transportation: true, car_rental: true, event: true };
  export let isMobileView = false;

  // callbacks
  export let onToggleItemType = null; // (type) => void

  // local state — companion filter is only used by CalendarPane
  let selectedCompanionIds = new Set();

  let showCalendarFilterSheet = false;

  $: sharingCompanions = companions.filter(c => c.reversePermissionLevel && c.reversePermissionLevel !== 'none');
  $: filteredCompanionTrips = friendsTrips.filter(t => t.user && selectedCompanionIds.has(t.user.id));
  $: filteredCompanionItems = companionStandaloneItems.filter(i => i.user && selectedCompanionIds.has(i.user.id));

  function toggleCompanion(uid) {
    const next = new Set(selectedCompanionIds);
    if (next.has(uid)) next.delete(uid); else next.add(uid);
    selectedCompanionIds = next;
  }
</script>

<ContentPane columns={isMobileView ? 1 : 4} mobileTop="0">
  <!-- Filter column — desktop only -->
  {#if !isMobileView}
  <PaneColumn span={1}>
    <h3 class="pane-title">Filters</h3>
    <ItemTypeFilterStrip {visibleItemTypes} onToggle={onToggleItemType} />

    {#if sharingCompanions.length > 0}
      <h4 class="filter-section-label">Friends</h4>
      <div class="companion-filter-list">
        {#each sharingCompanions as c (c.companionUser.id)}
          {@const uid = c.companionUser.id}
          {@const selected = selectedCompanionIds.has(uid)}
          {@const initials = ((c.companionUser.firstName?.[0] ?? '') + (c.companionUser.lastName?.[0] ?? '')).toUpperCase() || c.companionUser.email?.[0]?.toUpperCase() || '?'}
          {@const name = ((c.companionUser.firstName ?? '') + ' ' + (c.companionUser.lastName ?? '')).trim() || c.companionUser.email}
          <button
            class="companion-filter-btn"
            class:companion-filter-selected={selected}
            title={name}
            on:click={() => toggleCompanion(uid)}
          >
            <span class="companion-filter-avatar">{initials}</span>
            <span class="companion-filter-name">{name}</span>
          </button>
        {/each}
      </div>
    {/if}
  </PaneColumn>
  {/if}

  <!-- Calendar column -->
  <PaneColumn span={isMobileView ? 4 : 3} divider={!isMobileView}>
    {#if isMobileView}
      <div class="calendar-mobile-header">
        <h3 class="pane-title" style="margin:0">Calendar</h3>
        <button class="calendar-filter-btn" on:click={() => showCalendarFilterSheet = true} title="Filters">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>
          Filters
        </button>
      </div>
    {:else}
      <h3 class="pane-title">Calendar</h3>
    {/if}
    <CalendarView
      {trips}
      standaloneItems={[...standaloneItems, ...attendeeStandaloneItems]}
      companionTrips={filteredCompanionTrips}
      companionStandaloneItems={filteredCompanionItems}
      {visibleItemTypes}
    />
  </PaneColumn>
</ContentPane>

<!-- Mobile calendar filter bottom sheet -->
{#if isMobileView && showCalendarFilterSheet}
  <div class="edit-sheet-backdrop" on:click={() => showCalendarFilterSheet = false}></div>
  <div class="edit-sheet edit-sheet-open">
    <div class="filter-sheet-handle"></div>
    <div class="edit-sheet-scroll">
      <div class="filter-sheet-header">
        <h3 class="pane-title" style="margin:0">Filters</h3>
        <button class="close-btn" on:click={() => showCalendarFilterSheet = false}>✕</button>
      </div>
      <ItemTypeFilterStrip {visibleItemTypes} onToggle={onToggleItemType} />
      {#if sharingCompanions.length > 0}
        <h4 class="filter-section-label" style="margin-top: var(--spacing-lg)">Friends</h4>
        <div class="companion-filter-list">
          {#each sharingCompanions as c (c.companionUser.id)}
            {@const uid = c.companionUser.id}
            {@const selected = selectedCompanionIds.has(uid)}
            {@const initials = ((c.companionUser.firstName?.[0] ?? '') + (c.companionUser.lastName?.[0] ?? '')).toUpperCase() || c.companionUser.email?.[0]?.toUpperCase() || '?'}
            {@const name = ((c.companionUser.firstName ?? '') + ' ' + (c.companionUser.lastName ?? '')).trim() || c.companionUser.email}
            <button
              class="companion-filter-btn"
              class:companion-filter-selected={selected}
              title={name}
              on:click={() => toggleCompanion(uid)}
            >
              <span class="companion-filter-avatar">{initials}</span>
              <span class="companion-filter-name">{name}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .calendar-mobile-header {
    display: none;
  }

  @media (max-width: 640px) {
    .calendar-mobile-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 0 var(--spacing-md);
    }
  }

  .calendar-filter-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-md);
    border: 1px solid var(--glass-border-dark);
    border-radius: var(--radius-md);
    background: var(--glass-bg-medium);
    color: var(--dark-text);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .calendar-filter-btn:hover {
    background: var(--white);
  }

  .filter-section-label {
    margin: var(--spacing-lg) 0 var(--spacing-sm);
  }

  .companion-filter-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .companion-filter-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-sm);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .companion-filter-btn:hover {
    background: var(--glass-bg-light);
  }

  .companion-filter-btn.companion-filter-selected {
    background: var(--glass-bg-medium);
  }

  .companion-filter-avatar {
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: transparent;
    border: 2px solid var(--primary-color);
    color: var(--primary-color);
    font-size: 0.65rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
  }

  .companion-filter-btn.companion-filter-selected .companion-filter-avatar {
    background: var(--primary-color);
    color: white;
  }

  .companion-filter-name {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--gray-dark);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 0.15s;
  }

  .companion-filter-btn.companion-filter-selected .companion-filter-name {
    color: var(--dark-text);
    font-weight: 600;
  }

  @media (max-width: 640px) {
    .filter-sheet-handle {
      width: 36px;
      height: 4px;
      background: var(--grey-300);
      border-radius: 2px;
      margin: 0 auto var(--spacing-lg);
    }

    .filter-sheet-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--spacing-lg);
    }

    .edit-sheet-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
      z-index: calc(var(--z-modal) - 1);
    }

    .edit-sheet {
      display: block;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: var(--z-modal);
      background: var(--white);
      border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      padding: var(--spacing-lg) var(--spacing-2xl) 0;
      box-shadow: var(--shadow-top);
      max-height: 80vh;
      transform: translateY(100%);
      transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
      width: 100%;
      box-sizing: border-box;
      overflow: hidden;
    }

    .edit-sheet.edit-sheet-open {
      transform: translateY(0);
    }

    .edit-sheet-scroll {
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      max-height: calc(80vh - 60px);
      padding-bottom: calc(90px + env(safe-area-inset-bottom, 0px));
      width: 100%;
      box-sizing: border-box;
      scrollbar-width: none;
    }

    .edit-sheet-scroll::-webkit-scrollbar {
      display: none;
    }
  }
</style>
