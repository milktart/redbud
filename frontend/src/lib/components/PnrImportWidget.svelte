<script>
  import { pnrAPI } from '../services/api.js';

  export let loyaltyPrograms = [];
  export let onImportFlights = null;

  // Derive qualifying Delta accounts
  $: deltaAccounts = loyaltyPrograms.filter(
    p =>
      p.category === 'airline' &&
      p.programName.toLowerCase().includes('delta') &&
      p.accountFirstName &&
      p.accountLastName
  );

  // State machine: idle | loading | results | importing | done | error
  let phase = 'idle';
  let pnr = '';
  let errorMsg = '';
  let flights = [];
  let importedCount = 0;

  function reset() {
    phase = 'idle';
    pnr = '';
    errorMsg = '';
    flights = [];
    importedCount = 0;
  }

  async function handleLookup() {
    const trimmed = pnr.trim().toUpperCase();
    if (!/^[A-Z0-9]{5,7}$/.test(trimmed)) {
      errorMsg = 'PNR must be 5–7 alphanumeric characters.';
      return;
    }
    errorMsg = '';
    phase = 'loading';
    try {
      const data = await pnrAPI.lookupPnr(trimmed, 'delta');
      flights = data?.flights ?? [];
      phase = 'results';
    } catch (err) {
      errorMsg = err?.message || 'Lookup failed. Please try again.';
      phase = 'error';
    }
  }

  async function handleImport() {
    if (!onImportFlights || flights.length === 0) return;
    phase = 'importing';
    try {
      await onImportFlights(flights);
      importedCount = flights.length;
      phase = 'done';
    } catch (err) {
      errorMsg = err?.message || 'Import failed. Please try again.';
      phase = 'error';
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter') handleLookup();
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    if (!year || !month || !day) return dateStr;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
  }
</script>

{#if deltaAccounts.length > 0}
  <div class="pnr-widget">
    <div class="pnr-widget__header">
      <span class="pnr-widget__label">Import flights by PNR</span>
    </div>

    {#if phase === 'idle' || phase === 'error'}
      <div class="pnr-widget__input-row">
        <input
          class="pnr-widget__input"
          type="text"
          placeholder="PNR"
          bind:value={pnr}
          on:keydown={handleKeydown}
          maxlength="7"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="characters"
          spellcheck="false"
        />
        <button
          type="button"
          class="pnr-widget__btn-lookup"
          on:click={handleLookup}
          disabled={!pnr.trim()}
        >
          Look up
        </button>
      </div>
      {#if errorMsg}
        <p class="pnr-widget__error">{errorMsg}</p>
      {/if}

    {:else if phase === 'loading'}
      <div class="pnr-widget__status">
        <span class="pnr-widget__spinner"></span>
        <span class="pnr-widget__status-text">Looking up PNR… (this may take a minute)</span>
      </div>

    {:else if phase === 'results'}
      {#if flights.length === 0}
        <p class="pnr-widget__empty">No flights found for that PNR.</p>
        <button type="button" class="pnr-widget__link" on:click={reset}>Try again</button>
      {:else}
        <ul class="pnr-widget__flight-list">
          {#each flights as f}
            <li class="pnr-widget__flight-item">
              <span class="pnr-widget__flt-num">{f.flightNumber}</span>
              <span class="pnr-widget__flt-route">{f.origin} → {f.destination}</span>
              <span class="pnr-widget__flt-date">{formatDate(f.departureDate)}{f.departureTime ? ' ' + f.departureTime : ''}</span>
            </li>
          {/each}
        </ul>
        <div class="pnr-widget__actions">
          <button type="button" class="pnr-widget__btn-import" on:click={handleImport}>
            Import {flights.length} flight{flights.length !== 1 ? 's' : ''}
          </button>
          <button type="button" class="pnr-widget__btn-cancel" on:click={reset}>Cancel</button>
        </div>
      {/if}

    {:else if phase === 'importing'}
      <div class="pnr-widget__status">
        <span class="pnr-widget__spinner"></span>
        <span class="pnr-widget__status-text">Importing flights…</span>
      </div>

    {:else if phase === 'done'}
      <div class="pnr-widget__done">
        <span class="pnr-widget__check">✓</span>
        <span>{importedCount} flight{importedCount !== 1 ? 's' : ''} imported.</span>
        <button type="button" class="pnr-widget__link" on:click={reset}>Import more</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .pnr-widget {
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) var(--spacing-md);
    margin-top: var(--spacing-md);
    background: var(--glass-bg-medium);
  }

  .pnr-widget__header {
    margin-bottom: var(--spacing-xs);
  }

  .pnr-widget__label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--gray-text);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .pnr-widget__input-row {
    display: flex;
    gap: var(--spacing-xs);
    min-width: 0;
  }

  .pnr-widget__input {
    flex: 1 1 0;
    min-width: 0;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    font-size: 0.875rem;
    background: var(--white);
    font-family: monospace;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .pnr-widget__input:focus {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 2px var(--primary-light);
  }

  .pnr-widget__btn-lookup {
    padding: 0.35rem 0.75rem;
    background: var(--primary-color);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
  }

  .pnr-widget__btn-lookup:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pnr-widget__btn-lookup:hover:not(:disabled) {
    opacity: 0.85;
  }

  .pnr-widget__error {
    margin: var(--spacing-xs) 0 0;
    font-size: 0.8125rem;
    color: #ef4444;
  }

  .pnr-widget__status {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) 0;
  }

  .pnr-widget__spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--glass-border);
    border-top-color: var(--primary-color);
    border-radius: 50%;
    animation: pnr-spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes pnr-spin {
    to { transform: rotate(360deg); }
  }

  .pnr-widget__status-text {
    font-size: 0.8125rem;
    color: var(--gray-text);
  }

  .pnr-widget__empty {
    margin: var(--spacing-xs) 0 0;
    font-size: 0.8125rem;
    color: var(--gray-text);
  }

  .pnr-widget__flight-list {
    list-style: none;
    margin: var(--spacing-xs) 0 var(--spacing-sm);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pnr-widget__flight-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: 0.8125rem;
    padding: 4px 6px;
    border-radius: var(--radius-sm);
    background: var(--white);
    border: 1px solid var(--glass-border);
  }

  .pnr-widget__flt-num {
    font-family: monospace;
    font-weight: 700;
    color: var(--primary-color);
    min-width: 52px;
  }

  .pnr-widget__flt-route {
    font-weight: 600;
    color: var(--text-primary, #1a1a2e);
    min-width: 80px;
  }

  .pnr-widget__flt-date {
    color: var(--gray-text);
    font-size: 0.75rem;
    margin-left: auto;
  }

  .pnr-widget__actions {
    display: flex;
    gap: var(--spacing-xs);
  }

  .pnr-widget__btn-import {
    padding: 0.35rem 0.75rem;
    background: var(--primary-color);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .pnr-widget__btn-import:hover {
    opacity: 0.85;
  }

  .pnr-widget__btn-cancel {
    padding: 0.35rem 0.75rem;
    background: transparent;
    color: var(--gray-text);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-sm);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .pnr-widget__btn-cancel:hover {
    border-color: var(--primary-light);
    color: var(--primary-color);
  }

  .pnr-widget__done {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: 0.875rem;
    color: var(--gray-text);
    padding: var(--spacing-xs) 0;
  }

  .pnr-widget__check {
    color: var(--green-400, #4ade80);
    font-weight: 700;
  }

  .pnr-widget__link {
    background: none;
    border: none;
    color: var(--primary-color);
    cursor: pointer;
    font-size: 0.8125rem;
    padding: 0;
    text-decoration: underline;
    margin-left: var(--spacing-xs);
  }
</style>
