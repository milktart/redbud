<script>
  import ContentPane from './ContentPane.svelte';
  import PaneColumn from './PaneColumn.svelte';
  import ItemTypeFilterStrip from './ItemTypeFilterStrip.svelte';
  import AttendeeManager from './AttendeeManager.svelte';
  import PnrImportWidget from './PnrImportWidget.svelte';
  import { getItemIcon, getItemLabel, getFlightDuration, getItemDateTime, formatTime24, formatDate, getTripNights, formatDateGroupHeader, getMonthYear, getOwnerName } from '../utils/itemHelpers.js';

  export let friendsTrips = [];
  export let companions = [];
  export let companionStandaloneItems = [];
  export let attendeeStandaloneItems = [];
  export let visibleItemTypes = { trip: true, flight: true, hotel: true, transportation: true, car_rental: true, event: true };
  export let isMobileView = false;

  // callbacks
  export let onToggleItemType = null; // (type) => void
  export let getFriendsTimelineEntries = null; // (Set) => entries[]
  export let onTripClick = null; // (trip) => void — called when a trip card is clicked

  // trip edit form (only shown for trips the current user created)
  export let selectedTrip = null;
  export let editTripForm = {};
  export let formAttendees = [];
  export let formAttendeesLoading = false;
  export let attendeeEmailInput = '';
  export let attendeeSuggestions = [];
  export let attendeeSuggestionsLoading = false;
  export let attendeeAddLoading = false;
  export let attendeeAddError = '';
  export let loyaltyPrograms = [];
  export let onCloseTripEditForm = null;
  export let onUpdateTrip = null;
  export let onDeleteTrip = null;
  export let onAttendeeInput = null;
  export let onDismissSuggestions = null;
  export let onAddAttendee = null;
  export let onRemoveAttendee = null;
  export let onSelectAttendeeSuggestion = null;
  export let onPnrImport = null;

  // filter pane/sheet toggle: local to this component
  let showFriendsFilterPane = false;
  let showFriendsFilterSheet = false;
  // exported so parent can bind and react to companion filter changes (e.g. map updates)
  export let selectedFriendsCompanionIds = new Set();

  $: sharingFriendsCompanions = companions.filter(c => c.reversePermissionLevel && c.reversePermissionLevel !== 'none');
  $: showFriendsFilter = !isMobileView && showFriendsFilterPane;
  $: showEditColumn = !!selectedTrip && !isMobileView;
  $: columnCount = (showFriendsFilter ? 1 : 0) + 1 + (showEditColumn ? 1 : 0);

  function toggleFriendsCompanion(uid) {
    const next = new Set(selectedFriendsCompanionIds);
    if (next.has(uid)) next.delete(uid); else next.add(uid);
    selectedFriendsCompanionIds = next;
  }
</script>

<ContentPane columns={columnCount} mobileTop="30vh">
  <!-- Filter column — desktop only -->
  {#if showFriendsFilter}
    <PaneColumn span={1}>
      <h3 class="pane-title">Filters</h3>
      <ItemTypeFilterStrip {visibleItemTypes} onToggle={onToggleItemType} />
      {#if sharingFriendsCompanions.length > 0}
        <h4 class="filter-section-label">Friends</h4>
        <div class="companion-filter-list">
          {#each sharingFriendsCompanions as c (c.companionUser.id)}
            {@const uid = c.companionUser.id}
            {@const selected = selectedFriendsCompanionIds.has(uid)}
            {@const initials = ((c.companionUser.firstName?.[0] ?? '') + (c.companionUser.lastName?.[0] ?? '')).toUpperCase() || c.companionUser.email?.[0]?.toUpperCase() || '?'}
            {@const name = ((c.companionUser.firstName ?? '') + ' ' + (c.companionUser.lastName ?? '')).trim() || c.companionUser.email}
            <button
              class="companion-filter-btn"
              class:companion-filter-selected={selected}
              title={name}
              on:click={() => toggleFriendsCompanion(uid)}
            >
              <span class="companion-filter-avatar">{initials}</span>
              <span class="companion-filter-name">{name}</span>
            </button>
          {/each}
        </div>
      {/if}
    </PaneColumn>
  {/if}

  <PaneColumn span={1} divider={showFriendsFilter}>
    {#if isMobileView}
      <div class="calendar-mobile-header">
        <h3 class="pane-title" style="margin:0">Friends' Trips</h3>
        <button class="calendar-filter-btn" on:click={() => showFriendsFilterSheet = true} title="Filters">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>
          Filters
        </button>
      </div>
    {:else}
      <div class="pane-title-row">
        <h3 class="pane-title" style="margin:0">Friends' Trips</h3>
        <button class="calendar-filter-btn" class:calendar-filter-btn-active={showFriendsFilterPane} on:click={() => showFriendsFilterPane = !showFriendsFilterPane} title="Filters">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>
          Filters
        </button>
      </div>
    {/if}

    {#key friendsTrips.length + companionStandaloneItems.length + attendeeStandaloneItems.length + selectedFriendsCompanionIds.size + JSON.stringify(visibleItemTypes)}
      {@const friendsEntries = getFriendsTimelineEntries ? getFriendsTimelineEntries(selectedFriendsCompanionIds) : []}
      {@const visibleEntries = friendsEntries.filter(e =>
        e.type === 'trip' ? visibleItemTypes.trip !== false
        : e.type === 'item' ? visibleItemTypes[e.item.itemType] !== false
        : false
      )}
      {#if visibleEntries.length === 0}
        <p class="pane-empty">No upcoming trips or items from friends.</p>
      {:else}
        <div class="timeline-content">
          {#each visibleEntries as entry, i}
            {@const prevEntry = i > 0 ? visibleEntries[i - 1] : null}
            {@const thisMonth = getMonthYear(entry.sortDate)}
            {@const prevMonth = prevEntry ? getMonthYear(prevEntry.sortDate) : null}
            {#if thisMonth !== prevMonth}
              <div class="month-header">{thisMonth}</div>
            {/if}
            {#if entry.type === 'trip'}
              <div
                class="trip-card"
                class:tentative={entry.trip.isConfirmed === false}
                class:trip-card-clickable={!!onTripClick}
                on:click={() => onTripClick && onTripClick(entry.trip)}
                role={onTripClick ? 'button' : 'presentation'}
                tabindex={onTripClick ? 0 : undefined}
                on:keydown={e => e.key === 'Enter' && onTripClick && onTripClick(entry.trip)}
              >
                <div class="trip-header" role="presentation">
                  <span class="trip-name">{entry.trip.name}</span>
                  <span class="trip-dates">
                    {#if entry.trip.returnDate}
                      {@const nights = getTripNights(entry.trip.departureDate, entry.trip.returnDate)}
                      {#if nights}
                        <span class="trip-nights">{nights}{@html `<svg xmlns="http://www.w3.org/2000/svg" height="12px" viewBox="0 -960 960 960" width="12px" fill="currentColor"><path d="M600-640 480-760l120-120 120 120-120 120Zm200 120-80-80 80-80 80 80-80 80ZM483-80q-84 0-157.5-32t-128-86.5Q143-253 111-326.5T79-484q0-146 93-257.5T409-880q-18 99 11 193.5T520-521q71 71 165.5 100T879-410q-26 144-138 237T483-80Zm0-80q88 0 163-44t118-121q-86-8-163-43.5T463-465q-61-61-97-138t-43-163q-77 43-120.5 118.5T159-484q0 135 94.5 229.5T483-160Zm-20-305Z"/></svg>`}</span>
                      {/if}
                    {/if}
                    {formatDate(entry.trip.departureDate)}{entry.trip.returnDate ? ` – ${formatDate(entry.trip.returnDate)}` : ''}
                  </span>
                </div>
                <div class="shared-owner-label">by {getOwnerName(entry.trip)}</div>

                {#if entry.itemsByDate.length > 0}
                  {#each entry.itemsByDate as dateGroup}
                    {@const visibleItems = dateGroup.items.filter(i => visibleItemTypes[i.itemType] !== false)}
                    {#if visibleItems.length > 0}
                    <div class="date-group-header">{formatDateGroupHeader(dateGroup.dateKey)}</div>
                    {#each visibleItems as item}
                      <div class="item-row" class:tentative={item.isConfirmed === false}>
                        <div class="item-icon-wrap">
                          {#if item.itemType === 'flight' && item.departureDateTime}
                            <span class="item-flight-time">{formatTime24(item.departureDateTime, item.originTimezone)}</span>
                          {/if}
                          <span class="item-icon">{@html getItemIcon(item.itemType)}</span>
                        </div>
                        <div class="item-details">
                          <span class="item-label">{getItemLabel(item, formatTime24)}</span>
                          <div class="item-meta">
                            {#if item.itemType === 'flight'}
                              {@const dur = getFlightDuration(item)}
                              {#if dur}
                                <span class="item-duration"><svg xmlns="http://www.w3.org/2000/svg" height="13" width="13" fill="currentColor" viewBox="0 -960 960 960"><path d="M360-840v-80h240v80H360Zm80 440h80v-240h-80v240Zm-99.5 291.5Q275-137 226-186t-77.5-114.5Q120-366 120-440t28.5-139.5Q177-645 226-694t114.5-77.5Q406-800 480-800q62 0 119 20t107 58l56-56 56 56-56 56q38 50 58 107t20 119q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80q-74 0-139.5-28.5ZM678-242q82-82 82-198t-82-198q-82-82-198-82t-198 82q-82 82-82 198t82 198q82 82 198 82t198-82ZM480-440Z"></path></svg>{dur}</span>
                              {/if}
                            {:else if getItemDateTime(item)}
                              <span class="item-datetime">{getItemDateTime(item)}</span>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/each}
                    {/if}
                  {/each}
                {:else}
                  <div class="trip-empty">No items in this trip</div>
                {/if}
              </div>
            {:else}
              <!-- Standalone item from a companion -->
              <div class="timeline-item standalone" class:tentative={entry.item.isConfirmed === false}>
                <div class="item-icon-wrap">
                  {#if entry.item.itemType === 'flight' && entry.item.departureDateTime}
                    <span class="item-flight-time">{formatTime24(entry.item.departureDateTime, entry.item.originTimezone)}</span>
                  {/if}
                  <span class="item-icon">{@html getItemIcon(entry.item.itemType)}</span>
                </div>
                <div class="item-details">
                  <span class="item-label">{getItemLabel(entry.item, formatTime24)}</span>
                  <div class="item-meta">
                    {#if entry.item.itemType === 'flight'}
                      {@const dur = getFlightDuration(entry.item)}
                      {#if dur}
                        <span class="item-duration"><svg xmlns="http://www.w3.org/2000/svg" height="13" width="13" fill="currentColor" viewBox="0 -960 960 960"><path d="M360-840v-80h240v80H360Zm80 440h80v-240h-80v240Zm-99.5 291.5Q275-137 226-186t-77.5-114.5Q120-366 120-440t28.5-139.5Q177-645 226-694t114.5-77.5Q406-800 480-800q62 0 119 20t107 58l56-56 56 56-56 56q38 50 58 107t20 119q0 74-28.5 139.5T734-186q-49 49-114.5 77.5T480-80q-74 0-139.5-28.5ZM678-242q82-82 82-198t-82-198q-82-82-198-82t-198 82q-82 82-82 198t82 198q82 82 198 82t198-82ZM480-440Z"></path></svg>{dur}</span>
                      {/if}
                    {:else if getItemDateTime(entry.item)}
                      <span class="item-datetime">{getItemDateTime(entry.item)}</span>
                    {/if}
                    {#if entry.item.user}
                      <span class="item-owner">by {getOwnerName(entry.item)}</span>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    {/key}
  </PaneColumn>

  {#if showEditColumn}
    <PaneColumn span={1} divider={true}>
      <div class="edit-header">
        <h3 class="pane-title">Edit Trip</h3>
        <button class="close-button" on:click={onCloseTripEditForm} aria-label="Close">×</button>
      </div>
      <form class="edit-form" on:submit={onUpdateTrip}>
        <div class="form-row">
          <div class="form-group">
            <label for="shared-edit-trip-name">Trip Name</label>
            <input type="text" id="shared-edit-trip-name" bind:value={editTripForm.name} placeholder="e.g., Summer Vacation" required />
          </div>
          <div class="form-group form-group--toggle">
            <label>Status</label>
            <label class="toggle-switch" title={editTripForm.status === 'confirmed' ? 'Confirmed' : 'Tentative'}>
              <input type="checkbox" checked={editTripForm.status === 'confirmed'} on:change={(e) => { editTripForm.status = e.target.checked ? 'confirmed' : 'tentative'; }} />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group form-group--half">
            <label for="shared-edit-trip-departure">Departure Date</label>
            <input type="date" id="shared-edit-trip-departure" bind:value={editTripForm.departureDate} required />
          </div>
          <div class="form-group form-group--half">
            <label for="shared-edit-trip-return">Return Date</label>
            <input type="date" id="shared-edit-trip-return" bind:value={editTripForm.returnDate} />
          </div>
        </div>

        <div class="form-group">
          <label for="shared-edit-trip-purpose">Purpose</label>
          <select id="shared-edit-trip-purpose" bind:value={editTripForm.purpose}>
            <option value="business">Business</option>
            <option value="leisure">Leisure</option>
            <option value="family">Family</option>
            <option value="romantic">Romantic</option>
            <option value="adventure">Adventure</option>
            <option value="pleasure">Pleasure</option>
            <option value="other">Other</option>
          </select>
        </div>

        <PnrImportWidget
          {loyaltyPrograms}
          onImportFlights={onPnrImport}
        />

        <AttendeeManager
          mode="edit"
          {formAttendees}
          {formAttendeesLoading}
          itemType="trip"
          itemId={selectedTrip.id}
          createdBy={selectedTrip.createdBy}
          isTripItem={false}
          bind:attendeeEmailInput
          {attendeeSuggestions}
          {attendeeSuggestionsLoading}
          {attendeeAddLoading}
          {attendeeAddError}
          onInput={onAttendeeInput}
          onDismissSuggestions={onDismissSuggestions}
          onAddAttendee={onAddAttendee}
          onRemoveAttendee={onRemoveAttendee}
          onSelectSuggestion={onSelectAttendeeSuggestion}
        />

        <div class="form-actions">
          <button type="button" class="btn-secondary" on:click={onCloseTripEditForm}>Cancel</button>
          <button type="submit" class="btn-primary">Update</button>
        </div>
        <div class="form-actions-remove">
          <button type="button" class="btn-danger-outline" on:click={() => onDeleteTrip && onDeleteTrip(selectedTrip.id)}>Remove</button>
        </div>
      </form>
    </PaneColumn>
  {/if}
</ContentPane>

<!-- Mobile friends filter bottom sheet -->
{#if isMobileView && showFriendsFilterSheet}
  <div class="edit-sheet-backdrop" on:click={() => showFriendsFilterSheet = false}></div>
  <div class="edit-sheet edit-sheet-open">
    <div class="filter-sheet-handle"></div>
    <div class="edit-sheet-scroll">
      <div class="filter-sheet-header">
        <h3 class="pane-title" style="margin:0">Filters</h3>
        <button class="close-btn" on:click={() => showFriendsFilterSheet = false}>✕</button>
      </div>
      <ItemTypeFilterStrip {visibleItemTypes} onToggle={onToggleItemType} />
      {#if sharingFriendsCompanions.length > 0}
        <h4 class="filter-section-label" style="margin-top: var(--spacing-lg)">Friends</h4>
        <div class="companion-filter-list">
          {#each sharingFriendsCompanions as c (c.companionUser.id)}
            {@const uid = c.companionUser.id}
            {@const selected = selectedFriendsCompanionIds.has(uid)}
            {@const initials = ((c.companionUser.firstName?.[0] ?? '') + (c.companionUser.lastName?.[0] ?? '')).toUpperCase() || c.companionUser.email?.[0]?.toUpperCase() || '?'}
            {@const name = ((c.companionUser.firstName ?? '') + ' ' + (c.companionUser.lastName ?? '')).trim() || c.companionUser.email}
            <button
              class="companion-filter-btn"
              class:companion-filter-selected={selected}
              title={name}
              on:click={() => toggleFriendsCompanion(uid)}
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
  .pane-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0 var(--spacing-md);
  }

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

  .calendar-filter-btn-active {
    background: var(--primary-color);
    color: var(--white);
    border-color: var(--primary-color);
  }

  .calendar-filter-btn-active:hover {
    background: var(--primary-hover, var(--primary-color));
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

  /* Shared/Friends timeline display styles */
  .timeline-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .timeline-item {
    background: var(--glass-bg-medium);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-border-dark);
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-md);
  }

  .timeline-item.tentative {
    background-image: repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 6px,
      rgba(0, 0, 0, 0.04) 6px,
      rgba(0, 0, 0, 0.04) 8px
    );
  }

  .trip-card {
    background: var(--glass-bg-medium);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-border-dark);
    overflow: hidden;
    padding: var(--spacing-xs);
  }

  .trip-card.trip-card-clickable {
    cursor: pointer;
  }
  .trip-card.trip-card-clickable:hover {
    border-color: var(--glass-border-light, rgba(255,255,255,0.2));
  }

  .trip-card.tentative {
    background-image: repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 6px,
      rgba(0, 0, 0, 0.04) 6px,
      rgba(0, 0, 0, 0.04) 8px
    );
  }

  .trip-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-bottom: 1px solid var(--glass-border);
    border-radius: 6px 6px 0 0;
  }

  .trip-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--dark-text);
  }

  .trip-dates {
    font-size: 0.7rem;
    color: var(--gray-text);
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    flex-wrap: wrap;
  }

  .trip-nights {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--gray-text);
    background: var(--glass-bg-dark, rgba(0,0,0,0.08));
    border-radius: var(--radius-sm);
    padding: 1px 5px;
  }

  .trip-empty {
    padding: var(--spacing-xs) var(--spacing-md);
    font-size: 0.8rem;
    color: var(--gray-light);
    text-align: center;
    font-style: italic;
  }

  .shared-owner-label {
    padding: 3px var(--spacing-sm);
    font-size: 0.72rem;
    color: var(--gray-text);
    font-style: italic;
    border-bottom: 1px solid var(--glass-border);
  }

  .item-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    margin-left: var(--spacing-sm);
    border-left: 2px solid var(--primary-color);
  }

  .item-row:last-child {
    margin-bottom: var(--spacing-xs);
  }

  .item-row.tentative {
    background-image: repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 6px,
      rgba(0, 0, 0, 0.04) 6px,
      rgba(0, 0, 0, 0.04) 8px
    );
  }

  .item-icon-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    width: 36px;
  }

  .item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 25px;
    height: 25px;
    border-radius: var(--radius-sm);
    background: var(--glass-bg-medium);
    color: var(--gray-text);
  }

  .item-flight-time {
    font-size: 0.6rem;
    font-weight: 600;
    color: var(--gray-text);
    line-height: 1;
    letter-spacing: 0.03em;
  }

  .item-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .item-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--dark-text);
  }

  .item-meta {
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
    flex-wrap: wrap;
  }

  .item-duration {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.7rem;
    color: var(--gray-light);
  }

  .item-duration svg {
    flex-shrink: 0;
    margin-top: 1px;
  }

  .item-datetime {
    font-size: 0.7rem;
    color: var(--gray-light);
  }

  .item-owner {
    font-style: italic;
    color: var(--gray-light);
  }

  .date-group-header {
    padding: var(--spacing-xs) var(--spacing-sm);
    margin-top: var(--spacing-xs);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--gray-dark);
  }

  .month-header {
    font-size: 0.8rem;
    font-weight: 700;
    font-style: oblique;
    text-transform: uppercase;
    letter-spacing: .2em;
    color: var(--primary-color);
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
