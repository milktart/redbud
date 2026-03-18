<script>
  /**
   * Stateless attendee manager UI.
   * All state (attendees, input, suggestions) lives in the parent (Dashboard).
   * mode='create' — shows pendingAttendees, calls onQueueAttendee / onRemovePending
   * mode='edit'   — shows formAttendees, calls onAddAttendee / onRemoveAttendee
   */

  // mode
  export let mode = 'edit'; // 'create' | 'edit'

  // edit mode props
  export let formAttendees = [];
  export let formAttendeesLoading = false;
  export let itemType = null;   // string, e.g. 'trip', 'flight'
  export let itemId = null;     // uuid
  export let createdBy = null;  // userId of creator (used to gate remove button)
  export let isTripItem = false; // true if item belongs to a trip (relaxes remove gate)

  // create mode props
  export let pendingAttendees = [];

  // shared
  export let attendeeEmailInput = '';
  export let attendeeSuggestions = [];
  export let attendeeSuggestionsLoading = false;
  export let attendeeAddLoading = false;
  export let attendeeAddError = '';

  // callbacks
  export let onInput = null;          // (event) => void — called on input change
  export let onBlur = null;           // () => void — called on input blur (dismiss suggestions)
  export let onAddAttendee = null;    // (itemType, itemId) => void — edit mode add
  export let onRemoveAttendee = null; // (attId, itemType, itemId) => void — edit mode remove
  export let onQueueAttendee = null;  // () => void — create mode add
  export let onRemovePending = null;  // (email) => void — create mode remove
  export let onSelectSuggestion = null; // (user, itemType, itemId, isCreate) => void
  export let onDismissSuggestions = null; // () => void — called to clear suggestions on blur
</script>

<div class="attendee-section">
  <h4 class="attendee-section-title">Travelers</h4>

  {#if mode === 'edit'}
    {#if formAttendeesLoading}
      <p class="attendee-empty">Loading…</p>
    {:else if formAttendees.length > 0}
      <div class="attendee-chips">
        {#each formAttendees as att (att.id)}
          <span class="attendee-chip">
            <span class="attendee-chip-name">{att.user?.firstName || att.user?.email || 'Unknown'}</span>
            {#if formAttendees.length > 1 && (isTripItem || itemType === 'trip' || att.user?.id !== createdBy)}
              <button
                type="button"
                class="attendee-chip-remove"
                aria-label="Remove {att.user?.firstName || att.user?.email}"
                on:click={() => onRemoveAttendee && onRemoveAttendee(att.id, itemType, itemId)}
              >×</button>
            {/if}
          </span>
        {/each}
      </div>
    {:else}
      <p class="attendee-empty">No travelers added yet.</p>
    {/if}
  {:else}
    {#if pendingAttendees.length > 0}
      <div class="attendee-chips">
        {#each pendingAttendees as pa (pa.email)}
          <span class="attendee-chip">
            <span class="attendee-chip-name">{pa.firstName || pa.email}</span>
            <button
              type="button"
              class="attendee-chip-remove"
              aria-label="Remove {pa.email}"
              on:click={() => onRemovePending && onRemovePending(pa.email)}
            >×</button>
          </span>
        {/each}
      </div>
    {:else}
      <p class="attendee-empty">No travelers added yet.</p>
    {/if}
  {/if}

  <div class="attendee-add-row">
    <div class="attendee-input-wrap">
      <input
        type="text"
        class="attendee-email-input"
        placeholder="Search by name or email"
        bind:value={attendeeEmailInput}
        on:input={onInput}
        on:blur={onDismissSuggestions}
        on:keydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (mode === 'edit') {
              onAddAttendee && onAddAttendee(itemType, itemId);
            } else {
              onQueueAttendee && onQueueAttendee();
            }
          } else if (e.key === 'Escape') {
            onDismissSuggestions && onDismissSuggestions();
          }
        }}
        autocomplete="off"
      />
      {#if attendeeSuggestions.length > 0}
        <ul class="attendee-suggestions">
          {#each attendeeSuggestions as u (u.id)}
            <li>
              <button
                type="button"
                class="attendee-suggestion-item"
                on:mousedown={() => onSelectSuggestion && onSelectSuggestion(u, itemType, itemId, mode === 'create')}
              >
                <span class="suggestion-name">{u.firstName || ''} {u.lastName || ''}</span>
                <span class="suggestion-email">{u.email}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else if attendeeSuggestionsLoading}
        <ul class="attendee-suggestions">
          <li class="suggestion-loading">Searching…</li>
        </ul>
      {/if}
    </div>
    {#if mode === 'edit'}
      <button
        type="button"
        class="btn-attendee-add"
        disabled={attendeeAddLoading || !attendeeEmailInput.trim()}
        on:click={() => onAddAttendee && onAddAttendee(itemType, itemId)}
      >{attendeeAddLoading ? '…' : 'Add'}</button>
    {:else}
      <button
        type="button"
        class="btn-attendee-add"
        disabled={!attendeeEmailInput.trim()}
        on:click={() => onQueueAttendee && onQueueAttendee()}
      >Add</button>
    {/if}
  </div>

  {#if attendeeAddError}
    <p class="attendee-error">{attendeeAddError}</p>
  {/if}
</div>

<style>
  .attendee-section {
    margin-top: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--glass-bg-light, rgba(255,255,255,0.05));
    border: 1px solid var(--glass-border-dark, rgba(0,0,0,0.12));
    border-radius: var(--radius-md, 8px);
  }

  .attendee-section-title {
    color: var(--dark-text);
    margin: 0 0 var(--spacing-sm) 0;
  }

  .attendee-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-sm);
  }

  .attendee-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.2rem 0.5rem;
    background: var(--primary-color, #4f46e5);
    color: #fff;
    border-radius: var(--radius-md);
    font-size: 0.8rem;
  }

  .attendee-chip-name {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attendee-chip-remove {
    background: none;
    border: none;
    color: rgba(255,255,255,0.8);
    cursor: pointer;
    padding: 0;
    font-size: 0.8rem;
    line-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .attendee-chip-remove:hover {
    color: #fff;
  }

  .attendee-add-row {
    display: flex;
    gap: var(--spacing-xs);
    align-items: flex-start;
  }

  .attendee-input-wrap {
    position: relative;
    flex: 1;
  }

  .attendee-suggestions {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    z-index: 100;
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
    background: var(--white, #fff);
    border: 1px solid var(--glass-border-dark, rgba(0,0,0,0.15));
    border-radius: var(--radius-sm, 4px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    max-height: 200px;
    overflow-y: auto;
  }

  .attendee-suggestion-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 0.45rem 0.75rem;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    gap: 0.1rem;
  }

  .attendee-suggestion-item:hover {
    background: var(--glass-bg-light, rgba(79,70,229,0.06));
  }

  .suggestion-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--dark-text);
    line-height: 1.2;
  }

  .suggestion-email {
    font-size: 0.78rem;
    color: var(--gray-dark, #6b7280);
    line-height: 1.2;
  }

  .suggestion-loading {
    padding: 0.5rem 0.75rem;
    font-size: 0.82rem;
    color: var(--gray-dark, #6b7280);
  }

  .attendee-email-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
    border: 1px solid var(--glass-border-dark, rgba(0,0,0,0.18));
    border-radius: var(--radius-sm, 4px);
    background: var(--white, #fff);
    color: var(--dark-text);
    outline: none;
  }

  .attendee-email-input:focus {
    border-color: var(--primary-color, #4f46e5);
    box-shadow: 0 0 0 2px rgba(79,70,229,0.15);
  }

  .btn-attendee-add {
    padding: 0.4rem 0.8rem;
    font-size: 0.85rem;
    font-weight: 600;
    background: var(--primary-color, #4f46e5);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm, 4px);
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-attendee-add:hover:not(:disabled) {
    background: var(--primary-dark, #4338ca);
  }

  .btn-attendee-add:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .attendee-error {
    font-size: 0.8rem;
    color: #ef4444;
    margin: var(--spacing-xs) 0 0 0;
  }

  .attendee-empty {
    font-size: 0.82rem;
    color: var(--gray-dark, #6b7280);
    margin: 0 0 var(--spacing-sm) 0;
  }
</style>
