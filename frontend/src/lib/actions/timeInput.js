/**
 * Svelte action for HH:MM time input validation.
 * Enforces numeric-only input, auto-inserts colon after 2 digits,
 * and clamps hours to 0-23 and minutes to 0-59.
 */
export function timeInput(node) {
  let processing = false;

  function handleInput(e) {
    if (processing) return;
    const input = e.target;
    let val = input.value.replace(/[^0-9]/g, ''); // strip non-digits

    if (val.length >= 3) {
      val = val.slice(0, 2) + ':' + val.slice(2, 4);
    }

    // Clamp hours 0-23 and minutes 0-59
    if (val.length >= 2) {
      const h = parseInt(val.slice(0, 2), 10);
      if (h > 23) val = '23' + val.slice(2);
    }
    if (val.length === 5) {
      const m = parseInt(val.slice(3, 5), 10);
      if (m > 59) val = val.slice(0, 3) + '59';
    }

    if (input.value !== val) {
      processing = true;
      input.value = val;
      // Dispatch an input event so bind:value picks up the new value
      input.dispatchEvent(new Event('input', { bubbles: true }));
      processing = false;
    }
  }

  // Use keydown to intercept and block non-numeric keys cleanly
  function handleKeydown(e) {
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Enter'];
    if (allowed.includes(e.key)) return;
    if (!/^[0-9]$/.test(e.key)) e.preventDefault();
  }

  node.addEventListener('keydown', handleKeydown);
  node.addEventListener('input', handleInput, true); // capture phase so we run before bind:value

  return {
    destroy() {
      node.removeEventListener('keydown', handleKeydown);
      node.removeEventListener('input', handleInput, true);
    }
  };
}
