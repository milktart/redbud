<script>
  import { timeInput } from '../actions/timeInput.js';
  import PhoneInput from './PhoneInput.svelte';

  /**
   * Shared item form fields for all item types.
   * Parent mutates `form` directly via object reference.
   *
   * Props:
   *   form         — the item form object (itemForm or editForm), mutated directly
   *   idPrefix     — prefix for HTML `id` attributes to avoid duplicates (e.g., '' or 'edit-' or 'm-edit-')
   *   onFlightNumberInput  — (event) => void — handles flight number input (uppercases, looks up airline)
   *   onStartDateChange    — (startField, endField) => void
   *   onEndDateChange      — (startField, endField) => void
   */
  export let form = {};
  export let idPrefix = '';
  export let onFlightNumberInput = null;
  export let onStartDateChange = null;
  export let onEndDateChange = null;
</script>

<!-- Flight Form -->
{#if form.itemType === 'flight'}
  <div class="form-row">
    <div class="form-group form-group--30">
      <label for="{idPrefix}flight-number">Flight *</label>
      <input
        type="text"
        id="{idPrefix}flight-number"
        value={form.flightNumber}
        on:input={onFlightNumberInput}
        placeholder="e.g., AA100"
        required
      />
    </div>
    <div class="form-group form-group--70">
      <label for="{idPrefix}airline">Airline</label>
      <input type="text" id="{idPrefix}airline" value={form.airline} placeholder="Auto-populated" disabled />
    </div>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="{idPrefix}origin">Origin *</label>
      <input type="text" id="{idPrefix}origin" bind:value={form.origin} placeholder="e.g., JFK" required />
    </div>
    <div class="form-group">
      <label for="{idPrefix}destination">Destination *</label>
      <input type="text" id="{idPrefix}destination" bind:value={form.destination} placeholder="e.g., LAX" required />
    </div>
  </div>

  <div class="form-row">
    <div class="form-group form-group--half">
      <label for="{idPrefix}departure-date">Departure Date *</label>
      <input
        type="date"
        id="{idPrefix}departure-date"
        bind:value={form.departureDate}
        on:change={() => onStartDateChange && onStartDateChange('departureDate', 'arrivalDate')}
        required
      />
    </div>
    <div class="form-group form-group--half">
      <label for="{idPrefix}arrival-date">Arrival Date *</label>
      <input
        type="date"
        id="{idPrefix}arrival-date"
        bind:value={form.arrivalDate}
        on:change={() => onEndDateChange && onEndDateChange('departureDate', 'arrivalDate')}
        required
      />
    </div>
  </div>

  <div class="form-row">
    <div class="form-group form-group--half">
      <label for="{idPrefix}departure-time">Departure Time *</label>
      <input
        type="text"
        inputmode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        placeholder="HH:MM"
        use:timeInput
        id="{idPrefix}departure-time"
        bind:value={form.departureTime}
        required
      />
    </div>
    <div class="form-group form-group--half">
      <label for="{idPrefix}arrival-time">Arrival Time *</label>
      <input
        type="text"
        inputmode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        placeholder="HH:MM"
        use:timeInput
        id="{idPrefix}arrival-time"
        bind:value={form.arrivalTime}
        required
      />
    </div>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="{idPrefix}pnr">PNR / Confirmation</label>
      <input type="text" id="{idPrefix}pnr" bind:value={form.pnr} placeholder="Booking reference" />
    </div>
    <div class="form-group">
      <label for="{idPrefix}seat">Seat</label>
      <input type="text" id="{idPrefix}seat" bind:value={form.seat} placeholder="e.g., 12A" />
    </div>
  </div>
{/if}

<!-- Hotel Form -->
{#if form.itemType === 'hotel'}
  <div class="form-group">
    <label for="{idPrefix}hotel-name">Hotel Name *</label>
    <input type="text" id="{idPrefix}hotel-name" bind:value={form.hotelName} placeholder="e.g., Hilton Garden Inn" required />
  </div>

  <div class="form-group">
    <label for="{idPrefix}address">Address *</label>
    <textarea id="{idPrefix}address" bind:value={form.address} placeholder="Full hotel address" rows="2" required></textarea>
  </div>

  <div class="form-group">
    <label for="{idPrefix}hotel-phone">Phone</label>
    <PhoneInput id="{idPrefix}hotel-phone" value={form.phone} onChangeNumber={(num) => { form.phone = num; }} />
  </div>

  <div class="form-row">
    <div class="form-group form-group--half">
      <label for="{idPrefix}check-in-date">Check-in Date *</label>
      <input
        type="date"
        id="{idPrefix}check-in-date"
        bind:value={form.checkInDate}
        on:change={() => onStartDateChange && onStartDateChange('checkInDate', 'checkOutDate')}
        required
      />
    </div>
    <div class="form-group form-group--half">
      <label for="{idPrefix}check-out-date">Check-out Date *</label>
      <input
        type="date"
        id="{idPrefix}check-out-date"
        bind:value={form.checkOutDate}
        on:change={() => onEndDateChange && onEndDateChange('checkInDate', 'checkOutDate')}
        required
      />
    </div>
  </div>

  <div class="form-row">
    <div class="form-group form-group--half">
      <label for="{idPrefix}check-in-time">Check-in Time *</label>
      <input
        type="text"
        inputmode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        placeholder="HH:MM"
        use:timeInput
        id="{idPrefix}check-in-time"
        bind:value={form.checkInTime}
        required
      />
    </div>
    <div class="form-group form-group--half">
      <label for="{idPrefix}check-out-time">Check-out Time *</label>
      <input
        type="text"
        inputmode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        placeholder="HH:MM"
        use:timeInput
        id="{idPrefix}check-out-time"
        bind:value={form.checkOutTime}
        required
      />
    </div>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="{idPrefix}confirmation-number">Confirmation #</label>
      <input type="text" id="{idPrefix}confirmation-number" bind:value={form.confirmationNumber} placeholder="Booking number" />
    </div>
    <div class="form-group">
      <label for="{idPrefix}room-number">Room Number</label>
      <input type="text" id="{idPrefix}room-number" bind:value={form.roomNumber} placeholder="e.g., 205" />
    </div>
  </div>
{/if}

<!-- Transportation Form -->
{#if form.itemType === 'transportation'}
  <div class="form-group">
    <label for="{idPrefix}method">Method *</label>
    <input type="text" id="{idPrefix}method" bind:value={form.method} placeholder="e.g., Train, Bus, Ferry" required />
  </div>

  <div class="form-group">
    <label for="{idPrefix}journey-number">Journey/Route Number</label>
    <input type="text" id="{idPrefix}journey-number" bind:value={form.journeyNumber} placeholder="e.g., Route 405" />
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="{idPrefix}trans-origin">Origin *</label>
      <input type="text" id="{idPrefix}trans-origin" bind:value={form.origin} placeholder="Departure location" required />
    </div>
    <div class="form-group">
      <label for="{idPrefix}trans-destination">Destination *</label>
      <input type="text" id="{idPrefix}trans-destination" bind:value={form.destination} placeholder="Arrival location" required />
    </div>
  </div>

  <div class="form-row">
    <div class="form-group form-group--half">
      <label for="{idPrefix}trans-departure-date">Departure Date *</label>
      <input
        type="date"
        id="{idPrefix}trans-departure-date"
        bind:value={form.departureDate}
        on:change={() => onStartDateChange && onStartDateChange('departureDate', 'arrivalDate')}
        required
      />
    </div>
    <div class="form-group form-group--half">
      <label for="{idPrefix}trans-arrival-date">Arrival Date *</label>
      <input
        type="date"
        id="{idPrefix}trans-arrival-date"
        bind:value={form.arrivalDate}
        on:change={() => onEndDateChange && onEndDateChange('departureDate', 'arrivalDate')}
        required
      />
    </div>
  </div>

  <div class="form-row">
    <div class="form-group form-group--half">
      <label for="{idPrefix}trans-departure-time">Departure Time *</label>
      <input
        type="text"
        inputmode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        placeholder="HH:MM"
        use:timeInput
        id="{idPrefix}trans-departure-time"
        bind:value={form.departureTime}
        required
      />
    </div>
    <div class="form-group form-group--half">
      <label for="{idPrefix}trans-arrival-time">Arrival Time *</label>
      <input
        type="text"
        inputmode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        placeholder="HH:MM"
        use:timeInput
        id="{idPrefix}trans-arrival-time"
        bind:value={form.arrivalTime}
        required
      />
    </div>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="{idPrefix}trans-confirmation">Confirmation #</label>
      <input type="text" id="{idPrefix}trans-confirmation" bind:value={form.confirmationNumber} placeholder="Booking reference" />
    </div>
    <div class="form-group">
      <label for="{idPrefix}trans-seat">Seat</label>
      <input type="text" id="{idPrefix}trans-seat" bind:value={form.seat} placeholder="e.g., Coach 3, Seat 12" />
    </div>
  </div>
{/if}

<!-- Event Form -->
{#if form.itemType === 'event'}
  <div class="form-group">
    <label for="{idPrefix}event-name">Event Name *</label>
    <input type="text" id="{idPrefix}event-name" bind:value={form.name} placeholder="e.g., Concert, Conference" required />
  </div>

  <div class="form-group">
    <label for="{idPrefix}event-location">Location *</label>
    <textarea id="{idPrefix}event-location" bind:value={form.location} placeholder="Full address or venue name" rows="2" required></textarea>
  </div>

  <div class="form-row">
    <div class="form-group form-group--half">
      <label for="{idPrefix}start-date">Start Date *</label>
      <input
        type="date"
        id="{idPrefix}start-date"
        bind:value={form.startDate}
        on:change={() => onStartDateChange && onStartDateChange('startDate', 'endDate')}
        required
      />
    </div>
    <div class="form-group form-group--half">
      <label for="{idPrefix}end-date">End Date</label>
      <input
        type="date"
        id="{idPrefix}end-date"
        bind:value={form.endDate}
        on:change={() => onEndDateChange && onEndDateChange('startDate', 'endDate')}
      />
    </div>
  </div>

  <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-size:0.9rem; font-weight:500;">
    <input
      type="checkbox"
      bind:checked={form.allDay}
      on:change={() => {
        if (form.allDay) { form.startTime = '00:00'; form.endTime = '23:59'; }
        else { form.startTime = ''; form.endTime = ''; }
      }}
    />
    All day event
  </label>

  {#if !form.allDay}
  <div class="form-row">
    <div class="form-group form-group--half">
      <label for="{idPrefix}start-time">Start Time *</label>
      <input
        type="text"
        inputmode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        placeholder="HH:MM"
        use:timeInput
        id="{idPrefix}start-time"
        bind:value={form.startTime}
        required
      />
    </div>
    <div class="form-group form-group--half">
      <label for="{idPrefix}end-time">End Time</label>
      <input
        type="text"
        inputmode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        placeholder="HH:MM"
        use:timeInput
        id="{idPrefix}end-time"
        bind:value={form.endTime}
      />
    </div>
  </div>
  {/if}

  <div class="form-group">
    <label for="{idPrefix}description">Description</label>
    <textarea id="{idPrefix}description" bind:value={form.description} placeholder="Event details" rows="3"></textarea>
  </div>

  <div class="form-row">
    <div class="form-group">
      <label for="{idPrefix}contact-phone">Contact Phone</label>
      <PhoneInput id="{idPrefix}contact-phone" value={form.contactPhone} onChangeNumber={(num) => { form.contactPhone = num; }} />
    </div>
    <div class="form-group">
      <label for="{idPrefix}contact-email">Contact Email</label>
      <input type="email" id="{idPrefix}contact-email" bind:value={form.contactEmail} placeholder="info@event.com" />
    </div>
  </div>

  <div class="form-group">
    <label for="{idPrefix}event-url">Event URL</label>
    <input type="url" id="{idPrefix}event-url" bind:value={form.eventUrl} placeholder="https://..." />
  </div>
{/if}

<!-- Car Rental Form -->
{#if form.itemType === 'car_rental'}
  <div class="form-group">
    <label for="{idPrefix}company">Rental Company *</label>
    <input type="text" id="{idPrefix}company" bind:value={form.company} placeholder="e.g., Hertz, Enterprise" required />
  </div>

  <div class="form-group">
    <label for="{idPrefix}pickup-location">Pickup Location *</label>
    <input type="text" id="{idPrefix}pickup-location" bind:value={form.pickupLocation} placeholder="Full address" required />
  </div>

  <div class="form-row">
    <div class="form-group form-group--half">
      <label for="{idPrefix}pickup-date">Pickup Date *</label>
      <input
        type="date"
        id="{idPrefix}pickup-date"
        bind:value={form.pickupDate}
        on:change={() => onStartDateChange && onStartDateChange('pickupDate', 'dropoffDate')}
        required
      />
    </div>
    <div class="form-group form-group--half">
      <label for="{idPrefix}pickup-time">Pickup Time *</label>
      <input
        type="text"
        inputmode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        placeholder="HH:MM"
        use:timeInput
        id="{idPrefix}pickup-time"
        bind:value={form.pickupTime}
        required
      />
    </div>
  </div>

  <div class="form-group">
    <label for="{idPrefix}dropoff-location">Dropoff Location *</label>
    <input type="text" id="{idPrefix}dropoff-location" bind:value={form.dropoffLocation} placeholder="Full address" required />
  </div>

  <div class="form-row">
    <div class="form-group form-group--half">
      <label for="{idPrefix}dropoff-date">Dropoff Date *</label>
      <input
        type="date"
        id="{idPrefix}dropoff-date"
        bind:value={form.dropoffDate}
        on:change={() => onEndDateChange && onEndDateChange('pickupDate', 'dropoffDate')}
        required
      />
    </div>
    <div class="form-group form-group--half">
      <label for="{idPrefix}dropoff-time">Dropoff Time *</label>
      <input
        type="text"
        inputmode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        placeholder="HH:MM"
        use:timeInput
        id="{idPrefix}dropoff-time"
        bind:value={form.dropoffTime}
        required
      />
    </div>
  </div>

  <div class="form-group">
    <label for="{idPrefix}car-confirmation">Confirmation Number</label>
    <input type="text" id="{idPrefix}car-confirmation" bind:value={form.confirmationNumber} placeholder="Reservation number" />
  </div>
{/if}
