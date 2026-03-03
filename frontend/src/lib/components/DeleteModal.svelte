<script>
  export let show = false;
  export let confirmText = '';
  export let submitting = false;
  export let error = '';
  export let onConfirm = null;
  export let onCancel = null;
</script>

{#if show}
  <div class="delete-modal-overlay" on:click|self={onCancel} role="presentation">
    <div class="delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
      <div class="delete-modal-header">
        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" class="delete-modal-icon"><path d="m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm330.5-51.5Q520-263 520-280t-11.5-28.5Q497-320 480-320t-28.5 11.5Q440-297 440-280t11.5 28.5Q463-240 480-240t28.5-11.5ZM440-360h80v-200h-80v200Zm40-100Z"/></svg>
        <h3 id="delete-modal-title" class="delete-modal-title">Delete All Trip Data</h3>
      </div>
      <p class="delete-modal-description">This will permanently delete all trips, trip items, and standalone items you have created. This action <strong>cannot be undone</strong>.</p>
      <p class="delete-modal-description">Items you have been added to as a companion will not be affected.</p>
      <p class="delete-modal-prompt">Type <strong>DELETE</strong> to confirm:</p>
      <input
        type="text"
        class="delete-modal-input"
        bind:value={confirmText}
        placeholder="DELETE"
        autocomplete="off"
        spellcheck="false"
      />
      {#if error}
        <p class="delete-modal-error">{error}</p>
      {/if}
      <div class="delete-modal-actions">
        <button type="button" class="btn-secondary" on:click={onCancel} disabled={submitting}>Cancel</button>
        <button
          type="button"
          class="btn-danger"
          on:click={onConfirm}
          disabled={confirmText !== 'DELETE' || submitting}
        >
          {submitting ? 'Deleting...' : 'Delete All Trip Data'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .delete-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--spacing-lg);
  }

  .delete-modal {
    background: var(--surface-color, #fff);
    border-radius: var(--radius-lg);
    padding: var(--spacing-xl);
    max-width: 440px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .delete-modal-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .delete-modal-icon {
    color: #dc2626;
    flex-shrink: 0;
  }

  .delete-modal-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: #dc2626;
    margin: 0;
  }

  .delete-modal-description {
    font-size: 0.875rem;
    color: var(--gray-text);
    margin: 0;
    line-height: 1.5;
  }

  .delete-modal-prompt {
    font-size: 0.875rem;
    color: var(--dark-text);
    margin: 0;
  }

  .delete-modal-input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1.5px solid var(--glass-border-dark);
    border-radius: var(--radius-md);
    font-size: 1rem;
    font-family: monospace;
    letter-spacing: 0.1em;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.15s;
  }

  .delete-modal-input:focus {
    border-color: #dc2626;
  }

  .delete-modal-error {
    font-size: 0.8rem;
    color: #dc2626;
    margin: 0;
  }

  .delete-modal-actions {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-sm);
  }

  .delete-modal-actions :global(.btn-danger) {
    flex: 2;
  }

  .delete-modal-actions :global(.btn-secondary) {
    flex: 1;
  }
</style>
