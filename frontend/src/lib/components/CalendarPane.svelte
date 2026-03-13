<script>
  import { onMount } from 'svelte';
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

  // ── External event feeds ──────────────────────────────────────────────────
  const EVENT_FEEDS = [
    {
      id: 'thelagay',
      label: 'theLAgay',
      url: 'https://thelagay.com/api/apps/69b22cbb487837c2c56dcad9/entities/Event?q=%7B%22status%22:%22approved%22%7D&sort=-event_date&limit=500'
    }
  ];

  // Which feeds are toggled on
  let enabledFeeds = new Set();
  // Raw calendar events per feed id, loaded once
  let feedEvents = {}; // { [feedId]: calendarEvent[] }
  let feedLoading = {}; // { [feedId]: bool }
  let feedError = {}; // { [feedId]: string|null }

  const ALLOWED_TAGS = new Set(['Afters', 'Darkroom', 'Outdoor', 'Warehouse']);
  const EXCLUDED_TAGS = new Set(['Day Party', 'Drag']);

  function parseFeedDate(str) {
    if (!str) return null;
    const [year, month, day] = str.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function buildFeedEvents(feedId, rawEvents) {
    return rawEvents.map(evt => {
      const startDate = parseFeedDate(evt.event_date);
      const endDate = parseFeedDate(evt.event_end_date) || startDate;
      return {
        id: `ext-${feedId}-${evt._id || Math.random()}`,
        type: 'external',
        name: evt.party_name || evt.name || evt.title || 'Community Event',
        startDate,
        endDate,
        colorClass: 'color-external',
        tentative: false,
        external: true,
        data: evt
      };
    }).filter(e => {
      if (!e.startDate) return false;
      const tags = e.data.tags;
      if (tags && tags.some(t => EXCLUDED_TAGS.has(t))) return false;
      if (!tags || tags.length === 0) return true;
      return tags.some(t => ALLOWED_TAGS.has(t));
    });
  }

  async function loadFeed(feed) {
    if (feedEvents[feed.id]) return; // already loaded
    feedLoading = { ...feedLoading, [feed.id]: true };
    feedError = { ...feedError, [feed.id]: null };
    try {
      const res = await fetch(feed.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const raw = Array.isArray(json) ? json : (json.data || json.results || json.items || []);
      feedEvents = { ...feedEvents, [feed.id]: buildFeedEvents(feed.id, raw) };
    } catch (err) {
      feedError = { ...feedError, [feed.id]: err.message || 'Failed to load' };
    } finally {
      feedLoading = { ...feedLoading, [feed.id]: false };
    }
  }

  function toggleFeed(feed) {
    const next = new Set(enabledFeeds);
    if (next.has(feed.id)) {
      next.delete(feed.id);
    } else {
      next.add(feed.id);
      loadFeed(feed); // fetch on first enable
    }
    enabledFeeds = next;
  }

  // Flatten all enabled feed events into one array for CalendarView
  $: externalCalendarEvents = EVENT_FEEDS
    .filter(f => enabledFeeds.has(f.id) && feedEvents[f.id])
    .flatMap(f => feedEvents[f.id]);
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

    <h4 class="filter-section-label">Events</h4>
    <div class="companion-filter-list">
      {#each EVENT_FEEDS as feed}
        {@const selected = enabledFeeds.has(feed.id)}
        <button
          class="companion-filter-btn"
          class:companion-filter-selected={selected}
          title={feed.label}
          on:click={() => toggleFeed(feed)}
        >
          <span class="companion-filter-avatar feed-avatar">
            {#if feedLoading[feed.id]}
              <span class="feed-spinner"></span>
            {:else}
              ★
            {/if}
          </span>
          <span class="companion-filter-name">{feed.label}</span>
          {#if feedError[feed.id]}
            <span class="feed-error-dot" title={feedError[feed.id]}>!</span>
          {/if}
        </button>
      {/each}
    </div>
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
      {externalCalendarEvents}
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

      <h4 class="filter-section-label" style="margin-top: var(--spacing-lg)">Events</h4>
      <div class="companion-filter-list">
        {#each EVENT_FEEDS as feed}
          {@const selected = enabledFeeds.has(feed.id)}
          <button
            class="companion-filter-btn"
            class:companion-filter-selected={selected}
            title={feed.label}
            on:click={() => toggleFeed(feed)}
          >
            <span class="companion-filter-avatar feed-avatar">
              {#if feedLoading[feed.id]}
                <span class="feed-spinner"></span>
              {:else}
                ★
              {/if}
            </span>
            <span class="companion-filter-name">{feed.label}</span>
            {#if feedError[feed.id]}
              <span class="feed-error-dot" title={feedError[feed.id]}>!</span>
            {/if}
          </button>
        {/each}
      </div>
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

  .feed-avatar {
    position: relative;
    border: none;
    background: transparent;
    font-size: 0.75rem;
    color: transparent;
    -webkit-text-fill-color: transparent;
    background-image: linear-gradient(to bottom right, #f8717190, #fb923c90, #fbbf2490, #4ade8090, #60a5fa90, #818cf890, #c084fc90);
    -webkit-background-clip: text;
    background-clip: text;
  }

  .feed-avatar::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    padding: 2px;
    background: linear-gradient(to bottom right, #f8717190, #fb923c90, #fbbf2490, #4ade8090, #60a5fa90, #818cf890, #c084fc90);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }

  .companion-filter-btn.companion-filter-selected .feed-avatar {
    background: transparent;
    background-image: linear-gradient(to bottom right, #f8717190, #fb923c90, #fbbf2490, #4ade8090, #60a5fa90, #818cf890, #c084fc90);
    -webkit-background-clip: border-box;
    background-clip: border-box;
    color: white;
    -webkit-text-fill-color: white;
    text-shadow: 0 0 4px rgba(0,0,0,0.3);
  }

  .companion-filter-btn.companion-filter-selected .feed-avatar::before {
    -webkit-mask: none;
    mask: none;
  }

  .feed-spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid rgba(251, 113, 133, 0.3);
    border-top-color: rgba(251, 113, 133, 0.9);
    border-radius: 50%;
    animation: feed-spin 0.7s linear infinite;
  }

  @keyframes feed-spin {
    to { transform: rotate(360deg); }
  }

  .feed-error-dot {
    margin-left: auto;
    font-size: 0.7rem;
    font-weight: 700;
    color: #dc2626;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 50%;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
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
