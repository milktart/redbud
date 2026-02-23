<script>
  import { onMount, onDestroy } from 'svelte';
  import intlTelInput from 'intl-tel-input/intlTelInputWithUtils';
  import 'intl-tel-input/styles';

  export let value = '';
  export let id = 'phone-input';
  export let initialCountry = 'us';
  export let onChangeNumber = null;
  export let disabled = false;

  let inputEl;
  let iti;

  onMount(() => {
    iti = intlTelInput(inputEl, {
      initialCountry,
      loadUtils: false, // utils already bundled in intlTelInputWithUtils
    });

    // Set initial value if provided
    if (value) {
      iti.setNumber(value);
    }

    inputEl.addEventListener('change', handleChange);
    inputEl.addEventListener('keyup', handleChange);
    inputEl.addEventListener('focus', handleFocus);
  });

  onDestroy(() => {
    if (inputEl) {
      inputEl.removeEventListener('change', handleChange);
      inputEl.removeEventListener('keyup', handleChange);
      inputEl.removeEventListener('focus', handleFocus);
    }
    if (iti) {
      iti.destroy();
    }
  });

  function handleFocus() {
    if (!inputEl.value.trim()) {
      inputEl.value = '+';
    }
  }

  function handleChange() {
    const num = iti.getNumber();
    value = num;
    if (onChangeNumber) onChangeNumber(num);
  }
</script>

<input bind:this={inputEl} type="tel" {id} {disabled} />

<style>
  :global(.iti) {
    display: block;
    width: 100%;
  }

  :global(.iti__flag-container .iti__selected-dial-code) {
    font-size: 0.85rem;
    color: var(--dark-text);
  }
</style>
