<script>
  import ContentPane from './ContentPane.svelte';
  import PaneColumn from './PaneColumn.svelte';
  import ItemForm from './ItemForm.svelte';
  import AttendeeManager from './AttendeeManager.svelte';
  import { formatTripDateRange } from '../utils/itemHelpers.js';

  // navigation
  export let addNewView = 'menu'; // 'menu' | 'tripForm' | 'itemForm'

  // trip form state
  export let tripForm = {};
  export let trips = [];

  // item form state
  export let itemForm = {};

  // attendee state (shared)
  export let pendingAttendees = [];
  export let attendeeEmailInput = '';
  export let attendeeSuggestions = [];
  export let attendeeSuggestionsLoading = false;
  export let attendeeAddError = '';

  // callbacks — navigation
  export let onShowTripForm = null;
  export let onShowItemForm = null;
  export let onBackToMenu = null;

  // callbacks — trip form
  export let onCreateTrip = null;
  export let onTripStartDateChange = null;
  export let onTripEndDateChange = null;

  // callbacks — item form
  export let onCreateItem = null;
  export let onItemFlightNumberInput = null;
  export let onItemFlightNumberBlur = null;
  export let onItemStartDateChange = null;
  export let onItemEndDateChange = null;
  export let flightLookupLoading = false;
  export let filterTripsByItemDate = null;
  export let getItemPrimaryDate = null;

  // callbacks — attendees
  export let onAttendeeInput = null;
  export let onDismissSuggestions = null;
  export let onQueueAttendee = null;
  export let onRemovePendingAttendee = null;
  export let onSelectAttendeeSuggestion = null;
</script>

<ContentPane columns={1}>
  <PaneColumn span={1}>
  {#if addNewView === 'menu'}
    <h3 class="pane-title">Add New</h3>
    <div class="add-new-menu">
      <button class="add-new-option" on:click={() => onShowTripForm && onShowTripForm()}>
        <div class="option-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
        <div class="option-content">
          <h3 class="option-title">New Trip</h3>
          <p class="option-description">Plan a new travel adventure</p>
        </div>
      </button>

      <button class="add-new-option" on:click={() => onShowItemForm && onShowItemForm()}>
        <div class="option-icon">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
            <line x1="8" y1="14" x2="8" y2="14.01"/>
            <line x1="12" y1="14" x2="12" y2="14.01"/>
            <line x1="16" y1="14" x2="16" y2="14.01"/>
            <line x1="8" y1="18" x2="8" y2="18.01"/>
            <line x1="12" y1="18" x2="12" y2="18.01"/>
          </svg>
        </div>
        <div class="option-content">
          <h3 class="option-title">New Item</h3>
          <p class="option-description">Add flight, hotel, or activity</p>
        </div>
      </button>
    </div>
  {:else if addNewView === 'tripForm'}
    <div class="form-header">
      <button class="back-button" on:click={() => onBackToMenu && onBackToMenu()} aria-label="Back to menu">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <h3 class="pane-title">New Trip</h3>
    </div>
    <form class="add-form" on:submit={onCreateTrip}>
      <div class="form-row">
        <div class="form-group">
          <label for="trip-name">Trip Name</label>
          <input
            type="text"
            id="trip-name"
            bind:value={tripForm.name}
            placeholder="e.g., Summer Vacation"
            required
          />
        </div>
        <div class="form-group form-group--toggle">
          <label>Status</label>
          <label class="toggle-switch" title={tripForm.status === 'confirmed' ? 'Confirmed' : 'Tentative'}>
            <input type="checkbox" checked={tripForm.status === 'confirmed'} on:change={(e) => { tripForm.status = e.target.checked ? 'confirmed' : 'tentative'; }} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group form-group--half">
          <label for="trip-departure">Departure Date</label>
          <input
            type="date"
            id="trip-departure"
            bind:value={tripForm.departureDate}
            on:change={onTripStartDateChange}
            required
          />
        </div>
        <div class="form-group form-group--half">
          <label for="trip-return">Return Date</label>
          <input
            type="date"
            id="trip-return"
            bind:value={tripForm.returnDate}
            on:change={onTripEndDateChange}
          />
        </div>
      </div>

      <div class="form-group">
        <label for="trip-purpose">Purpose</label>
        <select id="trip-purpose" bind:value={tripForm.purpose}>
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
        mode="create"
        {pendingAttendees}
        bind:attendeeEmailInput
        {attendeeSuggestions}
        {attendeeSuggestionsLoading}
        {attendeeAddError}
        onInput={onAttendeeInput}
        onDismissSuggestions={onDismissSuggestions}
        onQueueAttendee={onQueueAttendee}
        onRemovePending={onRemovePendingAttendee}
        onSelectSuggestion={onSelectAttendeeSuggestion}
      />

      <div class="form-actions">
        <button type="button" class="btn-secondary" on:click={() => onBackToMenu && onBackToMenu()}>Cancel</button>
        <button type="submit" class="btn-primary">Create</button>
      </div>
    </form>
  {:else if addNewView === 'itemForm'}
    <div class="form-header">
      <button class="back-button" on:click={() => onBackToMenu && onBackToMenu()} aria-label="Back to menu">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/>
          <polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <h3 class="pane-title">New Item</h3>
    </div>
    <form class="add-form" on:submit={onCreateItem}>
      <div class="form-group">
        <label>Item Type</label>
        <div class="type-filter-strip">
          <button type="button" class="type-filter-btn" class:type-filter-off={itemForm.itemType !== 'flight'} style="--filter-color: #10b981" on:click={() => { itemForm.itemType = 'flight'; }} title="Flight">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>
          </button>
          <button type="button" class="type-filter-btn" class:type-filter-off={itemForm.itemType !== 'hotel'} style="--filter-color: #f59e0b" on:click={() => { itemForm.itemType = 'hotel'; itemForm.checkInTime = '14:00'; itemForm.checkOutTime = '11:00'; }} title="Hotel">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3m12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9a4 4 0 0 0-4-4"/></svg>
          </button>
          <button type="button" class="type-filter-btn" class:type-filter-off={itemForm.itemType !== 'transportation'} style="--filter-color: #8b5cf6" on:click={() => { itemForm.itemType = 'transportation'; }} title="Transportation">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3M6 10V6h12v4z"/></svg>
          </button>
          <button type="button" class="type-filter-btn" class:type-filter-off={itemForm.itemType !== 'car_rental'} style="--filter-color: #ec4899" on:click={() => { itemForm.itemType = 'car_rental'; }} title="Car Rental">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h12v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-8zM6.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3M5 11l1.5-4.5h11L19 11z"/></svg>
          </button>
          <button type="button" class="type-filter-btn" class:type-filter-off={itemForm.itemType !== 'event'} style="--filter-color: #06b6d4" on:click={() => { itemForm.itemType = 'event'; }} title="Event">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17 12h-5v5h5zM16 1v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V1zm3 18H5V8h14z"/></svg>
          </button>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="item-trip">Trip (Optional)</label>
          <select id="item-trip" bind:value={itemForm.tripId}>
            <option value="">None (standalone item)</option>
            {#each (filterTripsByItemDate ? filterTripsByItemDate(getItemPrimaryDate ? getItemPrimaryDate(itemForm) : null, itemForm.tripId) : trips) as trip}
              <option value={trip.id}>{trip.purpose === 'business' ? '※ ' : ''}{formatTripDateRange(trip.departureDate, trip.returnDate)} {trip.name}</option>
            {/each}
          </select>
        </div>
        <div class="form-group form-group--toggle">
          <label>Status</label>
          <label class="toggle-switch" title={itemForm.status === 'confirmed' ? 'Confirmed' : 'Tentative'}>
            <input type="checkbox" checked={itemForm.status === 'confirmed'} on:change={(e) => { itemForm.status = e.target.checked ? 'confirmed' : 'tentative'; }} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <ItemForm
        form={itemForm}
        idPrefix=""
        onFlightNumberInput={onItemFlightNumberInput}
        onFlightNumberBlur={onItemFlightNumberBlur}
        onStartDateChange={onItemStartDateChange}
        onEndDateChange={onItemEndDateChange}
        {flightLookupLoading}
      />

      <!-- Attendees section -->
      <AttendeeManager
        mode="create"
        {pendingAttendees}
        bind:attendeeEmailInput
        {attendeeSuggestions}
        {attendeeSuggestionsLoading}
        {attendeeAddError}
        onInput={onAttendeeInput}
        onDismissSuggestions={onDismissSuggestions}
        onQueueAttendee={onQueueAttendee}
        onRemovePending={onRemovePendingAttendee}
        onSelectSuggestion={onSelectAttendeeSuggestion}
      />

      <div class="form-actions">
        <button type="button" class="btn-secondary" on:click={() => onBackToMenu && onBackToMenu()}>Cancel</button>
        <button type="submit" class="btn-primary">Create</button>
      </div>
    </form>
  {/if}
  </PaneColumn>
</ContentPane>

<style>
  .add-new-menu {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .add-new-option {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-lg);
    background: var(--glass-bg-medium);
    border: 1px solid var(--glass-border-dark);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
  }

  .add-new-option:hover {
    background: var(--white);
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
    border-color: var(--primary-light);
  }

  .add-new-option:active {
    transform: translateY(0);
  }

  .option-icon {
    width: 48px;
    height: 48px;
    min-width: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--primary-color);
    border-radius: var(--radius-md);
    color: var(--white);
  }

  .option-icon svg {
    width: 24px;
    height: 24px;
  }

  .option-content {
    flex: 1;
  }

  .option-title {
    margin: 0 0 var(--spacing-xs) 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--dark-text);
  }

  .option-description {
    margin: 0;
    font-size: 0.75rem;
    color: var(--gray-text);
  }

  .form-header {
    display: flex;
    gap: 1vh;
  }

  .back-button {
    width: 32px;
    height: 32px;
    min-width: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--glass-bg-medium);
    border: 1px solid var(--glass-border-dark);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    padding: 0;
    color: var(--gray-dark);
  }

  .back-button:hover {
    background: var(--white);
    color: var(--primary-color);
    transform: translateX(-2px);
  }

  .back-button svg {
    width: 18px;
    height: 18px;
  }

  .add-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  /* Type filter strip for item type selector */
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
    max-width: none;
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
