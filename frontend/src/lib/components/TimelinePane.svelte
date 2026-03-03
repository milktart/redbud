<script>
  import { user } from '../stores/user';
  import ContentPane from './ContentPane.svelte';
  import PaneColumn from './PaneColumn.svelte';
  import ItemForm from './ItemForm.svelte';
  import AttendeeManager from './AttendeeManager.svelte';
  import { getItemIcon, getItemLabel, getFlightDuration, getItemDateTime, formatTime24, formatDate, getTripNights, formatDateGroupHeader, getMonthYear, getAttendeeInitials, sortAttendees } from '../utils/itemHelpers.js';

  export let trips = [];
  export let isMobileView = false;
  export let timelineVersion = 0;

  // selected item/trip for edit
  export let selectedItem = null;
  export let selectedTrip = null;

  // edit form state (bound from parent)
  export let editForm = {};
  export let editTripForm = {};

  // attendee state
  export let formAttendees = [];
  export let formAttendeesLoading = false;
  export let attendeeEmailInput = '';
  export let attendeeSuggestions = [];
  export let attendeeSuggestionsLoading = false;
  export let attendeeAddLoading = false;
  export let attendeeAddError = '';

  // callbacks — data functions (return computed results)
  export let getAllItemsChronological = null; // (tab) => entries[]
  export let buildTripRenderRows = null;      // (itemsByDate, tripId) => rows[]
  export let filterTripsByItemDate = null;    // (date, tripId) => trips[]
  export let getItemPrimaryDate = null;       // (form) => string

  // callbacks — item actions
  export let onItemClick = null;
  export let onTripClick = null;
  export let onCloseEditForm = null;
  export let onCloseTripEditForm = null;
  export let onUpdateItem = null;
  export let onUpdateTrip = null;
  export let onDeleteItem = null;
  export let onDeleteTrip = null;
  export let onOpenHotelFormForTrip = null;

  // callbacks — item form
  export let onEditFlightNumberInput = null;
  export let onEditStartDateChange = null;
  export let onEditEndDateChange = null;

  // callbacks — attendees
  export let onAttendeeInput = null;
  export let onDismissSuggestions = null;
  export let onAddAttendee = null;
  export let onRemoveAttendee = null;
  export let onSelectAttendeeSuggestion = null;

  // exported so parent can bind and react to tab changes (e.g. map updates)
  export let activeTimelineTab = 'upcoming';
</script>

<ContentPane columns={(selectedItem || selectedTrip) && !isMobileView ? 2 : 1} mobileTop="30vh">
  <PaneColumn span={1}>

    <h3 class="pane-title">Timeline</h3>

    <!-- Timeline Tabs -->
    <div class="timeline-tabs">
      <button
        class="timeline-tab"
        class:active={activeTimelineTab === 'upcoming'}
        on:click={() => activeTimelineTab = 'upcoming'}
      >
        Upcoming
      </button>
      <button
        class="timeline-tab"
        class:active={activeTimelineTab === 'past'}
        on:click={() => activeTimelineTab = 'past'}
      >
        Past
      </button>
    </div>

  {#key timelineVersion + activeTimelineTab}
    {@const timelineEntries = getAllItemsChronological ? getAllItemsChronological(activeTimelineTab) : []}
    {#if timelineEntries.length === 0}
      <p class="pane-empty">
        {#if activeTimelineTab === 'upcoming'}
          No upcoming trips or items.
        {:else}
          No past trips or items.
        {/if}
      </p>
    {:else}
      <div class="timeline-content">
        {#each timelineEntries as entry, i}
          {@const prevEntry = i > 0 ? timelineEntries[i - 1] : null}
          {@const thisMonth = getMonthYear(entry.sortDate)}
          {@const prevMonth = prevEntry ? getMonthYear(prevEntry.sortDate) : null}
          {#if thisMonth !== prevMonth}
            <div class="month-header">{thisMonth}</div>
          {/if}
          {#if entry.type === 'trip'}
            <!-- Trip with items -->
            <div class="trip-card" class:selected={selectedTrip?.id === entry.trip.id} class:tentative={entry.trip.isConfirmed === false} class:active={(() => { const now = new Date(); const start = new Date(entry.trip.departureDate); const end = entry.trip.returnDate ? new Date(entry.trip.returnDate) : null; return start <= now && end && end >= now; })()}>
              <div class="trip-header" on:click={() => onTripClick && onTripClick(entry.trip)} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && onTripClick && onTripClick(entry.trip)}>
                <div class="trip-header-top">
                  <span class="trip-name">{entry.trip.name}</span>
                  {#if (entry.trip.attendees || []).filter(a => a.userId !== $user?.id).length > 0}
                    <div class="attendee-badges">
                      {#each sortAttendees(entry.trip.attendees || [], entry.trip.createdBy) as att (att.id)}
                        <span class="attendee-badge" title="{att.user?.firstName || ''} {att.user?.lastName || att.user?.email || ''}">{getAttendeeInitials(att.user)}</span>
                      {/each}
                    </div>
                  {/if}
                </div>
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

              <!-- Items grouped by date -->
              {#if entry.itemsByDate.length > 0}
                {@const renderRows = buildTripRenderRows ? buildTripRenderRows(entry.itemsByDate, entry.trip.id) : []}
                {#each renderRows as row}
                  {#if row.type === 'date-header'}
                    <div class="date-group-header">{formatDateGroupHeader(row.dateKey)}</div>
                  {:else if row.type === 'layover'}
                    <div class="layover-row">
                      <span class="layover-line"></span>
                      <span class="layover-label"><svg xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="#1f1f1f"><path d="M360-200v-80h80q-15-138-118-229T80-600v-80q129 0 237 68t163 184q38-81 100-143.5T719-680H560v-80h280v280h-80v-132q-93 57-160 141t-80 191h80v80H360Z"/></svg>{row.duration}</span>
                      <span class="layover-line"></span>
                    </div>
                  {:else if row.type === 'accommodation-gap'}
                    <div class="item-row accommodation-gap" role="button" tabindex="0" on:click={() => onOpenHotelFormForTrip && onOpenHotelFormForTrip(row.tripId, row.gapStart, row.gapEnd)} on:keydown={(e) => e.key === 'Enter' && onOpenHotelFormForTrip && onOpenHotelFormForTrip(row.tripId, row.gapStart, row.gapEnd)}>
                      <div class="item-icon-wrap">
                        <span class="item-icon">{@html getItemIcon('hotel')}</span>
                      </div>
                      <div class="item-details">
                        <span class="item-label accommodation-gap-label">Accommodation booked?</span>
                      </div>
                    </div>
                  {:else}
                    {@const item = row.item}
                    <div class="item-row" class:selected={selectedItem?.id === item.id} class:tentative={item.isConfirmed === false} on:click={() => onItemClick && onItemClick(item)}>
                      <div class="item-icon-wrap">
                        {#if item.itemType === 'flight' && item.flightNumber}
                          <span class="item-flight-time">{item.flightNumber}</span>
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
                      {#if (entry.trip.attendees || []).some(a => a.userId !== $user?.id) && (item.attendees || []).length > 0}
                        <div class="attendee-badges">
                          {#each sortAttendees(item.attendees || [], item.createdBy) as att (att.id)}
                            <span class="attendee-badge" title="{att.user?.firstName || ''} {att.user?.lastName || att.user?.email || ''}">{getAttendeeInitials(att.user)}</span>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}
                {/each}
              {:else}
                <div class="trip-empty">No items in this trip yet</div>
              {/if}
            </div>
          {:else}
            <!-- Standalone item -->
            <div class="timeline-item standalone" class:selected={selectedItem?.id === entry.item.id} class:tentative={entry.item.isConfirmed === false} on:click={() => onItemClick && onItemClick(entry.item)}>
              <div class="item-icon-wrap">
                {#if entry.item.itemType === 'flight' && entry.item.flightNumber}
                  <span class="item-flight-time">{entry.item.flightNumber}</span>
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
                </div>
              </div>
              {#if (entry.item.attendees || []).filter(a => a.userId !== $user?.id).length > 0}
                <div class="attendee-badges">
                  {#each sortAttendees(entry.item.attendees || [], entry.item.createdBy) as att (att.id)}
                    <span class="attendee-badge" title="{att.user?.firstName || ''} {att.user?.lastName || att.user?.email || ''}">{getAttendeeInitials(att.user)}</span>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  {/key}
  </PaneColumn>

  <!-- Edit Form Column (desktop only) -->
  {#if selectedItem && !isMobileView}
    <PaneColumn span={1} divider={true}>
      <div class="edit-header">
        <h3 class="pane-title">Edit {selectedItem.itemType.replace('_', ' ')}</h3>
        <button class="close-button" on:click={onCloseEditForm} aria-label="Close">×</button>
      </div>
      <form class="edit-form" on:submit={onUpdateItem}>
        <div class="form-row">
          <div class="form-group">
            <label for="edit-item-trip">Trip (Optional)</label>
            <select id="edit-item-trip" bind:value={editForm.tripId}>
              <option value="">None (standalone item)</option>
              {#each (filterTripsByItemDate ? filterTripsByItemDate(getItemPrimaryDate ? getItemPrimaryDate(editForm) : null, editForm.tripId) : trips) as trip}
                <option value={trip.id}>{trip.purpose === 'business' ? '※ ' : ''}{trip.name}</option>
              {/each}
            </select>
          </div>
          <div class="form-group form-group--toggle">
            <label>Status</label>
            <label class="toggle-switch" title={editForm.status === 'confirmed' ? 'Confirmed' : 'Tentative'}>
              <input type="checkbox" checked={editForm.status === 'confirmed'} on:change={(e) => { editForm.status = e.target.checked ? 'confirmed' : 'tentative'; }} />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <ItemForm
          form={editForm}
          idPrefix="edit-"
          onFlightNumberInput={onEditFlightNumberInput}
          onStartDateChange={onEditStartDateChange}
          onEndDateChange={onEditEndDateChange}
        />
        <!-- Attendees section -->
        <AttendeeManager
          mode="edit"
          {formAttendees}
          {formAttendeesLoading}
          itemType={selectedItem.itemType}
          itemId={selectedItem.id}
          createdBy={selectedItem.createdBy}
          isTripItem={!!selectedItem.tripId}
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
          <button type="button" class="btn-secondary" on:click={onCloseEditForm}>Cancel</button>
          <button type="submit" class="btn-primary">Update</button>
        </div>
        {#if selectedItem?.canDelete}
          <div class="form-actions-remove">
            <button type="button" class="btn-danger-outline" on:click={() => onDeleteItem && onDeleteItem(selectedItem.id, selectedItem.itemType)}>Remove</button>
          </div>
        {/if}
      </form>
    </PaneColumn>
  {/if}
  {#if selectedTrip && !isMobileView}
    <PaneColumn span={1} divider={true}>
      <div class="edit-header">
        <h3 class="pane-title">Edit Trip</h3>
        <button class="close-button" on:click={onCloseTripEditForm} aria-label="Close">×</button>
      </div>
      <form class="edit-form" on:submit={onUpdateTrip}>
        <div class="form-row">
          <div class="form-group">
            <label for="edit-trip-name">Trip Name</label>
            <input type="text" id="edit-trip-name" bind:value={editTripForm.name} placeholder="e.g., Summer Vacation" required />
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
            <label for="edit-trip-departure">Departure Date</label>
            <input type="date" id="edit-trip-departure" bind:value={editTripForm.departureDate} required />
          </div>
          <div class="form-group form-group--half">
            <label for="edit-trip-return">Return Date</label>
            <input type="date" id="edit-trip-return" bind:value={editTripForm.returnDate} />
          </div>
        </div>

        <div class="form-group">
          <label for="edit-trip-purpose">Purpose</label>
          <select id="edit-trip-purpose" bind:value={editTripForm.purpose}>
            <option value="business">Business</option>
            <option value="leisure">Leisure</option>
            <option value="family">Family</option>
            <option value="romantic">Romantic</option>
            <option value="adventure">Adventure</option>
            <option value="pleasure">Pleasure</option>
            <option value="other">Other</option>
          </select>
        </div>

        <!-- Attendees section -->
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

<!-- Mobile edit bottom sheet -->
{#if isMobileView && (selectedItem || selectedTrip)}
  <div class="edit-sheet-backdrop" on:click={() => { onCloseEditForm && onCloseEditForm(); onCloseTripEditForm && onCloseTripEditForm(); }}></div>
  <div class="edit-sheet edit-sheet-open">
    <div class="filter-sheet-handle"></div>
    <div class="edit-sheet-scroll">
      {#if selectedItem}
        <div class="filter-sheet-header">
          <h3 class="pane-title" style="margin:0">Edit {selectedItem.itemType.replace('_', ' ')}</h3>
          <button class="close-btn" on:click={onCloseEditForm}>✕</button>
        </div>
        <form class="edit-form" on:submit={onUpdateItem}>
          <div class="form-row">
            <div class="form-group">
              <label for="m-edit-item-trip">Trip (Optional)</label>
              <select id="m-edit-item-trip" bind:value={editForm.tripId}>
                <option value="">None (standalone item)</option>
                {#each (filterTripsByItemDate ? filterTripsByItemDate(getItemPrimaryDate ? getItemPrimaryDate(editForm) : null, editForm.tripId) : trips) as trip}
                  <option value={trip.id}>{trip.purpose === 'business' ? '※ ' : ''}{trip.name}</option>
                {/each}
              </select>
            </div>
            <div class="form-group form-group--toggle">
              <label>Status</label>
              <label class="toggle-switch" title={editForm.status === 'confirmed' ? 'Confirmed' : 'Tentative'}>
                <input type="checkbox" checked={editForm.status === 'confirmed'} on:change={(e) => { editForm.status = e.target.checked ? 'confirmed' : 'tentative'; }} />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
          <ItemForm
            form={editForm}
            idPrefix="m-edit-"
            onFlightNumberInput={onEditFlightNumberInput}
            onStartDateChange={onEditStartDateChange}
            onEndDateChange={onEditEndDateChange}
          />
          <!-- Attendees -->
          <AttendeeManager
            mode="edit"
            {formAttendees}
            {formAttendeesLoading}
            itemType={selectedItem.itemType}
            itemId={selectedItem.id}
            createdBy={selectedItem.createdBy}
            isTripItem={!!selectedItem.tripId}
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
            <button type="button" class="btn-secondary" on:click={onCloseEditForm}>Cancel</button>
            <button type="submit" class="btn-primary">Update</button>
          </div>
          {#if selectedItem?.canDelete}
            <div class="form-actions-remove">
              <button type="button" class="btn-danger-outline" on:click={() => onDeleteItem && onDeleteItem(selectedItem.id, selectedItem.itemType)}>Remove</button>
            </div>
          {/if}
        </form>
      {:else if selectedTrip}
        <div class="filter-sheet-header">
          <h3 class="pane-title" style="margin:0">Edit Trip</h3>
          <button class="close-btn" on:click={onCloseTripEditForm}>✕</button>
        </div>
        <form class="edit-form" on:submit={onUpdateTrip}>
          <div class="form-row">
            <div class="form-group">
              <label for="m-edit-trip-name">Trip Name</label>
              <input type="text" id="m-edit-trip-name" bind:value={editTripForm.name} placeholder="e.g., Summer Vacation" required />
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
              <label for="m-edit-trip-departure">Departure Date</label>
              <input type="date" id="m-edit-trip-departure" bind:value={editTripForm.departureDate} required />
            </div>
            <div class="form-group form-group--half">
              <label for="m-edit-trip-return">Return Date</label>
              <input type="date" id="m-edit-trip-return" bind:value={editTripForm.returnDate} />
            </div>
          </div>
          <div class="form-group">
            <label for="m-edit-trip-purpose">Purpose</label>
            <select id="m-edit-trip-purpose" bind:value={editTripForm.purpose}>
              <option value="business">Business</option>
              <option value="leisure">Leisure</option>
              <option value="family">Family</option>
              <option value="romantic">Romantic</option>
              <option value="adventure">Adventure</option>
              <option value="pleasure">Pleasure</option>
              <option value="other">Other</option>
            </select>
          </div>
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
      {/if}
    </div>
  </div>
{/if}

<style>
  .timeline-tabs {
    display: flex;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-lg);
    border-bottom: 1px solid var(--glass-border);
    padding-bottom: 2px;
  }

  .timeline-tab {
    background: none;
    border: none;
    padding: var(--spacing-xs) var(--spacing-md);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--gray-text);
    cursor: pointer;
    transition: all var(--transition-fast);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }

  .timeline-tab:hover {
    color: var(--primary-color);
  }

  .timeline-tab.active {
    color: var(--primary-color);
    border-bottom-color: var(--primary-color);
  }

  .timeline-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    transition: all 0.3s ease-in-out;
  }

  .timeline-item {
    background: var(--glass-bg-medium);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-border-dark);
    transition: all 0.3s ease-in-out;
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-md);
    cursor: pointer;
  }

  .timeline-item:hover {
    border-color: var(--primary-light);
    box-shadow: var(--shadow-md);
    background: var(--white);
  }

  .timeline-item.selected {
    background: var(--white);
    border-color: var(--primary-color);
  }

  .timeline-item.tentative {
    background-image: repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(0, 0, 0, 0.04) 6px, rgba(0, 0, 0, 0.04) 8px);
  }

  .trip-card {
    background: var(--glass-bg-medium);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-border-dark);
    transition: all 0.3s ease-in-out;
    overflow: hidden;
    padding: var(--spacing-xs);
  }

  .trip-card:hover {
    border-color: var(--primary-light);
    box-shadow: var(--shadow-md);
  }

  .trip-card.selected {
    background: var(--indigo-50);
    border-color: var(--indigo-200);
  }

  .trip-card.tentative {
    background-image: repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(0, 0, 0, 0.04) 6px, rgba(0, 0, 0, 0.04) 8px);
  }

  .trip-card.active {
    background: var(--green-50);
    border-color: var(--green-400);
  }

  .trip-header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--spacing-xs) var(--spacing-sm);
    border-bottom: 1px solid var(--glass-border);
    cursor: pointer;
    transition: background 0.15s ease;
    border-radius: 6px 6px 0 0;
  }

  .trip-header:hover {
    background: rgba(255, 255, 255, 0.35);
  }

  .trip-header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-xs);
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

  .item-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    margin-left: var(--spacing-sm);
    border-left: 2px solid var(--primary-color);
    transition: background var(--transition-fast);
    cursor: pointer;
  }

  .item-row:last-child {
    margin-bottom: var(--spacing-xs);
  }

  .item-row:hover {
    background: var(--glass-bg-light);
  }

  .item-row.selected {
    background: var(--glass-bg-heavy);
  }

  .item-row.tentative {
    background-image: repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(0, 0, 0, 0.04) 6px, rgba(0, 0, 0, 0.04) 8px);
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

  .date-group-header {
    padding: var(--spacing-xs) var(--spacing-sm);
    margin-top: var(--spacing-xs);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--gray-dark);
  }

  .date-group-header:first-of-type {
    margin-top: 0;
  }

  .month-header {
    font-size: 0.8rem;
    font-weight: 700;
    font-style: oblique;
    text-transform: uppercase;
    letter-spacing: .2em;
    color: var(--primary-color);
  }

  .attendee-badges {
    display: flex;
    gap: 3px;
    align-items: center;
    flex-shrink: 0;
  }

  .attendee-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background: #fff;
    color: var(--primary-color);
    font-size: 0.5rem;
    font-weight: 700;
    letter-spacing: 0;
    flex-shrink: 0;
    border: 1.5px solid var(--primary-color);
  }

  .layover-row {
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: var(--spacing-lg);
    padding: 2px var(--spacing-sm);
    margin-left: var(--spacing-sm);
  }

  .layover-line {
    flex: 1;
    max-width: 75px;
    height: 1px;
    background: var(--grey-300);
  }

  .layover-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: 0.7rem;
    color: var(--gray-dark);
    white-space: nowrap;
  }

  .accommodation-gap {
    background: var(--grey-100);
    border: 2px dotted var(--grey-300);
    border-radius: var(--radius-sm);
    margin: var(--spacing-sm) var(--spacing-sm) auto;
    padding: var(--spacing-sm) calc(var(--spacing-sm) - 1px);
  }

  .item-row.accommodation-gap:hover {
    background: var(--grey-200);
  }

  .accommodation-gap-label {
    color: var(--grey-600);
    font-style: italic;
  }

  .edit-header {
    display: flex;
    justify-content: space-between;
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .close-button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--glass-bg-medium);
    border: 1px solid var(--glass-border-dark);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    font-size: 1.25rem;
    line-height: 1;
    color: var(--gray-dark);
    padding: 0;
    padding-top: 2px;
    font-family: Arial, sans-serif;
    font-weight: 400;
  }

  .close-button:hover {
    background: var(--white);
    color: var(--primary-color);
  }

  .form-actions-remove .btn-danger-outline {
    width: 100%;
  }

  .btn-danger-outline {
    background: none;
    color: #ef4444;
    border-color: #ef4444;
  }

  .btn-danger-outline:hover {
    background: #fee2e2;
  }

  @media (max-width: 640px) {
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
  }
</style>
