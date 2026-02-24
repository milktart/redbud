<script>
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { authAPI, tripAPI, itemAPI, attendeeAPI, companionAPI, usersAPI } from '../lib/services/api';
  import PhoneInput from '../lib/components/PhoneInput.svelte';
  import { lookupAirline } from '../lib/data/airlines.js';
  import { user, isAuthenticated } from '../lib/stores/user';
  import CalendarView from '../lib/components/CalendarView.svelte';
  import ContentPane from '../lib/components/ContentPane.svelte';
  import PaneColumn from '../lib/components/PaneColumn.svelte';
  import 'leaflet/dist/leaflet.css';

  let mapContainer;
  let map;
  let timelineVersion = 0;
  let trips = [];        // my trips: owned + attendee
  let friendsTrips = []; // companion-shared trips (friends timeline only)
  let items = [];
  let standaloneItems = [];
  let attendeeStandaloneItems = [];   // standalone items I was added to as attendee
  let companionStandaloneItems = [];  // standalone items from companion-shared library
  let isMobileView = typeof window !== 'undefined' && window.innerWidth <= 640;
  let activePane = 'timeline'; // 'timeline' | 'history' | 'shared' | 'calendar' | 'settings' | 'addNew' | null
  let activeSettingsSection = null; // 'profile' | 'security' | 'appearance' | 'notifications' | 'export' | 'import'
  let profileForm = { firstName: '', lastName: '', email: '', phone: '' };
  let profileSaveError = '';
  let profileSaveSuccess = false;

  // Import state
  let importFileError = '';
  let importData = null;       // annotated response from /import/preview
  let importCompanions = [];   // companions array from parsed file
  let importSelections = {};   // { [key]: bool }
  let importLoading = false;
  let importSubmitting = false;
  let importResult = null;     // { imported, skipped, errors }

  $: if (activeSettingsSection !== 'import') {
    importData = null;
    importCompanions = [];
    importSelections = {};
    importFileError = '';
    importResult = null;
  }

  $: if (activeSettingsSection === 'profile' && $user) {
    profileForm = { firstName: $user.firstName ?? '', lastName: $user.lastName ?? '', email: $user.email ?? '', phone: $user.phone ?? '' };
    profileSaveError = '';
    profileSaveSuccess = false;
  }

  async function handleExportData() {
    try {
      await usersAPI.exportData();
    } catch (err) {
      console.error('Export failed:', err);
    }
  }

  let importDragOver = false;

  function handleImportDrop(e) {
    e.preventDefault();
    importDragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    processImportFile(file);
  }

  async function handleImportFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    processImportFile(file);
  }

  async function processImportFile(file) {

    importFileError = '';
    importData = null;
    importSelections = {};
    importResult = null;
    importLoading = true;

    try {
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        importFileError = 'Invalid JSON file. Please select a valid travel data export.';
        importLoading = false;
        return;
      }

      if (!parsed.trips || !Array.isArray(parsed.trips)) {
        importFileError = 'File does not appear to be a travel data export (missing "trips" array).';
        importLoading = false;
        return;
      }

      importCompanions = Array.isArray(parsed.companions) ? parsed.companions : [];
      const result = await usersAPI.importPreview({ trips: parsed.trips, standalone: parsed.standalone ?? null, vouchers: parsed.vouchers ?? null });
      importData = result;

      // Build selection map — duplicates unchecked by default
      importSelections = {};
      for (const trip of importData.trips) {
        importSelections[`trip:${trip._importIndex}`] = !trip.isDuplicate;
        for (const [type, items] of Object.entries({
          flights: trip.flights ?? [],
          hotels: trip.hotels ?? [],
          transportation: trip.transportation ?? [],
          carRentals: trip.carRentals ?? [],
          events: trip.events ?? [],
        })) {
          for (const item of items) {
            importSelections[`${type}:${trip._importIndex}:${item._importIndex}`] = !item.isDuplicate;
          }
        }
      }
      if (importData.standalone) {
        for (const [type, items] of Object.entries(importData.standalone)) {
          for (const item of (items ?? [])) {
            importSelections[`standalone:${type}:${item._importIndex}`] = !item.isDuplicate;
          }
        }
      }
      for (const v of (importData.vouchers ?? [])) {
        importSelections[`voucher:${v._importIndex}`] = !v.isDuplicate;
      }
    } catch (err) {
      importFileError = err.message || 'Failed to process file.';
    } finally {
      importLoading = false;
      // Reset input so same file can be re-selected
      const input = document.getElementById('import-file-input');
      if (input) input.value = '';
    }
  }

  async function handleExecuteImport() {
    if (!importData) return;
    importSubmitting = true;
    importResult = null;

    // Build the payload
    const stripAnnotations = (item) => {
      const { isDuplicate: _id, duplicateOf: _do, _importIndex: _ii, ...data } = item;
      return data;
    };

    const tripsPayload = importData.trips.map((trip) => {
      const tripKey = `trip:${trip._importIndex}`;
      const { isDuplicate, duplicateOf, _importIndex, flights, hotels, transportation, carRentals, events, ...tripData } = trip;

      const buildItems = (items, type) =>
        (items ?? []).map((item) => {
          const itemKey = `${type}:${trip._importIndex}:${item._importIndex}`;
          return { data: stripAnnotations(item), selected: !!importSelections[itemKey] };
        });

      return {
        tripData,
        selected: !!importSelections[tripKey],
        items: {
          flights: buildItems(flights, 'flights'),
          hotels: buildItems(hotels, 'hotels'),
          transportation: buildItems(transportation, 'transportation'),
          carRentals: buildItems(carRentals, 'carRentals'),
          events: buildItems(events, 'events'),
        },
      };
    });

    let standalonePayload = null;
    if (importData.standalone) {
      standalonePayload = {};
      for (const [type, items] of Object.entries(importData.standalone)) {
        standalonePayload[type] = (items ?? []).map((item) => ({
          data: stripAnnotations(item),
          selected: !!importSelections[`standalone:${type}:${item._importIndex}`],
        }));
      }
    }

    const vouchersPayload = (importData.vouchers ?? []).map((v) => ({
      data: stripAnnotations(v),
      selected: !!importSelections[`voucher:${v._importIndex}`],
    }));

    try {
      const result = await usersAPI.executeImport(tripsPayload, importCompanions, standalonePayload, vouchersPayload);
      importResult = result;
      if (result.imported > 0) {
        await loadTripsAndItems();
      }
    } catch (err) {
      importResult = { imported: 0, skipped: 0, errors: [{ error: err.message }] };
    } finally {
      importSubmitting = false;
    }
  }

  $: importSelectedCount = Object.values(importSelections).filter(Boolean).length;

  $: importSummary = importData ? (() => {
    const trips = importData.trips.length;
    const countItems = (arr) => (arr?.length ?? 0);
    const countDups = (arr) => (arr?.filter(x => x.isDuplicate).length ?? 0);
    const itemTypes = ['flights', 'hotels', 'transportation', 'carRentals', 'events'];
    const tripItems = importData.trips.reduce((n, t) =>
      n + itemTypes.reduce((m, k) => m + countItems(t[k]), 0), 0);
    const standaloneItems = importData.standalone
      ? itemTypes.reduce((n, k) => n + countItems(importData.standalone[k]), 0) : 0;
    const voucherCount = importData.vouchers?.length ?? 0;
    const dups = importData.trips.reduce((n, t) =>
      n + (t.isDuplicate ? 1 : 0) + itemTypes.reduce((m, k) => m + countDups(t[k]), 0), 0)
      + (importData.standalone ? itemTypes.reduce((n, k) => n + countDups(importData.standalone[k]), 0) : 0)
      + countDups(importData.vouchers);
    return { trips, items: tripItems + standaloneItems, vouchers: voucherCount, dups };
  })() : null;

  async function handleSaveProfile(e) {
    e.preventDefault();
    profileSaveError = '';
    profileSaveSuccess = false;
    try {
      const updated = await usersAPI.updateMe({
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        phone: profileForm.phone || null,
      });
      user.set({ ...$user, ...updated });
      profileSaveSuccess = true;
    } catch (err) {
      profileSaveError = err.message || 'Failed to save profile';
    }
  }

  let companions = [];
  let companionsLoading = false;
  let addingCompanion = false;
  let addCompanionEmail = '';
  let addCompanionFirstName = '';
  let addCompanionLastName = '';
  let addCompanionError = '';
  let companionLookupLoading = false;
  let companionEmailLookupTimer = null;
  let companionSuggestions = [];

  function onCompanionIdentifierInput() {
    clearTimeout(companionEmailLookupTimer);
    addCompanionFirstName = '';
    addCompanionLastName = '';
    companionSuggestions = [];
    const q = addCompanionEmail.trim();
    if (q.length < 2) return;
    companionLookupLoading = true;
    companionEmailLookupTimer = setTimeout(async () => {
      try {
        const results = await companionAPI.searchUsers(q);
        companionSuggestions = results;
      } catch {
        companionSuggestions = [];
      } finally {
        companionLookupLoading = false;
      }
    }, 300);
  }

  function selectCompanionSuggestion(u) {
    addCompanionEmail = u.email || u.phone || '';
    addCompanionFirstName = u.firstName ?? '';
    addCompanionLastName = u.lastName?.[0] ?? '';
    companionSuggestions = [];
  }

  function dismissCompanionSuggestions() {
    setTimeout(() => { companionSuggestions = []; }, 150);
  }
  let selectedCompanion = null;

  async function loadCompanions() {
    companionsLoading = true;
    try {
      companions = await companionAPI.getMyCompanions();
    } finally {
      companionsLoading = false;
    }
  }

  async function handleAddCompanion() {
    addCompanionError = '';
    if (!addCompanionEmail.trim()) return;
    try {
      await companionAPI.addCompanion(addCompanionEmail.trim(), addCompanionFirstName.trim(), addCompanionLastName.trim());
      addCompanionEmail = '';
      addCompanionFirstName = '';
      addCompanionLastName = '';
      addingCompanion = false;
      await loadCompanions();
    } catch (err) {
      addCompanionError = err.message ?? 'Failed to add companion';
    }
  }

  let editingCompanion = null;
  let editCompanionPermission = 'view';
  let editCompanionError = '';

  function openEditCompanion(companion) {
    editingCompanion = companion;
    editCompanionPermission = companion.permissionLevel;
    editCompanionError = '';
    addingCompanion = false;
  }

  function closeEditCompanion() {
    editingCompanion = null;
    editCompanionError = '';
  }

  async function handleSaveEditCompanion() {
    if (!editingCompanion) return;
    editCompanionError = '';
    try {
      await companionAPI.updatePermission(editingCompanion.companionUser.id, editCompanionPermission);
      await loadCompanions();
      closeEditCompanion();
    } catch (err) {
      editCompanionError = err.message ?? 'Failed to update permissions';
    }
  }

  async function handleRemoveCompanion(companionUserId) {
    try {
      await companionAPI.removeCompanion(companionUserId);
      if (editingCompanion?.companionUser?.id === companionUserId) closeEditCompanion();
      await loadCompanions();
    } catch (err) {
      // silently fail — could surface an error state later
    }
  }

  async function handleUpdatePermission(companionUserId, permissionLevel) {
    try {
      await companionAPI.updatePermission(companionUserId, permissionLevel);
      await loadCompanions();
    } catch (err) {
      // silently fail
    }
  }

  $: if (activeSettingsSection === 'companions') {
    loadCompanions();
  } else {
    addingCompanion = false;
    addCompanionEmail = '';
    addCompanionFirstName = '';
    addCompanionLastName = '';
    addCompanionError = '';
    editingCompanion = null;
    editCompanionError = '';
  }
  // ── Attendee management (shared across trip/item forms) ──────────────────────

  // For edit forms: current attendees loaded from API
  let formAttendees = [];
  let formAttendeesLoading = false;

  // For all forms: the email input and transient error
  let attendeeEmailInput = '';
  let attendeeAddError = '';
  let attendeeAddLoading = false;

  // Context for the currently open form  ('trip' | itemType string | null)
  let attendeeContext = null; // { itemType, itemId } — null on create forms
  // For create forms: queue attendees to add after the item is created
  let pendingAttendees = []; // [{ email, firstName?, lastName? }]

  // Autosuggestion state
  let attendeeSuggestions = [];
  let attendeeSuggestionsLoading = false;
  let attendeeLookupTimer = null;

  async function loadFormAttendees(itemType, itemId) {
    formAttendeesLoading = true;
    formAttendees = [];
    try {
      formAttendees = await attendeeAPI.getAttendees(itemType, itemId);
    } catch {
      formAttendees = [];
    } finally {
      formAttendeesLoading = false;
    }
  }

  function resetAttendeeState() {
    formAttendees = [];
    attendeeEmailInput = '';
    attendeeAddError = '';
    attendeeAddLoading = false;
    attendeeContext = null;
    pendingAttendees = [];
    attendeeSuggestions = [];
    clearTimeout(attendeeLookupTimer);
  }

  function onAttendeeInput() {
    clearTimeout(attendeeLookupTimer);
    attendeeSuggestions = [];
    attendeeAddError = '';
    const q = attendeeEmailInput.trim();
    if (q.length < 2) return;
    attendeeLookupTimer = setTimeout(async () => {
      attendeeSuggestionsLoading = true;
      try {
        const results = await companionAPI.searchUsers(q);
        // Filter out already-added attendees/pending
        const existingEmails = new Set([
          ...formAttendees.map(a => a.user?.email).filter(Boolean),
          ...pendingAttendees.map(a => a.email),
        ]);
        attendeeSuggestions = results.filter(u => u.email && !existingEmails.has(u.email));
      } catch {
        attendeeSuggestions = [];
      } finally {
        attendeeSuggestionsLoading = false;
      }
    }, 300);
  }

  function dismissAttendeeSuggestions() {
    // Small delay so click on suggestion fires first
    setTimeout(() => { attendeeSuggestions = []; }, 150);
  }

  function selectAttendeeSuggestion(user, itemType, itemId, isCreate) {
    attendeeEmailInput = user.email;
    attendeeSuggestions = [];
    if (isCreate) {
      handleQueueAttendee(user.firstName, user.lastName);
    } else {
      handleAddAttendee(itemType, itemId);
    }
  }

  // Called when an edit form opens
  function openAttendeeContext(itemType, itemId) {
    resetAttendeeState();
    attendeeContext = { itemType, itemId };
    loadFormAttendees(itemType, itemId);
  }

  // Add attendee to an existing item
  async function handleAddAttendee(itemType, itemId) {
    const email = attendeeEmailInput.trim();
    if (!email) return;
    attendeeAddError = '';
    attendeeAddLoading = true;
    try {
      await attendeeAPI.addAttendee(email, itemType, itemId);
      attendeeEmailInput = '';
      await loadFormAttendees(itemType, itemId);
      await loadTripsAndItems();
    } catch (err) {
      attendeeAddError = err.message || 'Failed to add attendee';
    } finally {
      attendeeAddLoading = false;
    }
  }

  // Remove attendee from an existing item
  async function handleRemoveAttendee(attendeeId, itemType, itemId) {
    try {
      await attendeeAPI.removeAttendee(attendeeId);
      await loadFormAttendees(itemType, itemId);
      await loadTripsAndItems();
    } catch (err) {
      attendeeAddError = err.message || 'Failed to remove attendee';
    }
  }

  // Queue an attendee to be added after item creation
  function handleQueueAttendee(firstName = '', lastName = '') {
    const email = attendeeEmailInput.trim();
    if (!email) return;
    if (pendingAttendees.some(a => a.email === email)) {
      attendeeAddError = 'Already in list';
      return;
    }
    attendeeAddError = '';
    pendingAttendees = [...pendingAttendees, { email, firstName, lastName }];
    attendeeEmailInput = '';
  }

  function handleRemovePendingAttendee(email) {
    pendingAttendees = pendingAttendees.filter(a => a.email !== email);
  }

  // Add all queued attendees to a newly created item; silently skips failures
  async function flushPendingAttendees(itemType, itemId) {
    for (const a of pendingAttendees) {
      try { await attendeeAPI.addAttendee(a.email, itemType, itemId); } catch { /* skip */ }
    }
    pendingAttendees = [];
  }

  let activeTimelineTab = 'upcoming'; // 'upcoming' | 'past'
  let addNewView = 'menu'; // 'menu' | 'tripForm' | 'itemForm'
  let selectedItem = null; // Currently selected item for editing
  let editForm = {}; // Form data for editing
  let selectedTrip = null; // Currently selected trip for editing
  let editTripForm = {}; // Form data for editing a trip
  let markers = []; // Map markers
  let polylines = []; // Map polylines for flights and transportation
  let L; // Leaflet library

  // Calendar filter state
  let visibleItemTypes = {
    trip: true,
    flight: true,
    hotel: true,
    transportation: true,
    car_rental: true,
    event: true
  };

  let showCalendarFilters = window.innerWidth > 640;
  let showMobileFilterSheet = false;

  // Reactive statement to update map markers when items or timeline tab changes
  $: if (map && L && (items || activeTimelineTab || activePane || trips || friendsTrips || attendeeStandaloneItems || companionStandaloneItems)) {
    updateMapMarkersFiltered();
  }


  // Track previous activePane to detect null→pane transitions
  let prevActivePane = activePane;

  // Reactive statement to handle map resize when pane state changes.
  // Only re-fit bounds when the pane opens from null (first appearance).
  // For column-count changes within an already-open pane, only invalidate size.
  $: {
    const wasNullPane = prevActivePane === null;
    prevActivePane = activePane;

    if (map && L && (activePane !== null || selectedItem !== null)) {
      setTimeout(() => {
        const isMobile = window.innerWidth <= 640;

        // { pan: false } stops invalidateSize from re-centering the map after
        // a container resize, so our subsequent fitBounds/panBy is not undone.
        map.invalidateSize({ pan: false });

        // Only re-fit bounds when pane is opening for the first time (from null).
        // All column-count changes (1→2, 1→4, etc.) preserve the current view.
        if (wasNullPane && markers.length > 0) {
          const group = L.featureGroup(markers);
          if (group.getBounds().isValid()) {
            const bounds = group.getBounds();
            if (isMobile) {
              map.fitBounds(bounds, { padding: [8, 8] });
            } else {
              const viewportWidth = window.innerWidth;
              const colUnit = (viewportWidth - 2.5 / 100 * window.innerHeight - 50 - 2.5 / 100 * window.innerHeight - 2.5 / 100 * window.innerHeight) / 4;
              const leftOccupiedWidth = 50 + colUnit + 2.5 / 100 * window.innerHeight * 3;
              map.fitBounds(bounds, {
                paddingTopLeft: [leftOccupiedWidth, 20],
                paddingBottomRight: [20, 20]
              });
            }
          }
        }
      }, 350);
    }
  }

  // Form state
  let tripForm = {
    name: '',
    departureDate: '',
    returnDate: '',
    purpose: 'leisure',
    status: 'confirmed'
  };

  let itemForm = {
    itemType: 'flight',
    tripId: '',
    status: 'confirmed',
    // Flight fields
    airline: '',
    flightNumber: '',
    departureDate: '',
    departureTime: '',
    arrivalDate: '',
    arrivalTime: '',
    origin: '',
    destination: '',
    pnr: '',
    seat: '',
    // Hotel fields
    hotelName: '',
    address: '',
    phone: '',
    checkInDate: '',
    checkInTime: '',
    checkOutDate: '',
    checkOutTime: '',
    confirmationNumber: '',
    roomNumber: '',
    // Transportation fields
    method: '',
    journeyNumber: '',
    // Event fields
    name: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    allDay: false,
    location: '',
    contactPhone: '',
    contactEmail: '',
    description: '',
    eventUrl: '',
    // Car Rental fields
    company: '',
    pickupLocation: '',
    pickupDate: '',
    pickupTime: '',
    dropoffLocation: '',
    dropoffDate: '',
    dropoffTime: ''
  };

  /**
   * Convert a UTC ISO datetime string to { date: 'YYYY-MM-DD', time: 'HH:MM' }
   * in the given IANA timezone (or UTC if none provided).
   * Mirrors the backend utcToLocal() logic so round-trips are lossless.
   */
  function utcDateTimeParts(isoString, timezone) {
    if (!isoString) return { date: '', time: '' };
    try {
      const dt = new Date(isoString);
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = {};
      fmt.formatToParts(dt).forEach(p => { if (p.type !== 'literal') parts[p.type] = p.value; });
      // hour12:false can return '24' at midnight — normalise to '00'
      const hour = parts.hour === '24' ? '00' : parts.hour;
      return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
    } catch {
      // Fallback: slice UTC directly
      const iso = new Date(isoString).toISOString();
      return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
    }
  }

  function timeInput(node) {
    function handleInput(e) {
      // Only process if the change is an insertion (not deletion/selection)
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

      input.value = val;
      // Dispatch an input event so bind:value picks up the new value
      input.dispatchEvent(new Event('input', { bubbles: true }));
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

  function onItemFlightNumberInput(e) {
    itemForm.flightNumber = e.target.value;
    const looked = lookupAirline(itemForm.flightNumber);
    itemForm.airline = looked;
    itemForm = itemForm; // trigger reactivity
  }

  function onEditFlightNumberInput(e) {
    editForm.flightNumber = e.target.value;
    const looked = lookupAirline(editForm.flightNumber);
    editForm.airline = looked;
    editForm = editForm; // trigger reactivity
  }

  function togglePane(pane) {
    activePane = activePane === pane ? null : pane;
    if (pane === 'addNew' && activePane === 'addNew') {
      addNewView = 'menu'; // Reset to menu when opening
    }
    if (activePane !== 'settings') {
      activeSettingsSection = null; // Reset when leaving settings
    }
  }

  function showTripForm() {
    addNewView = 'tripForm';
  }

  function showItemForm() {
    addNewView = 'itemForm';
  }

  function backToMenu() {
    addNewView = 'menu';
    resetAttendeeState();
    // Reset forms
    tripForm = { name: '', departureDate: '', returnDate: '', purpose: 'leisure', status: 'confirmed' };
    itemForm = {
      itemType: 'flight',
      tripId: '',
      status: 'confirmed',
      airline: '', flightNumber: '', departureDate: '', departureTime: '', arrivalDate: '', arrivalTime: '',
      origin: '', destination: '', pnr: '', seat: '',
      hotelName: '', address: '', phone: '', checkInDate: '', checkInTime: '14:00', checkOutDate: '', checkOutTime: '11:00',
      confirmationNumber: '', roomNumber: '',
      method: '', journeyNumber: '',
      name: '', startDate: '', startTime: '', endDate: '', endTime: '', allDay: false, location: '',
      contactPhone: '', contactEmail: '', description: '', eventUrl: '',
      company: '', pickupLocation: '', pickupDate: '', pickupTime: '', dropoffLocation: '', dropoffDate: '', dropoffTime: ''
    };
  }

  async function handleCreateTrip(e) {
    e.preventDefault();
    try {
      const tripPayload = { ...tripForm, isConfirmed: tripForm.status !== 'tentative' };
      delete tripPayload.status;
      const newTrip = await tripAPI.createTrip(tripPayload);
      await flushPendingAttendees('trip', newTrip.id);
      await loadTripsAndItems(); // Reload to get fresh data
      backToMenu();
      activePane = 'timeline'; // Switch to timeline to show the new trip
    } catch (err) {
      alert('Failed to create trip: ' + (err.message || 'Unknown error'));
    }
  }

  async function handleCreateItem(e) {
    e.preventDefault();
    try {
      // Build the payload based on item type
      const payload = {
        itemType: itemForm.itemType,
        tripId: itemForm.tripId || undefined // Convert empty string to undefined
      };

      // Add type-specific fields
      if (itemForm.itemType === 'flight') {
        payload.airline = itemForm.airline || undefined;
        payload.flightNumber = itemForm.flightNumber;
        payload.departureDate = itemForm.departureDate;
        payload.departureTime = itemForm.departureTime;
        payload.arrivalDate = itemForm.arrivalDate;
        payload.arrivalTime = itemForm.arrivalTime;
        payload.origin = itemForm.origin;
        payload.destination = itemForm.destination;
        payload.pnr = itemForm.pnr || undefined;
        payload.seat = itemForm.seat || undefined;
      } else if (itemForm.itemType === 'hotel') {
        payload.hotelName = itemForm.hotelName;
        payload.address = itemForm.address;
        payload.phone = itemForm.phone || undefined;
        payload.checkInDate = itemForm.checkInDate;
        payload.checkInTime = itemForm.checkInTime;
        payload.checkOutDate = itemForm.checkOutDate;
        payload.checkOutTime = itemForm.checkOutTime;
        payload.confirmationNumber = itemForm.confirmationNumber || undefined;
        payload.roomNumber = itemForm.roomNumber || undefined;
      } else if (itemForm.itemType === 'transportation') {
        payload.method = itemForm.method;
        payload.journeyNumber = itemForm.journeyNumber || undefined;
        payload.origin = itemForm.origin;
        payload.destination = itemForm.destination;
        payload.departureDate = itemForm.departureDate;
        payload.departureTime = itemForm.departureTime;
        payload.arrivalDate = itemForm.arrivalDate;
        payload.arrivalTime = itemForm.arrivalTime;
        payload.confirmationNumber = itemForm.confirmationNumber || undefined;
        payload.seat = itemForm.seat || undefined;
      } else if (itemForm.itemType === 'event') {
        payload.name = itemForm.name;
        payload.location = itemForm.location;
        payload.startDate = itemForm.startDate;
        payload.startTime = itemForm.startTime;
        payload.endDate = itemForm.endDate || undefined;
        payload.endTime = itemForm.endTime || undefined;
        payload.description = itemForm.description || undefined;
        payload.contactPhone = itemForm.contactPhone || undefined;
        payload.contactEmail = itemForm.contactEmail || undefined;
        payload.eventUrl = itemForm.eventUrl || undefined;
      } else if (itemForm.itemType === 'car_rental') {
        payload.company = itemForm.company;
        payload.pickupLocation = itemForm.pickupLocation;
        payload.pickupDate = itemForm.pickupDate;
        payload.pickupTime = itemForm.pickupTime;
        payload.dropoffLocation = itemForm.dropoffLocation;
        payload.dropoffDate = itemForm.dropoffDate;
        payload.dropoffTime = itemForm.dropoffTime;
        payload.confirmationNumber = itemForm.confirmationNumber || undefined;
      }

      payload.isConfirmed = itemForm.status !== 'tentative';
      const newItem = await itemAPI.createItem(payload);
      await flushPendingAttendees(payload.itemType, newItem.id);
      await loadTripsAndItems(); // Reload to get fresh data
      backToMenu();
    } catch (err) {
      alert('Failed to create item: ' + (err.message || 'Unknown error'));
    }
  }

  function flattenStandaloneObj(obj) {
    return [
      ...(obj.flights || []).map(item => ({ ...item, itemType: 'flight' })),
      ...(obj.hotels || []).map(item => ({ ...item, itemType: 'hotel' })),
      ...(obj.transportation || []).map(item => ({ ...item, itemType: 'transportation' })),
      ...(obj.events || []).map(item => ({ ...item, itemType: 'event' })),
      ...(obj.carRentals || []).map(item => ({ ...item, itemType: 'car_rental' })),
    ];
  }

  async function loadTripsAndItems() {
    try {
      const response = await tripAPI.getAllTrips();

      trips = response.trips || [];
      friendsTrips = response.friendsTrips || [];
      standaloneItems = flattenStandaloneObj(response.standalone || {});
      attendeeStandaloneItems = flattenStandaloneObj(response.attendeeStandalone || {});
      companionStandaloneItems = flattenStandaloneObj(response.companionStandalone || {});
    } catch (err) {
      trips = [];
      friendsTrips = [];
      standaloneItems = [];
      attendeeStandaloneItems = [];
      companionStandaloneItems = [];
    }

    try {
      const itemsResponse = await itemAPI.getAllItems();
      items = Array.isArray(itemsResponse) ? itemsResponse : [];
    } catch (err) {
      items = [];
    }

    timelineVersion++;

    // Update map markers after loading items
    if (map && L) {
      updateMapMarkersFiltered();
    }
  }

  function generateCurvedPath(start, end, numPoints = 100) {
    // Generate a great circle arc between two points
    const [lat1, lng1] = start;
    const [lat2, lng2] = end;

    // Convert to radians
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;

    const lat1Rad = toRad(lat1);
    const lng1Rad = toRad(lng1);
    const lat2Rad = toRad(lat2);
    const lng2Rad = toRad(lng2);

    // Calculate the great circle distance using Haversine
    const dLat = lat2Rad - lat1Rad;
    const dLng = lng2Rad - lng1Rad;

    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Handle case where points are very close or the same
    if (c < 0.0001) {
      return [start, end];
    }

    // Generate intermediate points along the great circle
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const f = i / numPoints;

      // Interpolation using spherical geometry (SLERP)
      const A = Math.sin((1 - f) * c) / Math.sin(c);
      const B = Math.sin(f * c) / Math.sin(c);

      const x = A * Math.cos(lat1Rad) * Math.cos(lng1Rad) + B * Math.cos(lat2Rad) * Math.cos(lng2Rad);
      const y = A * Math.cos(lat1Rad) * Math.sin(lng1Rad) + B * Math.cos(lat2Rad) * Math.sin(lng2Rad);
      const z = A * Math.sin(lat1Rad) + B * Math.sin(lat2Rad);

      const latRad = Math.atan2(z, Math.sqrt(x ** 2 + y ** 2));
      const lngRad = Math.atan2(y, x);

      points.push([toDeg(latRad), toDeg(lngRad)]);
    }

    return points;
  }

  function splitPathAtDateline(points) {
    // Split a path that crosses the International Date Line into multiple segments
    const segments = [];
    let currentSegment = [points[0]];

    for (let i = 1; i < points.length; i++) {
      const prevLng = points[i - 1][1];
      const currLng = points[i][1];
      const lngDiff = currLng - prevLng;

      // If we jump more than 180 degrees, we've crossed the dateline
      if (Math.abs(lngDiff) > 180) {
        // Close current segment
        segments.push(currentSegment);
        // Start new segment
        currentSegment = [points[i]];
      } else {
        currentSegment.push(points[i]);
      }
    }

    // Add the last segment
    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    return segments;
  }

  function getItemLocations(item) {
    const locations = [];

    switch(item.itemType) {
      case 'flight':
        // Add origin and destination
        if (item.originLat && item.originLng) {
          locations.push({
            lat: parseFloat(item.originLat),
            lng: parseFloat(item.originLng),
            label: item.origin,
            type: 'origin',
            item: item
          });
        }
        if (item.destinationLat && item.destinationLng) {
          locations.push({
            lat: parseFloat(item.destinationLat),
            lng: parseFloat(item.destinationLng),
            label: item.destination,
            type: 'destination',
            item: item
          });
        }
        break;
      case 'hotel':
        if (item.lat && item.lng) {
          locations.push({
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lng),
            label: item.hotelName,
            type: 'hotel',
            item: item
          });
        }
        break;
      case 'transportation':
        // Add origin and destination
        if (item.originLat && item.originLng) {
          locations.push({
            lat: parseFloat(item.originLat),
            lng: parseFloat(item.originLng),
            label: item.origin,
            type: 'origin',
            item: item
          });
        }
        if (item.destinationLat && item.destinationLng) {
          locations.push({
            lat: parseFloat(item.destinationLat),
            lng: parseFloat(item.destinationLng),
            label: item.destination,
            type: 'destination',
            item: item
          });
        }
        break;
      case 'event':
        if (item.lat && item.lng) {
          locations.push({
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lng),
            label: item.name,
            type: 'event',
            item: item
          });
        }
        break;
      case 'car_rental':
        // Add pickup and dropoff locations
        if (item.pickupLat && item.pickupLng) {
          locations.push({
            lat: parseFloat(item.pickupLat),
            lng: parseFloat(item.pickupLng),
            label: item.pickupLocation,
            type: 'pickup',
            item: item
          });
        }
        if (item.dropoffLat && item.dropoffLng) {
          locations.push({
            lat: parseFloat(item.dropoffLat),
            lng: parseFloat(item.dropoffLng),
            label: item.dropoffLocation,
            type: 'dropoff',
            item: item
          });
        }
        break;
    }

    return locations;
  }

  function updateMapMarkersFiltered() {
    if (!map || !L) return;

    // Clear existing markers and polylines
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    polylines.forEach(polyline => map.removeLayer(polyline));
    polylines = [];

    // Build the item list from the same source as whichever timeline pane is
    // currently visible, so the map always reflects exactly what the user sees.
    const timelineEntries = activePane === 'shared'
      ? getFriendsTimelineEntries()
      : getAllItemsChronological();
    const seenMapIds = new Set();
    const filteredItems = [];
    for (const entry of timelineEntries) {
      if (entry.type === 'trip') {
        for (const dateGroup of (entry.itemsByDate || [])) {
          for (const item of (dateGroup.items || [])) {
            if (!seenMapIds.has(item.id)) {
              seenMapIds.add(item.id);
              filteredItems.push(item);
            }
          }
        }
      } else if (entry.type === 'item') {
        if (!seenMapIds.has(entry.item.id)) {
          seenMapIds.add(entry.item.id);
          filteredItems.push(entry.item);
        }
      }
    }

    // Collect all locations from filtered items
    const allLocations = [];
    filteredItems.forEach(item => {
      const locations = getItemLocations(item);
      allLocations.push(...locations);
    });

    // Create markers for each location with glowing effect (inverted colors)
    allLocations.forEach(location => {
      // Determine colors based on item type
      let edgeColor, glowColor;
      switch(location.item.itemType) {
        case 'flight':
          edgeColor = '#818CF8'; // Light blue
          glowColor = '#6366F1'; // Medium blue
          break;
        case 'hotel':
          edgeColor = '#F87171'; // Light red
          glowColor = '#EF4444'; // Medium red
          break;
        case 'transportation':
          edgeColor = '#34D399'; // Light green
          glowColor = '#10B981'; // Medium green
          break;
        case 'event':
          edgeColor = '#FBBF24'; // Light amber
          glowColor = '#F59E0B'; // Medium amber
          break;
        case 'car_rental':
          edgeColor = '#A78BFA'; // Light violet
          glowColor = '#8B5CF6'; // Medium violet
          break;
        default:
          edgeColor = '#9CA3AF'; // Light gray
          glowColor = '#6B7280'; // Medium gray
      }

      // Layer 1: White edge (outer)
      const edgeMarker = L.circleMarker([location.lat, location.lng], {
        radius: 5,
        fillColor: '#FFFFFF',
        color: '#FFFFFF',
        weight: 0,
        opacity: 0.9,
        fillOpacity: 0.9,
        pane: 'markerPane'
      }).addTo(map);

      // Layer 2: Colored center (inner)
      const centerMarker = L.circleMarker([location.lat, location.lng], {
        radius: 2.5,
        fillColor: edgeColor,
        color: edgeColor,
        weight: 0,
        opacity: 1,
        fillOpacity: 1,
        pane: 'markerPane'
      })
        .bindTooltip(`
          <strong>${getItemLabel(location.item)}</strong><br/>
          ${location.label}<br/>
          <small>${location.item.itemType}</small>
        `, {
          direction: 'top',
          offset: [0, -5]
        })
        .addTo(map);

      markers.push(edgeMarker);
      markers.push(centerMarker);
    });

    // Add polylines for flights and transportation
    filteredItems.forEach(item => {
      if (item.itemType === 'flight' || item.itemType === 'transportation') {
        let originLat, originLng, destLat, destLng;

        if (item.itemType === 'flight') {
          originLat = item.originLat;
          originLng = item.originLng;
          destLat = item.destinationLat;
          destLng = item.destinationLng;
        } else if (item.itemType === 'transportation') {
          originLat = item.originLat;
          originLng = item.originLng;
          destLat = item.destinationLat;
          destLng = item.destinationLng;
        }

        // Only create polyline if both origin and destination have coordinates
        if (originLat && originLng && destLat && destLng) {
          const start = [parseFloat(originLat), parseFloat(originLng)];
          const end = [parseFloat(destLat), parseFloat(destLng)];

          // Generate curved path points
          const curvedPoints = generateCurvedPath(start, end);

          // Split the path if it crosses the dateline
          const pathSegments = splitPathAtDateline(curvedPoints);

          const edgeColor = item.itemType === 'flight' ? '#818CF8' : '#34D399'; // Lighter shades
          const glowColor = item.itemType === 'flight' ? '#6366F1' : '#10B981'; // Medium shade for glow

          // Create a polyline for each segment with glowing effect
          pathSegments.forEach(segment => {
            if (segment.length > 1) {
              // First layer: outer glow (widest, most transparent)
              const glowPolyline = L.polyline(segment, {
                color: glowColor,
                weight: 4,
                opacity: 0.3,
                smoothFactor: 1,
                className: 'smooth-path path-glow'
              }).addTo(map);

              // Second layer: colored edge (medium)
              const outerPolyline = L.polyline(segment, {
                color: edgeColor,
                weight: 2,
                opacity: 0.6,
                smoothFactor: 1,
                className: 'smooth-path'
              }).addTo(map);

              // Third layer: white center (thinnest, brightest)
              const innerPolyline = L.polyline(segment, {
                color: '#FFFFFF',
                weight: 0.5,
                opacity: 1,
                smoothFactor: 1,
                className: 'smooth-path'
              })
                .bindTooltip(`
                  <strong>${getItemLabel(item)}</strong><br/>
                  ${item.origin || 'Origin'} → ${item.destination || 'Destination'}<br/>
                  <small>${item.itemType}</small>
                `, {
                  direction: 'top',
                  offset: [0, -5]
                })
                .addTo(map);

              polylines.push(glowPolyline);
              polylines.push(outerPolyline);
              polylines.push(innerPolyline);
            }
          });
        }
      }
    });

    // Fit map to show all markers if there are any
    if (markers.length > 0) {
      // Only use markers for bounds calculation, not polylines (which can span huge distances)
      const group = L.featureGroup(markers);
      const bounds = group.getBounds();

      if (window.innerWidth <= 640) {
        map.fitBounds(bounds, { padding: [8, 8] });
      } else {
        // Calculate the padding needed to center the map in the visible area (right of content pane)
        // Content pane width is approximately 25vw (min 300px, max 400px) + side nav (50px) + gaps (2.5vh * 3)
        const viewportWidth = window.innerWidth;
        const contentPaneWidth = Math.min(Math.max(viewportWidth * 0.25, 300), 400);
        const sideNavWidth = 50;
        const gaps = 2.5 * 3;
        const leftOccupiedWidth = sideNavWidth + contentPaneWidth + gaps;

        map.fitBounds(bounds, {
          paddingTopLeft: [leftOccupiedWidth, 20],
          paddingBottomRight: [20, 20]
        });
      }
    }
  }

  onMount(async () => {
    const userData = await authAPI.verifySession();
    if (!userData) {
      navigate('/login', { replace: true });
      return;
    }
    user.set(userData);
    isAuthenticated.set(true);

    await loadTripsAndItems();

    L = (await import('leaflet')).default;

    map = L.map(mapContainer, {
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true,
      maxBounds: [[-90, -Infinity], [90, Infinity]],
      maxBoundsViscosity: 0.0
    }).setView([20, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      noWrap: false
    }).addTo(map);

    // Initial map markers update
    updateMapMarkersFiltered();
  });

  onDestroy(() => {
    if (map) {
      map.remove();
      map = null;
    }
  });

  async function handleLogout() {
    try {
      await authAPI.logout();
      user.set(null);
      isAuthenticated.set(false);
      navigate('/', { replace: true });
    } catch (err) {
      navigate('/', { replace: true });
    }
  }

  function parseDateOnly(dateStr) {
    // Parse YYYY-MM-DD as local time (not UTC) to avoid timezone off-by-one
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = parseDateOnly(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateGroupHeader(date) {
    if (!date) return '';
    const d = new Date(date);
    const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
    const day = d.toLocaleDateString('en-US', { day: '2-digit' });
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    return `${weekday}, ${day} ${month}`;
  }

  function getTripNights(departureDate, returnDate) {
    if (!departureDate || !returnDate) return null;
    const diff = parseDateOnly(returnDate) - parseDateOnly(departureDate);
    const nights = Math.round(diff / (1000 * 60 * 60 * 24));
    return nights > 0 ? nights : null;
  }

  function getMonthYear(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'long' });
  }

  function safeTimezone(timezone) {
    if (!timezone) return 'UTC';
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return timezone;
    } catch {
      return 'UTC';
    }
  }

  function formatDateTime(dateStr, timezone) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString('en-GB', {
      timeZone: safeTimezone(timezone),
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  function formatTime24(dateStr, timezone) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleString('en-GB', { timeZone: safeTimezone(timezone), hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function getFlightDuration(item) {
    if (!item.departureDateTime || !item.arrivalDateTime) return null;
    const diffMs = new Date(item.arrivalDateTime) - new Date(item.departureDateTime);
    if (diffMs <= 0) return null;
    const totalMins = Math.round(diffMs / 60000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h === 0) return `${m}m`;
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }

  function getItemsForTrip(tripId) {
    return items.filter(item => item.tripId === tripId);
  }

  function getItemIcon(itemType) {
    switch (itemType) {
      case 'flight':
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg>`;
      case 'hotel':
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3m12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9a4 4 0 0 0-4-4"/></svg>`;
      case 'transportation':
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M4 16c0 .88.39 1.67 1 2.22V20a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h8v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4zm3.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m9 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3M6 10V6h12v4z"/></svg>`;
      case 'event':
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M17 12h-5v5h5zM16 1v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-1V1zm3 18H5V8h14z"/></svg>`;
      case 'car_rental':
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h12v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-8zM6.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3m11 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3M5 11l1.5-4.5h11L19 11z"/></svg>`;
      default:
        return '';
    }
  }

  function getItemLabel(item) {
    switch(item.itemType) {
      case 'flight':
        const originCode = extractAirportCode(item.origin);
        const destinationCode = extractAirportCode(item.destination);
        const depTime = item.departureDateTime ? `${formatTime24(item.departureDateTime, item.originTimezone)} · ` : '';
        return `${depTime}${originCode} → ${destinationCode}`;
      case 'hotel':
        return item.hotelName || 'Hotel';
      case 'transportation':
        return `${item.method || 'Transport'}: ${item.origin || 'Unknown'} → ${item.destination || 'Unknown'}`;
      case 'event':
        return item.name || 'Event';
      case 'car_rental':
        return `${item.company || 'Car'} Rental`;
      default:
        return 'Item';
    }
  }

  function getAttendeeInitials(user) {
    if (!user) return '?';
    const first = (user.firstName || '').trim();
    const last = (user.lastName || '').trim();
    if (first && last) return (first[0] + last[0]).toUpperCase();
    if (first) return first[0].toUpperCase();
    if (user.email) return user.email[0].toUpperCase();
    return '?';
  }

  function sortAttendees(attendees, createdBy) {
    return [...attendees].sort((a, b) => {
      const aIsCreator = a.userId === createdBy;
      const bIsCreator = b.userId === createdBy;
      if (aIsCreator && !bIsCreator) return -1;
      if (!aIsCreator && bIsCreator) return 1;
      const aFirst = (a.user?.firstName || '').toLowerCase();
      const bFirst = (b.user?.firstName || '').toLowerCase();
      if (aFirst !== bFirst) return aFirst < bFirst ? -1 : 1;
      const aLast = (a.user?.lastName || '').toLowerCase();
      const bLast = (b.user?.lastName || '').toLowerCase();
      return aLast < bLast ? -1 : aLast > bLast ? 1 : 0;
    });
  }

  function extractAirportCode(locationString) {
    if (!locationString) return 'Unknown';

    // If it's already just a 3-letter code, return it
    if (/^[A-Z]{3}$/.test(locationString.trim())) {
      return locationString.trim();
    }

    // Try to extract 3-letter airport code from a string like "AUS - Austin, TX, USA"
    const match = locationString.match(/^([A-Z]{3})\s*[-–—]/);
    if (match) {
      return match[1];
    }

    // If we can't find a code, return the first 3 uppercase letters or the whole string
    const upperMatch = locationString.match(/[A-Z]{3}/);
    if (upperMatch) {
      return upperMatch[0];
    }

    return locationString.substring(0, 3).toUpperCase();
  }

  function getItemDateTime(item) {
    switch(item.itemType) {
      case 'flight':
        return formatDateTime(item.departureDateTime, item.originTimezone);
      case 'hotel':
        return formatDateTime(item.checkInDateTime, item.timezone);
      case 'transportation':
        return formatDateTime(item.departureDateTime, item.originTimezone);
      case 'event':
        return formatDateTime(item.startDateTime, item.timezone);
      case 'car_rental':
        return formatDateTime(item.pickupDateTime, item.timezone);
      default:
        return '';
    }
  }

  function getItemSortDateTime(item) {
    switch(item.itemType) {
      case 'flight':
        return item.departureDateTime;
      case 'hotel':
        return item.checkInDateTime;
      case 'transportation':
        return item.departureDateTime;
      case 'event':
        return item.startDateTime;
      case 'car_rental':
        return item.pickupDateTime;
      default:
        return null;
    }
  }

  function getAllItemsChronological() {
    // Create timeline entries for trips and standalone items
    const timelineEntries = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Add trips as timeline entries
    for (const trip of trips) {
      const tripEndDate = trip.returnDate ? parseDateOnly(trip.returnDate) : parseDateOnly(trip.departureDate);
      tripEndDate.setHours(0, 0, 0, 0);

      const isPast = tripEndDate < now;

      // Filter trips based on active tab
      if (activeTimelineTab === 'upcoming') {
        if (tripEndDate < now) {
          continue; // Skip past trips
        }
      } else if (activeTimelineTab === 'past') {
        if (tripEndDate >= now) {
          continue; // Skip upcoming/in-progress trips
        }
      }

      const ownItems = getItemsForTrip(trip.id);
      const nestedItems = [
        ...(trip.flights || []).map(i => ({ ...i, itemType: 'flight' })),
        ...(trip.hotels || []).map(i => ({ ...i, itemType: 'hotel' })),
        ...(trip.transportation || []).map(i => ({ ...i, itemType: 'transportation' })),
        ...(trip.carRentals || []).map(i => ({ ...i, itemType: 'car_rental' })),
        ...(trip.events || []).map(i => ({ ...i, itemType: 'event' })),
      ];
      // Merge: use nested items from the trip object (covers attendee/companion trips),
      // falling back to own flat items for trips where nesting may be absent.
      const seenIds = new Set(nestedItems.map(i => i.id));
      const tripItems = [...nestedItems, ...ownItems.filter(i => !seenIds.has(i.id))];
      // Sort items within the trip
      tripItems.sort((a, b) => {
        const dateA = getItemSortDateTime(a);
        const dateB = getItemSortDateTime(b);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateA) - new Date(dateB);
      });

      // Group items by date
      const itemsByDate = groupItemsByDate(tripItems);

      timelineEntries.push({
        type: 'trip',
        trip: trip,
        itemsByDate: itemsByDate,
        sortDate: parseDateOnly(trip.departureDate)
      });
    }

    // Add standalone items: own items + items I was added to as an attendee
    const myStandaloneItems = [...standaloneItems, ...attendeeStandaloneItems];
    const seenStandaloneIds = new Set();
    for (const item of myStandaloneItems) {
      if (seenStandaloneIds.has(item.id)) continue;
      seenStandaloneIds.add(item.id);

      const itemDate = getItemSortDateTime(item) ? new Date(getItemSortDateTime(item)) : null;
      if (itemDate) {
        itemDate.setHours(0, 0, 0, 0);

        // Filter standalone items based on active tab
        if (activeTimelineTab === 'upcoming') {
          if (itemDate < now) continue; // Skip past items
        } else if (activeTimelineTab === 'past') {
          if (itemDate >= now) continue; // Skip upcoming items
        }
      }

      timelineEntries.push({
        type: 'item',
        item: item,
        sortDate: itemDate || new Date(0)
      });
    }

    // Sort all timeline entries chronologically
    if (activeTimelineTab === 'upcoming') {
      timelineEntries.sort((a, b) => a.sortDate - b.sortDate); // Oldest first
    } else {
      timelineEntries.sort((a, b) => b.sortDate - a.sortDate); // Newest first
    }

    return timelineEntries;
  }

  function groupItemsByDate(items) {
    const grouped = {};

    for (const item of items) {
      const dateTime = getItemSortDateTime(item);
      if (!dateTime) continue;

      const date = new Date(dateTime);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format

      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          date: date,
          items: []
        };
      }

      grouped[dateKey].items.push(item);
    }

    // Convert to array and sort by date
    return Object.values(grouped).sort((a, b) => a.date - b.date);
  }

  function getFriendsTimelineEntries() {
    // Returns upcoming and in-progress trips/items from companions, sorted chronologically
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const entries = [];

    // Add all trips not owned by me: companion-shared + attendee trips
    const allFriendTrips = [
      ...friendsTrips,
      ...trips.filter(t => t.isShared),
    ];
    const seenTripIds = new Set();
    for (const trip of allFriendTrips) {
      if (seenTripIds.has(trip.id)) continue;
      seenTripIds.add(trip.id);
      const tripEndDate = trip.returnDate ? parseDateOnly(trip.returnDate) : parseDateOnly(trip.departureDate);
      tripEndDate.setHours(0, 0, 0, 0);
      if (tripEndDate < now) continue; // skip past trips

      const tripItems = [
        ...(trip.flights || []).map(i => ({ ...i, itemType: 'flight' })),
        ...(trip.hotels || []).map(i => ({ ...i, itemType: 'hotel' })),
        ...(trip.transportation || []).map(i => ({ ...i, itemType: 'transportation' })),
        ...(trip.carRentals || []).map(i => ({ ...i, itemType: 'car_rental' })),
        ...(trip.events || []).map(i => ({ ...i, itemType: 'event' })),
      ];
      tripItems.sort((a, b) => {
        const dateA = getItemSortDateTime(a);
        const dateB = getItemSortDateTime(b);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return new Date(dateA) - new Date(dateB);
      });
      entries.push({
        type: 'trip',
        trip,
        itemsByDate: groupItemsByDate(tripItems),
        sortDate: parseDateOnly(trip.departureDate),
      });
    }

    // Add companion standalone items (upcoming and in-progress only)
    for (const item of companionStandaloneItems) {
      const sortDt = getItemSortDateTime(item);
      const itemDate = sortDt ? new Date(sortDt) : null;
      if (itemDate) {
        const itemDay = new Date(itemDate);
        itemDay.setHours(0, 0, 0, 0);
        if (itemDay < now) continue; // skip past items
      }
      entries.push({
        type: 'item',
        item,
        sortDate: itemDate || new Date(0),
      });
    }

    // Sort ascending (soonest first)
    entries.sort((a, b) => a.sortDate - b.sortDate);
    return entries;
  }

  function getOwnerName(obj) {
    const u = obj.user;
    if (u) {
      const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
      return name || u.email || 'A friend';
    }
    return 'A friend';
  }

  // Date sync helpers: keep start/end date pairs consistent
  function onItemStartDateChange(startField, endField) {
    const start = itemForm[startField];
    if (!itemForm[endField] || start > itemForm[endField]) {
      itemForm[endField] = start;
    }
  }

  function onItemEndDateChange(startField, endField) {
    const end = itemForm[endField];
    if (end && end < itemForm[startField]) {
      itemForm[startField] = end;
    }
  }

  function onEditStartDateChange(startField, endField) {
    const start = editForm[startField];
    if (!editForm[endField] || start > editForm[endField]) {
      editForm[endField] = start;
    }
  }

  function onEditEndDateChange(startField, endField) {
    const end = editForm[endField];
    if (end && end < editForm[startField]) {
      editForm[startField] = end;
    }
  }

  function onTripStartDateChange() {
    const start = tripForm.departureDate;
    if (!tripForm.returnDate || start > tripForm.returnDate) {
      tripForm.returnDate = start;
    }
  }

  function onTripEndDateChange() {
    const end = tripForm.returnDate;
    if (end && end < tripForm.departureDate) {
      tripForm.departureDate = end;
    }
  }

  function handleItemClick(item) {
    selectedItem = item;
    selectedTrip = null;
    // Populate edit form with item data, parsing datetime fields
    editForm = { ...item };
    if (editForm.tripId == null) editForm.tripId = '';
    editForm.status = item.isConfirmed === false ? 'tentative' : 'confirmed';

    // Parse datetime fields into separate date and time for form inputs.
    // Use utcDateTimeParts() with the stored timezone so the round-trip is
    // lossless regardless of the browser's local timezone.
    if (item.itemType === 'flight') {
      if (item.departureDateTime) {
        const p = utcDateTimeParts(item.departureDateTime, item.originTimezone);
        editForm.departureDate = p.date;
        editForm.departureTime = p.time;
      }
      if (item.arrivalDateTime) {
        const p = utcDateTimeParts(item.arrivalDateTime, item.destinationTimezone);
        editForm.arrivalDate = p.date;
        editForm.arrivalTime = p.time;
      }
    } else if (item.itemType === 'hotel') {
      if (item.checkInDateTime) {
        const p = utcDateTimeParts(item.checkInDateTime, item.timezone);
        editForm.checkInDate = p.date;
        editForm.checkInTime = p.time;
      }
      if (item.checkOutDateTime) {
        const p = utcDateTimeParts(item.checkOutDateTime, item.timezone);
        editForm.checkOutDate = p.date;
        editForm.checkOutTime = p.time;
      }
    } else if (item.itemType === 'transportation') {
      if (item.departureDateTime) {
        const p = utcDateTimeParts(item.departureDateTime, item.originTimezone);
        editForm.departureDate = p.date;
        editForm.departureTime = p.time;
      }
      if (item.arrivalDateTime) {
        const p = utcDateTimeParts(item.arrivalDateTime, item.destinationTimezone);
        editForm.arrivalDate = p.date;
        editForm.arrivalTime = p.time;
      }
    } else if (item.itemType === 'event') {
      if (item.startDateTime) {
        const p = utcDateTimeParts(item.startDateTime, item.timezone);
        editForm.startDate = p.date;
        editForm.startTime = p.time;
      }
      if (item.endDateTime) {
        const p = utcDateTimeParts(item.endDateTime, item.timezone);
        editForm.endDate = p.date;
        editForm.endTime = p.time;
      }
      editForm.allDay = editForm.startTime === '00:00' && editForm.endTime === '24:00';
    } else if (item.itemType === 'car_rental') {
      if (item.pickupDateTime) {
        const p = utcDateTimeParts(item.pickupDateTime, item.originTimezone);
        editForm.pickupDate = p.date;
        editForm.pickupTime = p.time;
      }
      if (item.dropoffDateTime) {
        const p = utcDateTimeParts(item.dropoffDateTime, item.destinationTimezone);
        editForm.dropoffDate = p.date;
        editForm.dropoffTime = p.time;
      }
    }
    openAttendeeContext(item.itemType, item.id);
  }

  function closeEditForm() {
    selectedItem = null;
    editForm = {};
    resetAttendeeState();
  }

  function handleTripClick(trip) {
    selectedTrip = trip;
    selectedItem = null;
    editTripForm = {
      name: trip.name || '',
      departureDate: trip.departureDate || '',
      returnDate: trip.returnDate || '',
      purpose: trip.purpose || 'leisure',
      status: trip.isConfirmed === false ? 'tentative' : 'confirmed'
    };
    openAttendeeContext('trip', trip.id);
  }

  function closeTripEditForm() {
    selectedTrip = null;
    editTripForm = {};
    resetAttendeeState();
  }

  async function handleUpdateTrip(e) {
    e.preventDefault();
    try {
      const tripPayload = { ...editTripForm, isConfirmed: editTripForm.status !== 'tentative' };
      delete tripPayload.status;
      await tripAPI.updateTrip(selectedTrip.id, tripPayload);
      await loadTripsAndItems();
      closeTripEditForm();
    } catch (err) {
      alert('Failed to update trip: ' + (err.message || 'Unknown error'));
    }
  }

  async function handleDeleteItem(itemId, itemType) {
    if (!confirm(`Delete this ${itemType.replace('_', ' ')}?`)) return;
    try {
      await itemAPI.deleteItem(itemId);
      await loadTripsAndItems();
      closeEditForm();
    } catch (err) {
      alert('Failed to delete item: ' + (err.message || 'Unknown error'));
    }
  }

  async function handleDeleteTrip(tripId) {
    if (!confirm('Delete this trip and all its items?')) return;
    try {
      await tripAPI.deleteTrip(tripId);
      await loadTripsAndItems();
      closeTripEditForm();
    } catch (err) {
      alert('Failed to delete trip: ' + (err.message || 'Unknown error'));
    }
  }

  async function handleUpdateItem(e) {
    e.preventDefault();
    try {
      const payload = {
        itemType: editForm.itemType,
        tripId: editForm.tripId || undefined
      };

      // Add type-specific fields (same logic as create)
      if (editForm.itemType === 'flight') {
        payload.airline = editForm.airline || undefined;
        payload.flightNumber = editForm.flightNumber;
        payload.departureDate = editForm.departureDate;
        payload.departureTime = editForm.departureTime;
        payload.arrivalDate = editForm.arrivalDate;
        payload.arrivalTime = editForm.arrivalTime;
        payload.origin = editForm.origin;
        payload.destination = editForm.destination;
        payload.pnr = editForm.pnr || undefined;
        payload.seat = editForm.seat || undefined;
      } else if (editForm.itemType === 'hotel') {
        payload.hotelName = editForm.hotelName;
        payload.address = editForm.address;
        payload.phone = editForm.phone || undefined;
        payload.checkInDate = editForm.checkInDate;
        payload.checkInTime = editForm.checkInTime;
        payload.checkOutDate = editForm.checkOutDate;
        payload.checkOutTime = editForm.checkOutTime;
        payload.confirmationNumber = editForm.confirmationNumber || undefined;
        payload.roomNumber = editForm.roomNumber || undefined;
      } else if (editForm.itemType === 'transportation') {
        payload.method = editForm.method;
        payload.journeyNumber = editForm.journeyNumber || undefined;
        payload.origin = editForm.origin;
        payload.destination = editForm.destination;
        payload.departureDate = editForm.departureDate;
        payload.departureTime = editForm.departureTime;
        payload.arrivalDate = editForm.arrivalDate;
        payload.arrivalTime = editForm.arrivalTime;
        payload.confirmationNumber = editForm.confirmationNumber || undefined;
        payload.seat = editForm.seat || undefined;
      } else if (editForm.itemType === 'event') {
        payload.name = editForm.name;
        payload.location = editForm.location;
        payload.startDate = editForm.startDate;
        payload.startTime = editForm.startTime;
        payload.endDate = editForm.endDate || undefined;
        payload.endTime = editForm.endTime || undefined;
        payload.description = editForm.description || undefined;
        payload.contactPhone = editForm.contactPhone || undefined;
        payload.contactEmail = editForm.contactEmail || undefined;
        payload.eventUrl = editForm.eventUrl || undefined;
      } else if (editForm.itemType === 'car_rental') {
        payload.company = editForm.company;
        payload.pickupLocation = editForm.pickupLocation;
        payload.pickupDate = editForm.pickupDate;
        payload.pickupTime = editForm.pickupTime;
        payload.dropoffLocation = editForm.dropoffLocation;
        payload.dropoffDate = editForm.dropoffDate;
        payload.dropoffTime = editForm.dropoffTime;
        payload.confirmationNumber = editForm.confirmationNumber || undefined;
      }

      payload.isConfirmed = editForm.status !== 'tentative';
      await itemAPI.updateItem(selectedItem.id, payload);
      await loadTripsAndItems();
      closeEditForm();
    } catch (err) {
      alert('Failed to update item: ' + (err.message || 'Unknown error'));
    }
  }
</script>

<div class="dashboard-root">
  <div class="map-container" bind:this={mapContainer}></div>

  <!-- Floating left nav -->
  <nav class="side-nav">
    <button
      class="nav-square"
      class:active={activePane === 'addNew'}
      title="Add New"
      aria-label="Add New"
      on:click={() => togglePane('addNew')}
    >
      <!-- Plus icon -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>

    <button
      class="nav-square"
      class:active={activePane === 'timeline'}
      title="Timeline"
      aria-label="Timeline"
      on:click={() => togglePane('timeline')}
    >
      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M120-240q-33 0-56.5-23.5T40-320q0-33 23.5-56.5T120-400h10.5q4.5 0 9.5 2l182-182q-2-5-2-9.5V-600q0-33 23.5-56.5T400-680q33 0 56.5 23.5T480-600q0 2-2 20l102 102q5-2 9.5-2h21q4.5 0 9.5 2l142-142q-2-5-2-9.5V-640q0-33 23.5-56.5T840-720q33 0 56.5 23.5T920-640q0 33-23.5 56.5T840-560h-10.5q-4.5 0-9.5-2L678-420q2 5 2 9.5v10.5q0 33-23.5 56.5T600-320q-33 0-56.5-23.5T520-400v-10.5q0-4.5 2-9.5L420-522q-5 2-9.5 2H400q-2 0-20-2L198-340q2 5 2 9.5v10.5q0 33-23.5 56.5T120-240Z"/></svg>
    </button>

    <button
      class="nav-square"
      class:active={activePane === 'shared'}
      title="Friends' Trips"
      aria-label="Friends' Trips"
      on:click={() => togglePane('shared')}
    >
      <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M480-40 360-160H200q-33 0-56.5-23.5T120-240v-560q0-33 23.5-56.5T200-880h560q33 0 56.5 23.5T840-800v560q0 33-23.5 56.5T760-160H600L480-40ZM200-286q54-53 125.5-83.5T480-400q83 0 154.5 30.5T760-286v-514H200v514Zm379-235q41-41 41-99t-41-99q-41-41-99-41t-99 41q-41 41-41 99t41 99q41 41 99 41t99-41ZM280-240h400v-10q-42-35-93-52.5T480-320q-56 0-107 17.5T280-250v10Zm157.5-337.5Q420-595 420-620t17.5-42.5Q455-680 480-680t42.5 17.5Q540-645 540-620t-17.5 42.5Q505-560 480-560t-42.5-17.5ZM480-543Z"/></svg>
    </button>

    <button
      class="nav-square"
      class:active={activePane === 'calendar'}
      title="Calendar"
      aria-label="Calendar"
      on:click={() => togglePane('calendar')}
    >
      <!-- Calendar -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    </button>

    <button
      class="nav-square"
      class:active={activePane === 'settings'}
      title="Settings"
      aria-label="Settings"
      on:click={() => togglePane('settings')}
    >
      <!-- Gear / settings -->
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  </nav>

  <!-- Independent content pane -->
  {#if activePane === 'timeline'}
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
        {@const timelineEntries = getAllItemsChronological()}
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
                <div class="trip-card" class:selected={selectedTrip?.id === entry.trip.id} class:tentative={entry.trip.isConfirmed === false}>
                  <div class="trip-header" on:click={() => handleTripClick(entry.trip)} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && handleTripClick(entry.trip)}>
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
                    {#each entry.itemsByDate as dateGroup}
                      <div class="date-group-header">{formatDateGroupHeader(dateGroup.date)}</div>
                      {#each dateGroup.items as item}
                        <div class="item-row" class:selected={selectedItem?.id === item.id} class:tentative={item.isConfirmed === false} on:click={() => handleItemClick(item)}>
                          <div class="item-icon-wrap">
                            {#if item.itemType === 'flight' && item.flightNumber}
                              <span class="item-flight-time">{item.flightNumber}</span>
                            {/if}
                            <span class="item-icon">{@html getItemIcon(item.itemType)}</span>
                          </div>
                          <div class="item-details">
                            <span class="item-label">{getItemLabel(item)}</span>
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
                          {#if item.attendees?.length > 0}
                            <div class="attendee-badges">
                              {#each sortAttendees(item.attendees, item.createdBy) as att (att.id)}
                                <span class="attendee-badge" title="{att.user?.firstName || ''} {att.user?.lastName || att.user?.email || ''}">{getAttendeeInitials(att.user)}</span>
                              {/each}
                            </div>
                          {/if}
                        </div>
                      {/each}
                    {/each}
                  {:else}
                    <div class="trip-empty">No items in this trip yet</div>
                  {/if}
                </div>
              {:else}
                <!-- Standalone item -->
                <div class="timeline-item standalone" class:selected={selectedItem?.id === entry.item.id} class:tentative={entry.item.isConfirmed === false} on:click={() => handleItemClick(entry.item)}>
                  <div class="item-icon-wrap">
                    {#if entry.item.itemType === 'flight' && entry.item.flightNumber}
                      <span class="item-flight-time">{entry.item.flightNumber}</span>
                    {/if}
                    <span class="item-icon">{@html getItemIcon(entry.item.itemType)}</span>
                  </div>
                  <div class="item-details">
                    <span class="item-label">{getItemLabel(entry.item)}</span>
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
            <button class="close-button" on:click={closeEditForm} aria-label="Close">×</button>
          </div>
          <form class="edit-form" on:submit={handleUpdateItem}>
            <!-- Trip Selector -->
            <div class="form-row">
              <div class="form-group">
                <label for="edit-item-trip">Trip (Optional)</label>
                <select id="edit-item-trip" bind:value={editForm.tripId}>
                  <option value="">None (standalone item)</option>
                  {#each trips as trip}
                    <option value={trip.id}>{trip.name}</option>
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

            <!-- Flight Form -->
            {#if editForm.itemType === 'flight'}
              <div class="form-row">
                <div class="form-group form-group--30">
                  <label for="edit-flight-number">Flight *</label>
                  <input type="text" id="edit-flight-number" value={editForm.flightNumber} on:input={onEditFlightNumberInput} placeholder="e.g., AA100" required />
                </div>
                <div class="form-group form-group--70">
                  <label for="edit-airline">Airline</label>
                  <input type="text" id="edit-airline" value={editForm.airline} placeholder="Auto-populated" disabled />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="edit-origin">Origin *</label>
                  <input type="text" id="edit-origin" bind:value={editForm.origin} placeholder="e.g., JFK" required />
                </div>
                <div class="form-group">
                  <label for="edit-destination">Destination *</label>
                  <input type="text" id="edit-destination" bind:value={editForm.destination} placeholder="e.g., LAX" required />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group form-group--half">
                  <label for="edit-departure-date">Departure Date *</label>
                  <input type="date" id="edit-departure-date" bind:value={editForm.departureDate} on:change={() => onEditStartDateChange('departureDate', 'arrivalDate')} required />
                </div>
                <div class="form-group form-group--half">
                  <label for="edit-arrival-date">Arrival Date *</label>
                  <input type="date" id="edit-arrival-date" bind:value={editForm.arrivalDate} on:change={() => onEditEndDateChange('departureDate', 'arrivalDate')} required />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group form-group--half">
                  <label for="edit-departure-time">Departure Time *</label>
                  <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="edit-departure-time" bind:value={editForm.departureTime} required />
                </div>
                <div class="form-group form-group--half">
                  <label for="edit-arrival-time">Arrival Time *</label>
                  <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="edit-arrival-time" bind:value={editForm.arrivalTime} required />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="edit-pnr">PNR / Confirmation</label>
                  <input type="text" id="edit-pnr" bind:value={editForm.pnr} placeholder="Booking reference" />
                </div>
                <div class="form-group">
                  <label for="edit-seat">Seat</label>
                  <input type="text" id="edit-seat" bind:value={editForm.seat} placeholder="e.g., 12A" />
                </div>
              </div>
            {/if}

            <!-- Hotel Form -->
            {#if editForm.itemType === 'hotel'}
              <div class="form-group">
                <label for="edit-hotel-name">Hotel Name *</label>
                <input type="text" id="edit-hotel-name" bind:value={editForm.hotelName} placeholder="e.g., Hilton Garden Inn" required />
              </div>

              <div class="form-group">
                <label for="edit-address">Address *</label>
                <textarea id="edit-address" bind:value={editForm.address} placeholder="Full hotel address" rows="2" required></textarea>
              </div>

              <div class="form-group">
                <label for="edit-hotel-phone">Phone</label>
                <PhoneInput id="edit-hotel-phone" value={editForm.phone} onChangeNumber={(num) => { editForm.phone = num; }} />
              </div>

              <div class="form-row">
                <div class="form-group form-group--half">
                  <label for="edit-check-in-date">Check-in Date *</label>
                  <input type="date" id="edit-check-in-date" bind:value={editForm.checkInDate} on:change={() => onEditStartDateChange('checkInDate', 'checkOutDate')} required />
                </div>
                <div class="form-group form-group--half">
                  <label for="edit-check-out-date">Check-out Date *</label>
                  <input type="date" id="edit-check-out-date" bind:value={editForm.checkOutDate} on:change={() => onEditEndDateChange('checkInDate', 'checkOutDate')} required />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group form-group--half">
                  <label for="edit-check-in-time">Check-in Time *</label>
                  <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="edit-check-in-time" bind:value={editForm.checkInTime} required />
                </div>
                <div class="form-group form-group--half">
                  <label for="edit-check-out-time">Check-out Time *</label>
                  <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="edit-check-out-time" bind:value={editForm.checkOutTime} required />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="edit-confirmation-number">Confirmation #</label>
                  <input type="text" id="edit-confirmation-number" bind:value={editForm.confirmationNumber} placeholder="Booking number" />
                </div>
                <div class="form-group">
                  <label for="edit-room-number">Room Number</label>
                  <input type="text" id="edit-room-number" bind:value={editForm.roomNumber} placeholder="e.g., 205" />
                </div>
              </div>
            {/if}

            <!-- Transportation Form -->
            {#if editForm.itemType === 'transportation'}
              <div class="form-group">
                <label for="edit-method">Method *</label>
                <input type="text" id="edit-method" bind:value={editForm.method} placeholder="e.g., Train, Bus, Ferry" required />
              </div>

              <div class="form-group">
                <label for="edit-journey-number">Journey/Route Number</label>
                <input type="text" id="edit-journey-number" bind:value={editForm.journeyNumber} placeholder="e.g., Route 405" />
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="edit-trans-origin">Origin *</label>
                  <input type="text" id="edit-trans-origin" bind:value={editForm.origin} placeholder="Departure location" required />
                </div>
                <div class="form-group">
                  <label for="edit-trans-destination">Destination *</label>
                  <input type="text" id="edit-trans-destination" bind:value={editForm.destination} placeholder="Arrival location" required />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group form-group--half">
                  <label for="edit-trans-departure-date">Departure Date *</label>
                  <input type="date" id="edit-trans-departure-date" bind:value={editForm.departureDate} on:change={() => onEditStartDateChange('departureDate', 'arrivalDate')} required />
                </div>
                <div class="form-group form-group--half">
                  <label for="edit-trans-arrival-date">Arrival Date *</label>
                  <input type="date" id="edit-trans-arrival-date" bind:value={editForm.arrivalDate} on:change={() => onEditEndDateChange('departureDate', 'arrivalDate')} required />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group form-group--half">
                  <label for="edit-trans-departure-time">Departure Time *</label>
                  <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="edit-trans-departure-time" bind:value={editForm.departureTime} required />
                </div>
                <div class="form-group form-group--half">
                  <label for="edit-trans-arrival-time">Arrival Time *</label>
                  <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="edit-trans-arrival-time" bind:value={editForm.arrivalTime} required />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="edit-trans-confirmation">Confirmation #</label>
                  <input type="text" id="edit-trans-confirmation" bind:value={editForm.confirmationNumber} placeholder="Booking reference" />
                </div>
                <div class="form-group">
                  <label for="edit-trans-seat">Seat</label>
                  <input type="text" id="edit-trans-seat" bind:value={editForm.seat} placeholder="e.g., Coach 3, Seat 12" />
                </div>
              </div>
            {/if}

            <!-- Event Form -->
            {#if editForm.itemType === 'event'}
              <div class="form-group">
                <label for="edit-event-name">Event Name *</label>
                <input type="text" id="edit-event-name" bind:value={editForm.name} placeholder="e.g., Concert, Conference" required />
              </div>

              <div class="form-group">
                <label for="edit-event-location">Location *</label>
                <textarea id="edit-event-location" bind:value={editForm.location} placeholder="Full address or venue name" rows="2" required></textarea>
              </div>

              <div class="form-row">
                <div class="form-group form-group--half">
                  <label for="edit-start-date">Start Date *</label>
                  <input type="date" id="edit-start-date" bind:value={editForm.startDate} on:change={() => onEditStartDateChange('startDate', 'endDate')} required />
                </div>
                <div class="form-group form-group--half">
                  <label for="edit-end-date">End Date</label>
                  <input type="date" id="edit-end-date" bind:value={editForm.endDate} on:change={() => onEditEndDateChange('startDate', 'endDate')} />
                </div>
              </div>

              <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-size:0.9rem; font-weight:500;">
                <input type="checkbox" bind:checked={editForm.allDay} on:change={() => { if (editForm.allDay) { editForm.startTime = '00:00'; editForm.endTime = '24:00'; } }} />
                All day event
              </label>

              {#if !editForm.allDay}
              <div class="form-row">
                <div class="form-group form-group--half">
                  <label for="edit-start-time">Start Time *</label>
                  <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="edit-start-time" bind:value={editForm.startTime} required />
                </div>
                <div class="form-group form-group--half">
                  <label for="edit-end-time">End Time</label>
                  <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="edit-end-time" bind:value={editForm.endTime} />
                </div>
              </div>
              {/if}

              <div class="form-group">
                <label for="edit-description">Description</label>
                <textarea id="edit-description" bind:value={editForm.description} placeholder="Event details" rows="3"></textarea>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="edit-contact-phone">Contact Phone</label>
                  <PhoneInput id="edit-contact-phone" value={editForm.contactPhone} onChangeNumber={(num) => { editForm.contactPhone = num; }} />
                </div>
                <div class="form-group">
                  <label for="edit-contact-email">Contact Email</label>
                  <input type="email" id="edit-contact-email" bind:value={editForm.contactEmail} placeholder="info@event.com" />
                </div>
              </div>

              <div class="form-group">
                <label for="edit-event-url">Event URL</label>
                <input type="url" id="edit-event-url" bind:value={editForm.eventUrl} placeholder="https://..." />
              </div>
            {/if}

            <!-- Car Rental Form -->
            {#if editForm.itemType === 'car_rental'}
              <div class="form-group">
                <label for="edit-company">Rental Company *</label>
                <input type="text" id="edit-company" bind:value={editForm.company} placeholder="e.g., Hertz, Enterprise" required />
              </div>

              <div class="form-group">
                <label for="edit-pickup-location">Pickup Location *</label>
                <input type="text" id="edit-pickup-location" bind:value={editForm.pickupLocation} placeholder="Full address" required />
              </div>

              <div class="form-row">
                <div class="form-group form-group--half">
                  <label for="edit-pickup-date">Pickup Date *</label>
                  <input type="date" id="edit-pickup-date" bind:value={editForm.pickupDate} on:change={() => onEditStartDateChange('pickupDate', 'dropoffDate')} required />
                </div>
                <div class="form-group form-group--half">
                  <label for="edit-pickup-time">Pickup Time *</label>
                  <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="edit-pickup-time" bind:value={editForm.pickupTime} required />
                </div>
              </div>

              <div class="form-group">
                <label for="edit-dropoff-location">Dropoff Location *</label>
                <input type="text" id="edit-dropoff-location" bind:value={editForm.dropoffLocation} placeholder="Full address" required />
              </div>

              <div class="form-row">
                <div class="form-group form-group--half">
                  <label for="edit-dropoff-date">Dropoff Date *</label>
                  <input type="date" id="edit-dropoff-date" bind:value={editForm.dropoffDate} on:change={() => onEditEndDateChange('pickupDate', 'dropoffDate')} required />
                </div>
                <div class="form-group form-group--half">
                  <label for="edit-dropoff-time">Dropoff Time *</label>
                  <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="edit-dropoff-time" bind:value={editForm.dropoffTime} required />
                </div>
              </div>

              <div class="form-group">
                <label for="edit-car-confirmation">Confirmation Number</label>
                <input type="text" id="edit-car-confirmation" bind:value={editForm.confirmationNumber} placeholder="Reservation number" />
              </div>
            {/if}

            <!-- Attendees section -->
            <div class="attendee-section">
              <h4 class="attendee-section-title">Travelers</h4>
              {#if formAttendeesLoading}
                <p class="attendee-empty">Loading…</p>
              {:else if formAttendees.length > 0}
                <div class="attendee-chips">
                  {#each formAttendees as att (att.id)}
                    <span class="attendee-chip">
                      <span class="attendee-chip-name">{att.user?.firstName || att.user?.email || 'Unknown'}</span>
                      {#if formAttendees.length > 1 && (selectedItem.tripId || att.user?.id !== selectedItem.createdBy)}
                        <button type="button" class="attendee-chip-remove" aria-label="Remove {att.user?.firstName || att.user?.email}" on:click={() => handleRemoveAttendee(att.id, selectedItem.itemType, selectedItem.id)}>×</button>
                      {/if}
                    </span>
                  {/each}
                </div>
              {:else}
                <p class="attendee-empty">No travelers added yet.</p>
              {/if}
              <div class="attendee-add-row">
                <div class="attendee-input-wrap">
                  <input
                    type="text"
                    class="attendee-email-input"
                    placeholder="Search by name or email"
                    bind:value={attendeeEmailInput}
                    on:input={onAttendeeInput}
                    on:blur={dismissAttendeeSuggestions}
                    on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAttendee(selectedItem.itemType, selectedItem.id); } else if (e.key === 'Escape') { attendeeSuggestions = []; } }}
                    autocomplete="off"
                  />
                  {#if attendeeSuggestions.length > 0}
                    <ul class="attendee-suggestions">
                      {#each attendeeSuggestions as u (u.id)}
                        <li>
                          <button type="button" class="attendee-suggestion-item" on:mousedown={() => selectAttendeeSuggestion(u, selectedItem.itemType, selectedItem.id, false)}>
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
                <button type="button" class="btn-attendee-add" disabled={attendeeAddLoading || !attendeeEmailInput.trim()} on:click={() => handleAddAttendee(selectedItem.itemType, selectedItem.id)}>
                  {attendeeAddLoading ? '…' : 'Add'}
                </button>
              </div>
              {#if attendeeAddError}
                <p class="attendee-error">{attendeeAddError}</p>
              {/if}
            </div>

            <div class="form-actions">
              <button type="button" class="btn-secondary" on:click={closeEditForm}>Cancel</button>
              <button type="submit" class="btn-primary">Update</button>
            </div>
            {#if selectedItem?.canDelete}
              <div class="form-actions-remove">
                <button type="button" class="btn-danger-outline" on:click={() => handleDeleteItem(selectedItem.id, selectedItem.itemType)}>Remove</button>
              </div>
            {/if}
          </form>
        </PaneColumn>
      {/if}
      {#if selectedTrip && !isMobileView}
        <PaneColumn span={1} divider={true}>
          <div class="edit-header">
            <h3 class="pane-title">Edit Trip</h3>
            <button class="close-button" on:click={closeTripEditForm} aria-label="Close">×</button>
          </div>
          <form class="edit-form" on:submit={handleUpdateTrip}>
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
            <div class="attendee-section">
              <h4 class="attendee-section-title">Travelers</h4>
              {#if formAttendeesLoading}
                <p class="attendee-empty">Loading…</p>
              {:else if formAttendees.length > 0}
                <div class="attendee-chips">
                  {#each formAttendees as att (att.id)}
                    <span class="attendee-chip">
                      <span class="attendee-chip-name">{att.user?.firstName || att.user?.email || 'Unknown'}</span>
                      {#if formAttendees.length > 1 && att.user?.id !== selectedTrip.createdBy}
                        <button type="button" class="attendee-chip-remove" aria-label="Remove {att.user?.firstName || att.user?.email}" on:click={() => handleRemoveAttendee(att.id, 'trip', selectedTrip.id)}>×</button>
                      {/if}
                    </span>
                  {/each}
                </div>
              {:else}
                <p class="attendee-empty">No travelers added yet.</p>
              {/if}
              <div class="attendee-add-row">
                <div class="attendee-input-wrap">
                  <input
                    type="text"
                    class="attendee-email-input"
                    placeholder="Search by name or email"
                    bind:value={attendeeEmailInput}
                    on:input={onAttendeeInput}
                    on:blur={dismissAttendeeSuggestions}
                    on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAttendee('trip', selectedTrip.id); } else if (e.key === 'Escape') { attendeeSuggestions = []; } }}
                    autocomplete="off"
                  />
                  {#if attendeeSuggestions.length > 0}
                    <ul class="attendee-suggestions">
                      {#each attendeeSuggestions as u (u.id)}
                        <li>
                          <button type="button" class="attendee-suggestion-item" on:mousedown={() => selectAttendeeSuggestion(u, 'trip', selectedTrip.id, false)}>
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
                <button type="button" class="btn-attendee-add" disabled={attendeeAddLoading || !attendeeEmailInput.trim()} on:click={() => handleAddAttendee('trip', selectedTrip.id)}>
                  {attendeeAddLoading ? '…' : 'Add'}
                </button>
              </div>
              {#if attendeeAddError}
                <p class="attendee-error">{attendeeAddError}</p>
              {/if}
            </div>

            <div class="form-actions">
              <button type="button" class="btn-secondary" on:click={closeTripEditForm}>Cancel</button>
              <button type="submit" class="btn-primary">Update</button>
            </div>
            <div class="form-actions-remove">
              <button type="button" class="btn-danger-outline" on:click={() => handleDeleteTrip(selectedTrip.id)}>Remove</button>
            </div>
          </form>
        </PaneColumn>
      {/if}
    </ContentPane>

    <!-- Mobile edit bottom sheet -->
    {#if isMobileView && (selectedItem || selectedTrip)}
      <div class="edit-sheet-backdrop" on:click={() => { closeEditForm(); closeTripEditForm(); }}></div>
      <div class="edit-sheet edit-sheet-open">
        <div class="filter-sheet-handle"></div>
        <div class="edit-sheet-scroll">
          {#if selectedItem}
            <div class="filter-sheet-header">
              <h3 class="pane-title" style="margin:0">Edit {selectedItem.itemType.replace('_', ' ')}</h3>
              <button class="close-btn" on:click={closeEditForm}>✕</button>
            </div>
            <form class="edit-form" on:submit={handleUpdateItem}>
              <div class="form-row">
                <div class="form-group">
                  <label for="m-edit-item-trip">Trip (Optional)</label>
                  <select id="m-edit-item-trip" bind:value={editForm.tripId}>
                    <option value="">None (standalone item)</option>
                    {#each trips as trip}
                      <option value={trip.id}>{trip.name}</option>
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
              {#if editForm.itemType === 'flight'}
                <div class="form-row">
                  <div class="form-group form-group--30">
                    <label for="m-edit-flight-number">Flight *</label>
                    <input type="text" id="m-edit-flight-number" value={editForm.flightNumber} on:input={onEditFlightNumberInput} placeholder="e.g., AA100" required />
                  </div>
                  <div class="form-group form-group--70">
                    <label for="m-edit-airline">Airline</label>
                    <input type="text" id="m-edit-airline" value={editForm.airline} placeholder="Auto-populated" disabled />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="m-edit-origin">Origin *</label>
                    <input type="text" id="m-edit-origin" bind:value={editForm.origin} placeholder="e.g., JFK" required />
                  </div>
                  <div class="form-group">
                    <label for="m-edit-destination">Destination *</label>
                    <input type="text" id="m-edit-destination" bind:value={editForm.destination} placeholder="e.g., LAX" required />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group form-group--half">
                    <label for="m-edit-departure-date">Departure Date *</label>
                    <input type="date" id="m-edit-departure-date" bind:value={editForm.departureDate} on:change={() => onEditStartDateChange('departureDate', 'arrivalDate')} required />
                  </div>
                  <div class="form-group form-group--half">
                    <label for="m-edit-arrival-date">Arrival Date *</label>
                    <input type="date" id="m-edit-arrival-date" bind:value={editForm.arrivalDate} on:change={() => onEditEndDateChange('departureDate', 'arrivalDate')} required />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group form-group--half">
                    <label for="m-edit-departure-time">Departure Time *</label>
                    <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="m-edit-departure-time" bind:value={editForm.departureTime} required />
                  </div>
                  <div class="form-group form-group--half">
                    <label for="m-edit-arrival-time">Arrival Time *</label>
                    <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="m-edit-arrival-time" bind:value={editForm.arrivalTime} required />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="m-edit-pnr">PNR / Confirmation</label>
                    <input type="text" id="m-edit-pnr" bind:value={editForm.pnr} placeholder="Booking reference" />
                  </div>
                  <div class="form-group">
                    <label for="m-edit-seat">Seat</label>
                    <input type="text" id="m-edit-seat" bind:value={editForm.seat} placeholder="e.g., 12A" />
                  </div>
                </div>
              {/if}
              {#if editForm.itemType === 'hotel'}
                <div class="form-group">
                  <label for="m-edit-hotel-name">Hotel Name *</label>
                  <input type="text" id="m-edit-hotel-name" bind:value={editForm.hotelName} placeholder="e.g., Hilton Garden Inn" required />
                </div>
                <div class="form-group">
                  <label for="m-edit-address">Address *</label>
                  <textarea id="m-edit-address" bind:value={editForm.address} placeholder="Full hotel address" rows="2" required></textarea>
                </div>
                <div class="form-group">
                  <label for="m-edit-hotel-phone">Phone</label>
                  <PhoneInput id="m-edit-hotel-phone" value={editForm.phone} onChangeNumber={(num) => { editForm.phone = num; }} />
                </div>
                <div class="form-row">
                  <div class="form-group form-group--half">
                    <label for="m-edit-check-in-date">Check-in Date *</label>
                    <input type="date" id="m-edit-check-in-date" bind:value={editForm.checkInDate} on:change={() => onEditStartDateChange('checkInDate', 'checkOutDate')} required />
                  </div>
                  <div class="form-group form-group--half">
                    <label for="m-edit-check-out-date">Check-out Date *</label>
                    <input type="date" id="m-edit-check-out-date" bind:value={editForm.checkOutDate} on:change={() => onEditEndDateChange('checkInDate', 'checkOutDate')} required />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group form-group--half">
                    <label for="m-edit-check-in-time">Check-in Time *</label>
                    <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="m-edit-check-in-time" bind:value={editForm.checkInTime} required />
                  </div>
                  <div class="form-group form-group--half">
                    <label for="m-edit-check-out-time">Check-out Time *</label>
                    <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="m-edit-check-out-time" bind:value={editForm.checkOutTime} required />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="m-edit-confirmation-number">Confirmation #</label>
                    <input type="text" id="m-edit-confirmation-number" bind:value={editForm.confirmationNumber} placeholder="Booking number" />
                  </div>
                  <div class="form-group">
                    <label for="m-edit-room-number">Room Number</label>
                    <input type="text" id="m-edit-room-number" bind:value={editForm.roomNumber} placeholder="e.g., 205" />
                  </div>
                </div>
              {/if}
              {#if editForm.itemType === 'transportation'}
                <div class="form-group">
                  <label for="m-edit-method">Method *</label>
                  <input type="text" id="m-edit-method" bind:value={editForm.method} placeholder="e.g., Train, Bus, Ferry" required />
                </div>
                <div class="form-group">
                  <label for="m-edit-journey-number">Journey/Route Number</label>
                  <input type="text" id="m-edit-journey-number" bind:value={editForm.journeyNumber} placeholder="e.g., Route 405" />
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="m-edit-trans-origin">Origin *</label>
                    <input type="text" id="m-edit-trans-origin" bind:value={editForm.origin} placeholder="Departure location" required />
                  </div>
                  <div class="form-group">
                    <label for="m-edit-trans-destination">Destination *</label>
                    <input type="text" id="m-edit-trans-destination" bind:value={editForm.destination} placeholder="Arrival location" required />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group form-group--half">
                    <label for="m-edit-trans-departure-date">Departure Date *</label>
                    <input type="date" id="m-edit-trans-departure-date" bind:value={editForm.departureDate} on:change={() => onEditStartDateChange('departureDate', 'arrivalDate')} required />
                  </div>
                  <div class="form-group form-group--half">
                    <label for="m-edit-trans-arrival-date">Arrival Date *</label>
                    <input type="date" id="m-edit-trans-arrival-date" bind:value={editForm.arrivalDate} on:change={() => onEditEndDateChange('departureDate', 'arrivalDate')} required />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group form-group--half">
                    <label for="m-edit-trans-departure-time">Departure Time *</label>
                    <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="m-edit-trans-departure-time" bind:value={editForm.departureTime} required />
                  </div>
                  <div class="form-group form-group--half">
                    <label for="m-edit-trans-arrival-time">Arrival Time *</label>
                    <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="m-edit-trans-arrival-time" bind:value={editForm.arrivalTime} required />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="m-edit-trans-confirmation">Confirmation #</label>
                    <input type="text" id="m-edit-trans-confirmation" bind:value={editForm.confirmationNumber} placeholder="Booking reference" />
                  </div>
                  <div class="form-group">
                    <label for="m-edit-trans-seat">Seat</label>
                    <input type="text" id="m-edit-trans-seat" bind:value={editForm.seat} placeholder="e.g., Coach 3, Seat 12" />
                  </div>
                </div>
              {/if}
              {#if editForm.itemType === 'event'}
                <div class="form-group">
                  <label for="m-edit-event-name">Event Name *</label>
                  <input type="text" id="m-edit-event-name" bind:value={editForm.name} placeholder="e.g., Concert, Conference" required />
                </div>
                <div class="form-group">
                  <label for="m-edit-event-location">Location *</label>
                  <textarea id="m-edit-event-location" bind:value={editForm.location} placeholder="Full address or venue name" rows="2" required></textarea>
                </div>
                <div class="form-row">
                  <div class="form-group form-group--half">
                    <label for="m-edit-start-date">Start Date *</label>
                    <input type="date" id="m-edit-start-date" bind:value={editForm.startDate} on:change={() => onEditStartDateChange('startDate', 'endDate')} required />
                  </div>
                  <div class="form-group form-group--half">
                    <label for="m-edit-end-date">End Date</label>
                    <input type="date" id="m-edit-end-date" bind:value={editForm.endDate} on:change={() => onEditEndDateChange('startDate', 'endDate')} />
                  </div>
                </div>
                <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-size:0.9rem; font-weight:500;">
                  <input type="checkbox" bind:checked={editForm.allDay} on:change={() => { if (editForm.allDay) { editForm.startTime = '00:00'; editForm.endTime = '24:00'; } }} />
                  All day event
                </label>
                {#if !editForm.allDay}
                <div class="form-row">
                  <div class="form-group form-group--half">
                    <label for="m-edit-start-time">Start Time *</label>
                    <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="m-edit-start-time" bind:value={editForm.startTime} required />
                  </div>
                  <div class="form-group form-group--half">
                    <label for="m-edit-end-time">End Time</label>
                    <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="m-edit-end-time" bind:value={editForm.endTime} />
                  </div>
                </div>
                {/if}
                <div class="form-group">
                  <label for="m-edit-description">Description</label>
                  <textarea id="m-edit-description" bind:value={editForm.description} placeholder="Event details" rows="3"></textarea>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="m-edit-contact-phone">Contact Phone</label>
                    <PhoneInput id="m-edit-contact-phone" value={editForm.contactPhone} onChangeNumber={(num) => { editForm.contactPhone = num; }} />
                  </div>
                  <div class="form-group">
                    <label for="m-edit-contact-email">Contact Email</label>
                    <input type="email" id="m-edit-contact-email" bind:value={editForm.contactEmail} placeholder="info@event.com" />
                  </div>
                </div>
                <div class="form-group">
                  <label for="m-edit-event-url">Event URL</label>
                  <input type="url" id="m-edit-event-url" bind:value={editForm.eventUrl} placeholder="https://..." />
                </div>
              {/if}
              {#if editForm.itemType === 'car_rental'}
                <div class="form-group">
                  <label for="m-edit-company">Rental Company *</label>
                  <input type="text" id="m-edit-company" bind:value={editForm.company} placeholder="e.g., Hertz, Enterprise" required />
                </div>
                <div class="form-group">
                  <label for="m-edit-pickup-location">Pickup Location *</label>
                  <input type="text" id="m-edit-pickup-location" bind:value={editForm.pickupLocation} placeholder="Full address" required />
                </div>
                <div class="form-row">
                  <div class="form-group form-group--half">
                    <label for="m-edit-pickup-date">Pickup Date *</label>
                    <input type="date" id="m-edit-pickup-date" bind:value={editForm.pickupDate} on:change={() => onEditStartDateChange('pickupDate', 'dropoffDate')} required />
                  </div>
                  <div class="form-group form-group--half">
                    <label for="m-edit-pickup-time">Pickup Time *</label>
                    <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="m-edit-pickup-time" bind:value={editForm.pickupTime} required />
                  </div>
                </div>
                <div class="form-group">
                  <label for="m-edit-dropoff-location">Dropoff Location *</label>
                  <input type="text" id="m-edit-dropoff-location" bind:value={editForm.dropoffLocation} placeholder="Full address" required />
                </div>
                <div class="form-row">
                  <div class="form-group form-group--half">
                    <label for="m-edit-dropoff-date">Dropoff Date *</label>
                    <input type="date" id="m-edit-dropoff-date" bind:value={editForm.dropoffDate} on:change={() => onEditEndDateChange('pickupDate', 'dropoffDate')} required />
                  </div>
                  <div class="form-group form-group--half">
                    <label for="m-edit-dropoff-time">Dropoff Time *</label>
                    <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="m-edit-dropoff-time" bind:value={editForm.dropoffTime} required />
                  </div>
                </div>
                <div class="form-group">
                  <label for="m-edit-car-confirmation">Confirmation Number</label>
                  <input type="text" id="m-edit-car-confirmation" bind:value={editForm.confirmationNumber} placeholder="Reservation number" />
                </div>
              {/if}
              <!-- Attendees -->
              <div class="attendee-section">
                <h4 class="attendee-section-title">Travelers</h4>
                {#if formAttendeesLoading}
                  <p class="attendee-empty">Loading…</p>
                {:else if formAttendees.length > 0}
                  <div class="attendee-chips">
                    {#each formAttendees as att (att.id)}
                      <span class="attendee-chip">
                        <span class="attendee-chip-name">{att.user?.firstName || att.user?.email || 'Unknown'}</span>
                        {#if formAttendees.length > 1 && (selectedItem.tripId || att.user?.id !== selectedItem.createdBy)}
                          <button type="button" class="attendee-chip-remove" aria-label="Remove {att.user?.firstName || att.user?.email}" on:click={() => handleRemoveAttendee(att.id, selectedItem.itemType, selectedItem.id)}>×</button>
                        {/if}
                      </span>
                    {/each}
                  </div>
                {:else}
                  <p class="attendee-empty">No travelers added yet.</p>
                {/if}
                <div class="attendee-add-row">
                  <div class="attendee-input-wrap">
                    <input type="text" class="attendee-email-input" placeholder="Search by name or email" bind:value={attendeeEmailInput} on:input={onAttendeeInput} on:blur={dismissAttendeeSuggestions} on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAttendee(selectedItem.itemType, selectedItem.id); } else if (e.key === 'Escape') { attendeeSuggestions = []; } }} autocomplete="off" />
                    {#if attendeeSuggestions.length > 0}
                      <ul class="attendee-suggestions">
                        {#each attendeeSuggestions as u (u.id)}
                          <li><button type="button" class="attendee-suggestion-item" on:mousedown={() => selectAttendeeSuggestion(u, selectedItem.itemType, selectedItem.id, false)}><span class="suggestion-name">{u.firstName || ''} {u.lastName || ''}</span><span class="suggestion-email">{u.email}</span></button></li>
                        {/each}
                      </ul>
                    {:else if attendeeSuggestionsLoading}
                      <ul class="attendee-suggestions"><li class="suggestion-loading">Searching…</li></ul>
                    {/if}
                  </div>
                  <button type="button" class="btn-attendee-add" disabled={attendeeAddLoading || !attendeeEmailInput.trim()} on:click={() => handleAddAttendee(selectedItem.itemType, selectedItem.id)}>{attendeeAddLoading ? '…' : 'Add'}</button>
                </div>
                {#if attendeeAddError}<p class="attendee-error">{attendeeAddError}</p>{/if}
              </div>
              <div class="form-actions">
                <button type="button" class="btn-secondary" on:click={closeEditForm}>Cancel</button>
                <button type="submit" class="btn-primary">Update</button>
              </div>
              {#if selectedItem?.canDelete}
                <div class="form-actions-remove">
                  <button type="button" class="btn-danger-outline" on:click={() => handleDeleteItem(selectedItem.id, selectedItem.itemType)}>Remove</button>
                </div>
              {/if}
            </form>
          {:else if selectedTrip}
            <div class="filter-sheet-header">
              <h3 class="pane-title" style="margin:0">Edit Trip</h3>
              <button class="close-btn" on:click={closeTripEditForm}>✕</button>
            </div>
            <form class="edit-form" on:submit={handleUpdateTrip}>
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
              <div class="attendee-section">
                <h4 class="attendee-section-title">Travelers</h4>
                {#if formAttendeesLoading}
                  <p class="attendee-empty">Loading…</p>
                {:else if formAttendees.length > 0}
                  <div class="attendee-chips">
                    {#each formAttendees as att (att.id)}
                      <span class="attendee-chip">
                        <span class="attendee-chip-name">{att.user?.firstName || att.user?.email || 'Unknown'}</span>
                        {#if formAttendees.length > 1 && att.user?.id !== selectedTrip.createdBy}
                          <button type="button" class="attendee-chip-remove" aria-label="Remove {att.user?.firstName || att.user?.email}" on:click={() => handleRemoveAttendee(att.id, 'trip', selectedTrip.id)}>×</button>
                        {/if}
                      </span>
                    {/each}
                  </div>
                {:else}
                  <p class="attendee-empty">No travelers added yet.</p>
                {/if}
                <div class="attendee-add-row">
                  <div class="attendee-input-wrap">
                    <input type="text" class="attendee-email-input" placeholder="Search by name or email" bind:value={attendeeEmailInput} on:input={onAttendeeInput} on:blur={dismissAttendeeSuggestions} on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAttendee('trip', selectedTrip.id); } else if (e.key === 'Escape') { attendeeSuggestions = []; } }} autocomplete="off" />
                    {#if attendeeSuggestions.length > 0}
                      <ul class="attendee-suggestions">
                        {#each attendeeSuggestions as u (u.id)}
                          <li><button type="button" class="attendee-suggestion-item" on:mousedown={() => selectAttendeeSuggestion(u, 'trip', selectedTrip.id, false)}><span class="suggestion-name">{u.firstName || ''} {u.lastName || ''}</span><span class="suggestion-email">{u.email}</span></button></li>
                        {/each}
                      </ul>
                    {:else if attendeeSuggestionsLoading}
                      <ul class="attendee-suggestions"><li class="suggestion-loading">Searching…</li></ul>
                    {/if}
                  </div>
                  <button type="button" class="btn-attendee-add" disabled={attendeeAddLoading || !attendeeEmailInput.trim()} on:click={() => handleAddAttendee('trip', selectedTrip.id)}>{attendeeAddLoading ? '…' : 'Add'}</button>
                </div>
                {#if attendeeAddError}<p class="attendee-error">{attendeeAddError}</p>{/if}
              </div>
              <div class="form-actions">
                <button type="button" class="btn-secondary" on:click={closeTripEditForm}>Cancel</button>
                <button type="submit" class="btn-primary">Update</button>
              </div>
              <div class="form-actions-remove">
                <button type="button" class="btn-danger-outline" on:click={() => handleDeleteTrip(selectedTrip.id)}>Remove</button>
              </div>
            </form>
          {/if}
        </div>
      </div>
    {/if}
  {/if}

  {#if activePane === 'shared'}
    <ContentPane columns={1} mobileTop="30vh">
      <PaneColumn span={1}>
        <h3 class="pane-title">Friends' Trips</h3>

        {#key friendsTrips.length + trips.length + companionStandaloneItems.length}
          {@const friendsEntries = getFriendsTimelineEntries()}
          {#if friendsEntries.length === 0}
            <p class="pane-empty">No upcoming trips or items from friends.</p>
          {:else}
            <div class="timeline-content">
              {#each friendsEntries as entry, i}
                {@const prevEntry = i > 0 ? friendsEntries[i - 1] : null}
                {@const thisMonth = getMonthYear(entry.sortDate)}
                {@const prevMonth = prevEntry ? getMonthYear(prevEntry.sortDate) : null}
                {#if thisMonth !== prevMonth}
                  <div class="month-header">{thisMonth}</div>
                {/if}
                {#if entry.type === 'trip'}
                  <div class="trip-card" class:tentative={entry.trip.isConfirmed === false}>
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
                        <div class="date-group-header">{formatDateGroupHeader(dateGroup.date)}</div>
                        {#each dateGroup.items as item}
                          <div class="item-row" class:tentative={item.isConfirmed === false}>
                            <div class="item-icon-wrap">
                              {#if item.itemType === 'flight' && item.departureDateTime}
                                <span class="item-flight-time">{formatTime24(item.departureDateTime, item.originTimezone)}</span>
                              {/if}
                              <span class="item-icon">{@html getItemIcon(item.itemType)}</span>
                            </div>
                            <div class="item-details">
                              <span class="item-label">{getItemLabel(item)}</span>
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
                      <span class="item-label">{getItemLabel(entry.item)}</span>
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
    </ContentPane>
  {/if}

  {#if activePane === 'addNew'}
    <ContentPane columns={1}>
      <PaneColumn span={1}>
      {#if addNewView === 'menu'}
        <h3 class="pane-title">Add New</h3>
        <div class="add-new-menu">
          <button class="add-new-option" on:click={showTripForm}>
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

          <button class="add-new-option" on:click={showItemForm}>
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
          <button class="back-button" on:click={backToMenu} aria-label="Back to menu">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <h3 class="pane-title">New Trip</h3>
        </div>
        <form class="add-form" on:submit={handleCreateTrip}>
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
          <div class="attendee-section">
            <h4 class="attendee-section-title">Travelers</h4>
            {#if pendingAttendees.length > 0}
              <div class="attendee-chips">
                {#each pendingAttendees as pa (pa.email)}
                  <span class="attendee-chip">
                    <span class="attendee-chip-name">{pa.firstName ? `${pa.firstName}${pa.lastName ? ' ' + pa.lastName : ''}` : pa.email}</span>
                    <button type="button" class="attendee-chip-remove" aria-label="Remove {pa.email}" on:click={() => handleRemovePendingAttendee(pa.email)}>×</button>
                  </span>
                {/each}
              </div>
            {:else}
              <p class="attendee-empty">No travelers added yet.</p>
            {/if}
            <div class="attendee-add-row">
              <div class="attendee-input-wrap">
                <input
                  type="text"
                  class="attendee-email-input"
                  placeholder="Search by name or email"
                  bind:value={attendeeEmailInput}
                  on:input={onAttendeeInput}
                  on:blur={dismissAttendeeSuggestions}
                  on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQueueAttendee(); } else if (e.key === 'Escape') { attendeeSuggestions = []; } }}
                  autocomplete="off"
                />
                {#if attendeeSuggestions.length > 0}
                  <ul class="attendee-suggestions">
                    {#each attendeeSuggestions as u (u.id)}
                      <li>
                        <button type="button" class="attendee-suggestion-item" on:mousedown={() => selectAttendeeSuggestion(u, null, null, true)}>
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
              <button type="button" class="btn-attendee-add" disabled={!attendeeEmailInput.trim()} on:click={handleQueueAttendee}>Add</button>
            </div>
            {#if attendeeAddError}
              <p class="attendee-error">{attendeeAddError}</p>
            {/if}
          </div>

          <div class="form-actions">
            <button type="button" class="btn-secondary" on:click={backToMenu}>Cancel</button>
            <button type="submit" class="btn-primary">Update</button>
          </div>
        </form>
      {:else if addNewView === 'itemForm'}
        <div class="form-header">
          <button class="back-button" on:click={backToMenu} aria-label="Back to menu">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <h3 class="pane-title">New Item</h3>
        </div>
        <form class="add-form" on:submit={handleCreateItem}>
          <div class="form-group">
            <label for="item-type">Item Type</label>
            <select id="item-type" bind:value={itemForm.itemType} on:change={() => { if (itemForm.itemType === 'hotel') { itemForm.checkInTime = '14:00'; itemForm.checkOutTime = '11:00'; } }}>
              <option value="flight">Flight</option>
              <option value="hotel">Hotel</option>
              <option value="transportation">Transportation</option>
              <option value="event">Event</option>
              <option value="car_rental">Car Rental</option>
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="item-trip">Trip (Optional)</label>
              <select id="item-trip" bind:value={itemForm.tripId}>
                <option value="">None (standalone item)</option>
                {#each trips as trip}
                  <option value={trip.id}>{trip.name}</option>
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

          <!-- Flight Form -->
          {#if itemForm.itemType === 'flight'}
            <div class="form-row">
              <div class="form-group form-group--30">
                <label for="flight-number">Flight *</label>
                <input type="text" id="flight-number" value={itemForm.flightNumber} on:input={onItemFlightNumberInput} placeholder="e.g., AA100" required />
              </div>
              <div class="form-group form-group--70">
                <label for="airline">Airline</label>
                <input type="text" id="airline" value={itemForm.airline} placeholder="Auto-populated" disabled />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="origin">Origin *</label>
                <input type="text" id="origin" bind:value={itemForm.origin} placeholder="e.g., JFK" required />
              </div>
              <div class="form-group">
                <label for="destination">Destination *</label>
                <input type="text" id="destination" bind:value={itemForm.destination} placeholder="e.g., LAX" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group form-group--half">
                <label for="departure-date">Departure Date *</label>
                <input type="date" id="departure-date" bind:value={itemForm.departureDate} on:change={() => onItemStartDateChange('departureDate', 'arrivalDate')} required />
              </div>
              <div class="form-group form-group--half">
                <label for="arrival-date">Arrival Date *</label>
                <input type="date" id="arrival-date" bind:value={itemForm.arrivalDate} on:change={() => onItemEndDateChange('departureDate', 'arrivalDate')} required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group form-group--half">
                <label for="departure-time">Departure Time *</label>
                <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="departure-time" bind:value={itemForm.departureTime} required />
              </div>
              <div class="form-group form-group--half">
                <label for="arrival-time">Arrival Time *</label>
                <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="arrival-time" bind:value={itemForm.arrivalTime} required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="pnr">PNR / Confirmation</label>
                <input type="text" id="pnr" bind:value={itemForm.pnr} placeholder="Booking reference" />
              </div>
              <div class="form-group">
                <label for="seat">Seat</label>
                <input type="text" id="seat" bind:value={itemForm.seat} placeholder="e.g., 12A" />
              </div>
            </div>
          {/if}

          <!-- Hotel Form -->
          {#if itemForm.itemType === 'hotel'}
            <div class="form-group">
              <label for="hotel-name">Hotel Name *</label>
              <input type="text" id="hotel-name" bind:value={itemForm.hotelName} placeholder="e.g., Hilton Garden Inn" required />
            </div>

            <div class="form-group">
              <label for="address">Address *</label>
              <textarea id="address" bind:value={itemForm.address} placeholder="Full hotel address" rows="2" required></textarea>
            </div>

            <div class="form-group">
              <label for="hotel-phone">Phone</label>
              <PhoneInput id="hotel-phone" value={itemForm.phone} onChangeNumber={(num) => { itemForm.phone = num; }} />
            </div>

            <div class="form-row">
              <div class="form-group form-group--half">
                <label for="check-in-date">Check-in Date *</label>
                <input type="date" id="check-in-date" bind:value={itemForm.checkInDate} on:change={() => onItemStartDateChange('checkInDate', 'checkOutDate')} required />
              </div>
              <div class="form-group form-group--half">
                <label for="check-out-date">Check-out Date *</label>
                <input type="date" id="check-out-date" bind:value={itemForm.checkOutDate} on:change={() => onItemEndDateChange('checkInDate', 'checkOutDate')} required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group form-group--half">
                <label for="check-in-time">Check-in Time *</label>
                <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="check-in-time" bind:value={itemForm.checkInTime} required />
              </div>
              <div class="form-group form-group--half">
                <label for="check-out-time">Check-out Time *</label>
                <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="check-out-time" bind:value={itemForm.checkOutTime} required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="confirmation-number">Confirmation #</label>
                <input type="text" id="confirmation-number" bind:value={itemForm.confirmationNumber} placeholder="Booking number" />
              </div>
              <div class="form-group">
                <label for="room-number">Room Number</label>
                <input type="text" id="room-number" bind:value={itemForm.roomNumber} placeholder="e.g., 205" />
              </div>
            </div>
          {/if}

          <!-- Transportation Form -->
          {#if itemForm.itemType === 'transportation'}
            <div class="form-group">
              <label for="method">Method *</label>
              <input type="text" id="method" bind:value={itemForm.method} placeholder="e.g., Train, Bus, Ferry" required />
            </div>

            <div class="form-group">
              <label for="journey-number">Journey/Route Number</label>
              <input type="text" id="journey-number" bind:value={itemForm.journeyNumber} placeholder="e.g., Route 405" />
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="trans-origin">Origin *</label>
                <input type="text" id="trans-origin" bind:value={itemForm.origin} placeholder="Departure location" required />
              </div>
              <div class="form-group">
                <label for="trans-destination">Destination *</label>
                <input type="text" id="trans-destination" bind:value={itemForm.destination} placeholder="Arrival location" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group form-group--half">
                <label for="trans-departure-date">Departure Date *</label>
                <input type="date" id="trans-departure-date" bind:value={itemForm.departureDate} on:change={() => onItemStartDateChange('departureDate', 'arrivalDate')} required />
              </div>
              <div class="form-group form-group--half">
                <label for="trans-arrival-date">Arrival Date *</label>
                <input type="date" id="trans-arrival-date" bind:value={itemForm.arrivalDate} on:change={() => onItemEndDateChange('departureDate', 'arrivalDate')} required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group form-group--half">
                <label for="trans-departure-time">Departure Time *</label>
                <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="trans-departure-time" bind:value={itemForm.departureTime} required />
              </div>
              <div class="form-group form-group--half">
                <label for="trans-arrival-time">Arrival Time *</label>
                <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="trans-arrival-time" bind:value={itemForm.arrivalTime} required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="trans-confirmation">Confirmation #</label>
                <input type="text" id="trans-confirmation" bind:value={itemForm.confirmationNumber} placeholder="Booking reference" />
              </div>
              <div class="form-group">
                <label for="trans-seat">Seat</label>
                <input type="text" id="trans-seat" bind:value={itemForm.seat} placeholder="e.g., Coach 3, Seat 12" />
              </div>
            </div>
          {/if}

          <!-- Event Form -->
          {#if itemForm.itemType === 'event'}
            <div class="form-group">
              <label for="event-name">Event Name *</label>
              <input type="text" id="event-name" bind:value={itemForm.name} placeholder="e.g., Concert, Conference" required />
            </div>

            <div class="form-group">
              <label for="event-location">Location *</label>
              <textarea id="event-location" bind:value={itemForm.location} placeholder="Full address or venue name" rows="2" required></textarea>
            </div>

            <div class="form-row">
              <div class="form-group form-group--half">
                <label for="start-date">Start Date *</label>
                <input type="date" id="start-date" bind:value={itemForm.startDate} on:change={() => onItemStartDateChange('startDate', 'endDate')} required />
              </div>
              <div class="form-group form-group--half">
                <label for="end-date">End Date</label>
                <input type="date" id="end-date" bind:value={itemForm.endDate} on:change={() => onItemEndDateChange('startDate', 'endDate')} />
              </div>
            </div>

            <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-size:0.9rem; font-weight:500;">
              <input type="checkbox" bind:checked={itemForm.allDay} on:change={() => { if (itemForm.allDay) { itemForm.startTime = '00:00'; itemForm.endTime = '24:00'; } }} />
              All day event
            </label>

            {#if !itemForm.allDay}
            <div class="form-row">
              <div class="form-group form-group--half">
                <label for="start-time">Start Time *</label>
                <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="start-time" bind:value={itemForm.startTime} required />
              </div>
              <div class="form-group form-group--half">
                <label for="end-time">End Time</label>
                <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="end-time" bind:value={itemForm.endTime} />
              </div>
            </div>
            {/if}

            <div class="form-group">
              <label for="description">Description</label>
              <textarea id="description" bind:value={itemForm.description} placeholder="Event details" rows="3"></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="contact-phone">Contact Phone</label>
                <PhoneInput id="contact-phone" value={itemForm.contactPhone} onChangeNumber={(num) => { itemForm.contactPhone = num; }} />
              </div>
              <div class="form-group">
                <label for="contact-email">Contact Email</label>
                <input type="email" id="contact-email" bind:value={itemForm.contactEmail} placeholder="info@event.com" />
              </div>
            </div>

            <div class="form-group">
              <label for="event-url">Event URL</label>
              <input type="url" id="event-url" bind:value={itemForm.eventUrl} placeholder="https://..." />
            </div>
          {/if}

          <!-- Car Rental Form -->
          {#if itemForm.itemType === 'car_rental'}
            <div class="form-group">
              <label for="company">Rental Company *</label>
              <input type="text" id="company" bind:value={itemForm.company} placeholder="e.g., Hertz, Enterprise" required />
            </div>

            <div class="form-group">
              <label for="pickup-location">Pickup Location *</label>
              <input type="text" id="pickup-location" bind:value={itemForm.pickupLocation} placeholder="Full address" required />
            </div>

            <div class="form-row">
              <div class="form-group form-group--half">
                <label for="pickup-date">Pickup Date *</label>
                <input type="date" id="pickup-date" bind:value={itemForm.pickupDate} on:change={() => onItemStartDateChange('pickupDate', 'dropoffDate')} required />
              </div>
              <div class="form-group form-group--half">
                <label for="pickup-time">Pickup Time *</label>
                <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="pickup-time" bind:value={itemForm.pickupTime} required />
              </div>
            </div>

            <div class="form-group">
              <label for="dropoff-location">Dropoff Location *</label>
              <input type="text" id="dropoff-location" bind:value={itemForm.dropoffLocation} placeholder="Full address" required />
            </div>

            <div class="form-row">
              <div class="form-group form-group--half">
                <label for="dropoff-date">Dropoff Date *</label>
                <input type="date" id="dropoff-date" bind:value={itemForm.dropoffDate} on:change={() => onItemEndDateChange('pickupDate', 'dropoffDate')} required />
              </div>
              <div class="form-group form-group--half">
                <label for="dropoff-time">Dropoff Time *</label>
                <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="HH:MM" use:timeInput id="dropoff-time" bind:value={itemForm.dropoffTime} required />
              </div>
            </div>

            <div class="form-group">
              <label for="car-confirmation">Confirmation Number</label>
              <input type="text" id="car-confirmation" bind:value={itemForm.confirmationNumber} placeholder="Reservation number" />
            </div>
          {/if}

          <!-- Attendees section -->
          <div class="attendee-section">
            <h4 class="attendee-section-title">Travelers</h4>
            {#if pendingAttendees.length > 0}
              <div class="attendee-chips">
                {#each pendingAttendees as pa (pa.email)}
                  <span class="attendee-chip">
                    <span class="attendee-chip-name">{pa.firstName ? `${pa.firstName}${pa.lastName ? ' ' + pa.lastName : ''}` : pa.email}</span>
                    <button type="button" class="attendee-chip-remove" aria-label="Remove {pa.email}" on:click={() => handleRemovePendingAttendee(pa.email)}>×</button>
                  </span>
                {/each}
              </div>
            {:else}
              <p class="attendee-empty">No travelers added yet.</p>
            {/if}
            <div class="attendee-add-row">
              <div class="attendee-input-wrap">
                <input
                  type="text"
                  class="attendee-email-input"
                  placeholder="Search by name or email"
                  bind:value={attendeeEmailInput}
                  on:input={onAttendeeInput}
                  on:blur={dismissAttendeeSuggestions}
                  on:keydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQueueAttendee(); } else if (e.key === 'Escape') { attendeeSuggestions = []; } }}
                  autocomplete="off"
                />
                {#if attendeeSuggestions.length > 0}
                  <ul class="attendee-suggestions">
                    {#each attendeeSuggestions as u (u.id)}
                      <li>
                        <button type="button" class="attendee-suggestion-item" on:mousedown={() => selectAttendeeSuggestion(u, null, null, true)}>
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
              <button type="button" class="btn-attendee-add" disabled={!attendeeEmailInput.trim()} on:click={handleQueueAttendee}>Add</button>
            </div>
            {#if attendeeAddError}
              <p class="attendee-error">{attendeeAddError}</p>
            {/if}
          </div>

          <div class="form-actions">
            <button type="button" class="btn-secondary" on:click={backToMenu}>Cancel</button>
            <button type="submit" class="btn-primary">Update</button>
          </div>
        </form>
      {/if}
      </PaneColumn>
    </ContentPane>
  {/if}

  {#if activePane === 'calendar'}
    <ContentPane columns={showCalendarFilters ? 4 : 3}>
      <!-- Filter column — desktop only -->
      {#if showCalendarFilters}
      <PaneColumn span={1}>
        <h3 class="pane-title">Filters</h3>

        <div class="filter-section">
          <h4 class="filter-section-title">Show on Calendar</h4>
          <div class="filter-checkboxes">
            <label class="filter-checkbox">
              <input type="checkbox" checked={visibleItemTypes.trip} on:change={(e) => { visibleItemTypes = { ...visibleItemTypes, trip: e.target.checked }; }} />
              <span class="checkbox-label">
                <span class="checkbox-color" style="background: #3b82f6;"></span>
                Trip
              </span>
            </label>
            <label class="filter-checkbox">
              <input type="checkbox" checked={visibleItemTypes.flight} on:change={(e) => { visibleItemTypes = { ...visibleItemTypes, flight: e.target.checked }; }} />
              <span class="checkbox-label">
                <span class="checkbox-color" style="background: #10b981;"></span>
                Flight
              </span>
            </label>
            <label class="filter-checkbox">
              <input type="checkbox" checked={visibleItemTypes.hotel} on:change={(e) => { visibleItemTypes = { ...visibleItemTypes, hotel: e.target.checked }; }} />
              <span class="checkbox-label">
                <span class="checkbox-color" style="background: #f59e0b;"></span>
                Hotel
              </span>
            </label>
            <label class="filter-checkbox">
              <input type="checkbox" checked={visibleItemTypes.transportation} on:change={(e) => { visibleItemTypes = { ...visibleItemTypes, transportation: e.target.checked }; }} />
              <span class="checkbox-label">
                <span class="checkbox-color" style="background: #8b5cf6;"></span>
                Transportation
              </span>
            </label>
            <label class="filter-checkbox">
              <input type="checkbox" checked={visibleItemTypes.car_rental} on:change={(e) => { visibleItemTypes = { ...visibleItemTypes, car_rental: e.target.checked }; }} />
              <span class="checkbox-label">
                <span class="checkbox-color" style="background: #ec4899;"></span>
                Car Rental
              </span>
            </label>
            <label class="filter-checkbox">
              <input type="checkbox" checked={visibleItemTypes.event} on:change={(e) => { visibleItemTypes = { ...visibleItemTypes, event: e.target.checked }; }} />
              <span class="checkbox-label">
                <span class="checkbox-color" style="background: #06b6d4;"></span>
                Event
              </span>
            </label>
          </div>
        </div>
      </PaneColumn>
      {/if}

      <!-- Calendar column -->
      <PaneColumn span={3} divider={showCalendarFilters}>
        <div class="calendar-toolbar">
          <button class="nav-square calendar-filter-toggle" on:click={() => showMobileFilterSheet = !showMobileFilterSheet} title="Toggle filters">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
          </button>
        </div>
        <CalendarView
          {trips}
          standaloneItems={[...standaloneItems, ...attendeeStandaloneItems]}
          {visibleItemTypes}
        />
      </PaneColumn>
    </ContentPane>

    <!-- Mobile filter bottom sheet -->
    {#if showMobileFilterSheet}
      <div class="filter-sheet-backdrop" on:click={() => showMobileFilterSheet = false}></div>
    {/if}
    <div class="filter-sheet" class:filter-sheet-open={showMobileFilterSheet}>
      <div class="filter-sheet-handle"></div>
      <div class="filter-sheet-header">
        <h3 class="pane-title" style="margin:0">Filters</h3>
        <button class="close-btn" on:click={() => showMobileFilterSheet = false}>✕</button>
      </div>
      <div class="filter-section">
        <h4 class="filter-section-title">Show on Calendar</h4>
        <div class="filter-checkboxes">
          <label class="filter-checkbox">
            <input type="checkbox" checked={visibleItemTypes.trip} on:change={(e) => { visibleItemTypes = { ...visibleItemTypes, trip: e.target.checked }; }} />
            <span class="checkbox-label"><span class="checkbox-color" style="background: #3b82f6;"></span>Trip</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" checked={visibleItemTypes.flight} on:change={(e) => { visibleItemTypes = { ...visibleItemTypes, flight: e.target.checked }; }} />
            <span class="checkbox-label"><span class="checkbox-color" style="background: #10b981;"></span>Flight</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" checked={visibleItemTypes.hotel} on:change={(e) => { visibleItemTypes = { ...visibleItemTypes, hotel: e.target.checked }; }} />
            <span class="checkbox-label"><span class="checkbox-color" style="background: #f59e0b;"></span>Hotel</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" checked={visibleItemTypes.transportation} on:change={(e) => { visibleItemTypes = { ...visibleItemTypes, transportation: e.target.checked }; }} />
            <span class="checkbox-label"><span class="checkbox-color" style="background: #8b5cf6;"></span>Transportation</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" checked={visibleItemTypes.car_rental} on:change={(e) => { visibleItemTypes = { ...visibleItemTypes, car_rental: e.target.checked }; }} />
            <span class="checkbox-label"><span class="checkbox-color" style="background: #ec4899;"></span>Car Rental</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" checked={visibleItemTypes.event} on:change={(e) => { visibleItemTypes = { ...visibleItemTypes, event: e.target.checked }; }} />
            <span class="checkbox-label"><span class="checkbox-color" style="background: #06b6d4;"></span>Event</span>
          </label>
        </div>
      </div>
    </div>
  {/if}

  {#if activePane === 'settings'}
    <ContentPane columns={activeSettingsSection === 'data' && importData ? 4 : activeSettingsSection === 'companions' ? ((addingCompanion || editingCompanion) ? 4 : 3) : activeSettingsSection ? 2 : 1}>
      <PaneColumn span={1}>
        <h3 class="pane-title">Settings</h3>

        <div class="settings-menu">
          <div class="settings-section">
            <h4 class="settings-section-title">Account</h4>
            <button class="settings-option" class:active={activeSettingsSection === 'profile'} on:click={() => activeSettingsSection = 'profile'}>
              <div class="settings-option-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div class="settings-option-content">
                <span class="settings-option-label">Profile</span>
                <span class="settings-option-description">Manage your personal information</span>
              </div>
              <svg class="settings-option-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>

            <button class="settings-option" class:active={activeSettingsSection === 'security'} on:click={() => activeSettingsSection = 'security'}>
              <div class="settings-option-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <div class="settings-option-content">
                <span class="settings-option-label">Password & Security</span>
                <span class="settings-option-description">Update your password</span>
              </div>
              <svg class="settings-option-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

          <div class="settings-section">
            <h4 class="settings-section-title">Social</h4>
            <button class="settings-option" class:active={activeSettingsSection === 'companions'} on:click={() => activeSettingsSection = 'companions'}>
              <div class="settings-option-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div class="settings-option-content">
                <span class="settings-option-label">Travel Companions</span>
                <span class="settings-option-description">Manage your travel companions</span>
              </div>
              <svg class="settings-option-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

          <div class="settings-section">
            <h4 class="settings-section-title">Data</h4>
            <button class="settings-option" class:active={activeSettingsSection === 'data'} on:click={() => { activeSettingsSection = 'data'; importResult = null; }}>
              <div class="settings-option-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/>
                  <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                  <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
              </div>
              <div class="settings-option-content">
                <span class="settings-option-label">Manage Data</span>
                <span class="settings-option-description">Export or import your trips and items</span>
              </div>
              <svg class="settings-option-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>

          <div class="settings-section">
            <button class="settings-option settings-option--danger" on:click={handleLogout}>
              <div class="settings-option-icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </div>
              <div class="settings-option-content">
                <span class="settings-option-label">Sign Out</span>
                <span class="settings-option-description">Log out of your account</span>
              </div>
            </button>
          </div>
        </div>
      </PaneColumn>

      {#if activeSettingsSection === 'companions'}
        <PaneColumn span={2} divider={true}>
          <div class="edit-header">
            <h3 class="pane-title">Travel Companions</h3>
            <button class="close-button" on:click={() => { activeSettingsSection = null; closeEditCompanion(); }} aria-label="Close">×</button>
          </div>

          <!-- Companion table -->
          {#if companionsLoading}
            <p class="companions-empty">Loading...</p>
          {:else if companions.length === 0}
            <p class="companions-empty">No companions yet.
              <button class="companions-add-inline-btn" on:click={() => { addingCompanion = true; closeEditCompanion(); }}>+ Add one</button>
            </p>
          {:else}
            <div class="companions-table-wrapper">
              <table class="companions-table">
                <thead>
                  <tr>
                    <th class="col-identity">Name / Contact</th>
                    <th class="col-perm" title="I share my travel with them">
                      <span class="perm-header-cell">
                        <span class="perm-arrow perm-arrow-out">→</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="perm-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </span>
                    </th>
                    <th class="col-perm" title="They can manage my travel">
                      <span class="perm-header-cell">
                        <span class="perm-arrow perm-arrow-out">→</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="perm-icon"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </span>
                    </th>
                    <th class="col-perm col-perm-divider" title="They share their travel with me">
                      <span class="perm-header-cell">
                        <span class="perm-arrow perm-arrow-in">←</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="perm-icon"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      </span>
                    </th>
                    <th class="col-perm" title="I can manage their travel">
                      <span class="perm-header-cell">
                        <span class="perm-arrow perm-arrow-in">←</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="perm-icon"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </span>
                    </th>
                    <th class="col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each companions as companion}
                    <tr class="companion-row" class:selected={editingCompanion?.id === companion.id}>
                      <td class="col-identity">
                        <div class="companion-identity">
                          <div class="companion-avatar">
                            {companion.companionUser.firstName[0]}{companion.companionUser.lastName[0]}
                          </div>
                          <div class="companion-info">
                            <span class="companion-name">{companion.companionUser.firstName} {companion.companionUser.lastName}.</span>
                            <span class="companion-email">{companion.companionUser.email ?? companion.companionUser.phone ?? ''}</span>
                          </div>
                        </div>
                      </td>
                      <td class="col-perm">
                        <span class="perm-dot" class:active={companion.permissionLevel === 'view' || companion.permissionLevel === 'manage_all'} title={companion.permissionLevel === 'view' || companion.permissionLevel === 'manage_all' ? 'Yes' : 'No'}></span>
                      </td>
                      <td class="col-perm">
                        <span class="perm-dot" class:active={companion.permissionLevel === 'manage_all'} title={companion.permissionLevel === 'manage_all' ? 'Yes' : 'No'}></span>
                      </td>
                      <td class="col-perm col-perm-divider">
                        <span class="perm-dot" class:active={companion.reversePermissionLevel === 'view' || companion.reversePermissionLevel === 'manage_all'} title={companion.reversePermissionLevel === 'view' || companion.reversePermissionLevel === 'manage_all' ? 'Yes' : 'No'}></span>
                      </td>
                      <td class="col-perm">
                        <span class="perm-dot" class:active={companion.reversePermissionLevel === 'manage_all'} title={companion.reversePermissionLevel === 'manage_all' ? 'Yes' : 'No'}></span>
                      </td>
                      <td class="col-actions">
                        <button
                          class="companion-edit-btn"
                          class:active={editingCompanion?.id === companion.id}
                          on:click={() => openEditCompanion(companion)}
                          aria-label="Edit companion"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="6" class="companions-table-footer">
                      <button class="companions-add-inline-btn" on:click={() => { addingCompanion = !addingCompanion; closeEditCompanion(); addCompanionError = ''; addCompanionEmail = ''; }}>
                        {addingCompanion ? '− Cancel' : '+ Add New'}
                      </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          {/if}
        </PaneColumn>

        {#if addingCompanion}
          <PaneColumn span={1} divider={true}>
            <div class="edit-header">
              <h3 class="pane-title">Add Companion</h3>
              <button class="close-button" on:click={() => { addingCompanion = false; addCompanionEmail = ''; addCompanionError = ''; }} aria-label="Close">×</button>
            </div>
            <form class="edit-form companion-add-form" on:submit|preventDefault={handleAddCompanion}>
              <div class="form-group">
                <label for="companion-email">Email or Phone Number</label>
                <div class="companions-email-field">
                  <input
                    type="text"
                    id="companion-email"
                    bind:value={addCompanionEmail}
                    on:input={onCompanionIdentifierInput}
                    on:blur={dismissCompanionSuggestions}
                    placeholder="Name, email, or phone"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                    required
                  />
                  {#if companionLookupLoading}
                    <span class="companions-lookup-spinner">…</span>
                  {/if}
                  {#if companionSuggestions.length > 0}
                    <ul class="attendee-suggestions">
                      {#each companionSuggestions as u (u.id)}
                        <li>
                          <button type="button" class="attendee-suggestion-item" on:mousedown={() => selectCompanionSuggestion(u)}>
                            <span class="suggestion-name">{u.firstName || ''} {u.lastName || ''}</span>
                            <span class="suggestion-email">{u.email || u.phone || ''}</span>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                </div>
              </div>
              <div class="form-row">
                <div class="form-group form-group--60">
                  <label for="companion-first-name">First Name</label>
                  <input
                    type="text"
                    id="companion-first-name"
                    bind:value={addCompanionFirstName}
                    placeholder="First name"
                    required
                  />
                </div>
                <div class="form-group form-group--40">
                  <label for="companion-last-initial">Last Initial</label>
                  <input
                    type="text"
                    id="companion-last-initial"
                    bind:value={addCompanionLastName}
                    placeholder="e.g. S"
                    maxlength="1"
                    required
                  />
                </div>
              </div>
              {#if addCompanionError}
                <p class="companions-error">{addCompanionError}</p>
              {/if}
              <div class="form-actions">
                <button type="button" class="btn-secondary" on:click={() => { addingCompanion = false; addCompanionEmail = ''; addCompanionFirstName = ''; addCompanionLastName = ''; addCompanionError = ''; }}>Cancel</button>
                <button type="submit" class="btn-primary">Update</button>
              </div>
            </form>
          </PaneColumn>
        {:else if editingCompanion}
          <PaneColumn span={1} divider={true}>
            <div class="edit-header">
              <h3 class="pane-title">Edit Companion</h3>
              <button class="close-button" on:click={closeEditCompanion} aria-label="Close">×</button>
            </div>
            <div class="companion-edit-identity">
              <div class="companion-avatar companion-avatar-lg">
                {editingCompanion.companionUser.firstName[0]}{editingCompanion.companionUser.lastName[0]}
              </div>
              <div class="companion-info">
                <span class="companion-name">{editingCompanion.companionUser.firstName} {editingCompanion.companionUser.lastName}.</span>
                <span class="companion-email">{editingCompanion.companionUser.email ?? editingCompanion.companionUser.phone ?? ''}</span>
              </div>
            </div>
            <form class="edit-form" on:submit|preventDefault={handleSaveEditCompanion}>
              <div class="form-group">
                <label for="edit-companion-permission">My permission level for them</label>
                <select id="edit-companion-permission" bind:value={editCompanionPermission} class="edit-companion-select">
                  <option value="none">No access — they cannot see my travel</option>
                  <option value="view">Can view — they can see my travel</option>
                  <option value="manage_all">Can manage — they can edit my travel</option>
                </select>
              </div>
              {#if editCompanionError}
                <p class="companions-error">{editCompanionError}</p>
              {/if}
              <div class="form-actions">
                <button type="button" class="btn-secondary" on:click={closeEditCompanion}>Cancel</button>
                <button type="submit" class="btn-primary">Update</button>
              </div>
              <div class="form-actions-remove">
                <button
                  type="button"
                  class="btn-danger-outline"
                  on:click={() => handleRemoveCompanion(editingCompanion.companionUser.id)}
                >Remove</button>
              </div>
            </form>
          </PaneColumn>
        {/if}

      {:else if activeSettingsSection === 'data'}
        <PaneColumn span={1} divider={true}>
          <div class="edit-header">
            <h3 class="pane-title">Manage Data</h3>
            <button class="close-button" on:click={() => { activeSettingsSection = null; importData = null; importCompanions = []; importSelections = {}; importResult = null; importFileError = ''; }} aria-label="Close">×</button>
          </div>

          <!-- Export section -->
          <div class="manage-data-section">
            <h4 class="manage-data-section-title">Export Data</h4>
            <p class="settings-export-description">Download a copy of all your travel data including trips, flights, hotels, and other items.</p>
            <div class="form-group">
              <button type="button" class="btn-primary" on:click={handleExportData}>Download</button>
            </div>
          </div>

          <!-- Import section -->
          <div class="manage-data-section">
            <h4 class="manage-data-section-title">Import Data</h4>
            <p class="settings-export-description">Select a previously exported JSON file to import your trips and items.</p>

            <div class="form-group">
              <input
                type="file"
                id="import-file-input"
                accept=".json,application/json"
                style="display:none"
                on:change={handleImportFileChange}
              />
              <div
                class="import-drop-zone"
                class:import-drop-zone--active={importDragOver}
                class:import-drop-zone--disabled={importLoading}
                role="button"
                tabindex="0"
                on:click={() => !importLoading && document.getElementById('import-file-input').click()}
                on:keydown={(e) => e.key === 'Enter' && !importLoading && document.getElementById('import-file-input').click()}
                on:dragover={(e) => { e.preventDefault(); importDragOver = true; }}
                on:dragleave={() => importDragOver = false}
                on:drop={handleImportDrop}
              >
                <svg class="import-drop-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span class="import-drop-label">
                  {importLoading ? 'Loading...' : 'Drop file here or click to choose'}
                </span>
              </div>
            </div>

            {#if importFileError}
              <p class="companions-error">{importFileError}</p>
            {/if}

            {#if importData && importSummary}
              <div class="import-summary">
                <p class="import-summary-text">
                  <strong>{importSummary.trips}</strong> trip{importSummary.trips !== 1 ? 's' : ''},
                  <strong>{importSummary.items}</strong> item{importSummary.items !== 1 ? 's' : ''}
                  {#if importSummary.vouchers > 0}, <strong>{importSummary.vouchers}</strong> voucher{importSummary.vouchers !== 1 ? 's' : ''}{/if}
                  found
                  {#if importSummary.dups > 0}
                    — <span class="import-dup-count">{importSummary.dups} possible duplicate{importSummary.dups !== 1 ? 's' : ''} detected</span>
                  {/if}
                </p>
                <p class="import-selected-count">{importSelectedCount} selected for import</p>
              </div>

              {#if importResult}
                <div class="import-result" class:import-result--success={importResult.imported > 0} class:import-result--neutral={importResult.imported === 0}>
                  <p>Imported <strong>{importResult.imported}</strong>, skipped <strong>{importResult.skipped}</strong>.</p>
                  {#if importResult.errors?.length > 0}
                    <p class="import-result-errors">{importResult.errors.length} error{importResult.errors.length !== 1 ? 's' : ''} occurred.</p>
                  {/if}
                </div>
              {/if}

              <div class="form-actions">
                <button type="button" class="btn-secondary" on:click={() => { importData = null; importCompanions = []; importSelections = {}; importResult = null; importFileError = ''; }}>Clear</button>
                <button
                  type="button"
                  class="btn-primary"
                  on:click={handleExecuteImport}
                  disabled={importSubmitting || importSelectedCount === 0}
                >
                  {importSubmitting ? 'Importing...' : 'Import Selected'}
                </button>
              </div>
            {/if}
          </div>
        </PaneColumn>

        <!-- Col 3-4: Review list -->
        {#if importData}
          <PaneColumn span={2} divider={true}>
            <div class="import-review-header">
              <h3 class="pane-title">Review</h3>
              <div class="import-select-controls">
                <button type="button" class="import-select-btn" on:click={() => {
                  const next = {};
                  for (const k of Object.keys(importSelections)) next[k] = true;
                  importSelections = next;
                }}>Select All</button>
                <button type="button" class="import-select-btn" on:click={() => {
                  const next = {};
                  for (const k of Object.keys(importSelections)) next[k] = false;
                  importSelections = next;
                }}>Deselect All</button>
              </div>
            </div>

            <div class="import-review-list">
              {#each [...importData.trips].sort((a, b) => (a.departureDate ?? '').localeCompare(b.departureDate ?? '')) as trip (trip._importIndex)}
                {@const tripKey = `trip:${trip._importIndex}`}
                {@const tripItems = [
                  ...(trip.flights ?? []).map(i => ({ ...i, _itemType: 'flights', _label: 'Flight' })),
                  ...(trip.hotels ?? []).map(i => ({ ...i, _itemType: 'hotels', _label: 'Hotel' })),
                  ...(trip.transportation ?? []).map(i => ({ ...i, _itemType: 'transportation', _label: 'Transport' })),
                  ...(trip.carRentals ?? []).map(i => ({ ...i, _itemType: 'carRentals', _label: 'Car Rental' })),
                  ...(trip.events ?? []).map(i => ({ ...i, _itemType: 'events', _label: 'Event' })),
                ].sort((a, b) => {
                  const da = a.departureDateTime ?? a.checkInDateTime ?? a.startDateTime ?? a.pickupDateTime ?? '';
                  const db = b.departureDateTime ?? b.checkInDateTime ?? b.startDateTime ?? b.pickupDateTime ?? '';
                  return da.localeCompare(db);
                })}
                <div class="import-trip-block">
                  <label class="import-row import-row--trip">
                    <input type="checkbox" checked={importSelections[tripKey]} on:change={(e) => {
                      const next = { ...importSelections, [tripKey]: e.target.checked };
                      for (const i of tripItems) next[`${i._itemType}:${trip._importIndex}:${i._importIndex}`] = e.target.checked;
                      importSelections = next;
                    }} />
                    <span class="import-row-name">{trip.name || 'Unnamed Trip'}</span>
                    {#if trip.departureDate}
                      <span class="import-row-meta">{trip.departureDate}{trip.returnDate ? ` → ${trip.returnDate}` : ''}</span>
                    {/if}
                    {#if trip.isDuplicate}
                      <span class="import-dup-badge">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="import-dup-icon"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        Possible duplicate
                      </span>
                    {/if}
                  </label>

                  {#each tripItems as item (item._importIndex + item._itemType)}
                    {@const itemKey = `${item._itemType}:${trip._importIndex}:${item._importIndex}`}
                    {@const itemDate = (item.departureDateTime ?? item.checkInDateTime ?? item.startDateTime ?? item.pickupDateTime)?.slice(0, 10)}
                    <label class="import-row import-row--item">
                      <input type="checkbox" bind:checked={importSelections[itemKey]} />
                      <span class="import-row-type-badge">{item._label}</span>
                      <span class="import-row-name">
                        {item.flightNumber ?? item.hotelName ?? item.name ?? item.pickupLocation ?? item.method ?? 'Item'}
                        {#if (item._itemType === 'flights' || item._itemType === 'transportation') && (item.origin || item.destination)}
                          <span class="import-row-route">{item.origin ?? '?'} → {item.destination ?? '?'}</span>
                        {/if}
                      </span>
                      {#if itemDate}
                        <span class="import-row-meta">{itemDate}</span>
                      {/if}
                      {#if item.isDuplicate}
                        <span class="import-dup-badge">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="import-dup-icon"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          Possible duplicate
                        </span>
                      {/if}
                    </label>
                  {/each}
                </div>
              {/each}

              {#if importData.standalone}
                {@const standaloneTypeMap = [['flights', 'Flight'], ['hotels', 'Hotel'], ['transportation', 'Transport'], ['carRentals', 'Car Rental'], ['events', 'Event']]}
                {@const allStandaloneItems = standaloneTypeMap.flatMap(([type, label]) =>
                  (importData.standalone[type] ?? []).map(i => ({ ...i, _itemType: type, _label: label }))
                ).sort((a, b) => {
                  const da = a.departureDateTime ?? a.checkInDateTime ?? a.startDateTime ?? a.pickupDateTime ?? '';
                  const db = b.departureDateTime ?? b.checkInDateTime ?? b.startDateTime ?? b.pickupDateTime ?? '';
                  return da.localeCompare(db);
                })}
                {#if allStandaloneItems.length > 0}
                  <div class="import-trip-block">
                    <div class="import-row import-row--section-header">Standalone Items</div>
                    {#each allStandaloneItems as item (item._importIndex + item._itemType)}
                      {@const itemKey = `standalone:${item._itemType}:${item._importIndex}`}
                      {@const itemDate = (item.departureDateTime ?? item.checkInDateTime ?? item.startDateTime ?? item.pickupDateTime)?.slice(0, 10)}
                      <label class="import-row import-row--item">
                        <input type="checkbox" bind:checked={importSelections[itemKey]} />
                        <span class="import-row-type-badge">{item._label}</span>
                        <span class="import-row-name">
                          {item.flightNumber ?? item.hotelName ?? item.name ?? item.pickupLocation ?? item.method ?? 'Item'}
                          {#if (item._itemType === 'flights' || item._itemType === 'transportation') && (item.origin || item.destination)}
                            <span class="import-row-route">{item.origin ?? '?'} → {item.destination ?? '?'}</span>
                          {/if}
                        </span>
                        {#if itemDate}
                          <span class="import-row-meta">{itemDate}</span>
                        {/if}
                        {#if item.isDuplicate}
                          <span class="import-dup-badge">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="import-dup-icon"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                            Possible duplicate
                          </span>
                        {/if}
                      </label>
                    {/each}
                  </div>
                {/if}
              {/if}

              {#if importData.vouchers?.length > 0}
                <div class="import-trip-block">
                  <div class="import-row import-row--section-header">Vouchers</div>
                  {#each importData.vouchers as v (v._importIndex)}
                    {@const vKey = `voucher:${v._importIndex}`}
                    <label class="import-row import-row--item">
                      <input type="checkbox" bind:checked={importSelections[vKey]} />
                      <span class="import-row-type-badge">{v.type}</span>
                      <span class="import-row-name">{v.issuer} — {v.voucherNumber}</span>
                      {#if v.expirationDate}
                        <span class="import-row-meta">{v.expirationDate.slice(0, 10)}</span>
                      {/if}
                      {#if v.isDuplicate}
                        <span class="import-dup-badge">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="import-dup-icon"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          Possible duplicate
                        </span>
                      {/if}
                    </label>
                  {/each}
                </div>
              {/if}
            </div>
          </PaneColumn>
        {/if}

      {:else if activeSettingsSection}
        <PaneColumn span={1} divider={true}>
          <div class="edit-header">
            <h3 class="pane-title">
              {#if activeSettingsSection === 'profile'}Profile
              {:else if activeSettingsSection === 'security'}Password & Security
              {/if}
            </h3>
            <button class="close-button" on:click={() => activeSettingsSection = null} aria-label="Close">×</button>
          </div>

          {#if activeSettingsSection === 'profile'}
            <form class="edit-form" on:submit={handleSaveProfile}>
              <div class="form-row">
                <div class="form-group form-group--60">
                  <label for="settings-first-name">First Name</label>
                  <input type="text" id="settings-first-name" bind:value={profileForm.firstName} placeholder="Your first name" />
                </div>
                <div class="form-group form-group--40">
                  <label for="settings-last-name">Last Initial</label>
                  <input type="text" id="settings-last-name" bind:value={profileForm.lastName} placeholder="e.g. S" maxlength="1" />
                </div>
              </div>
              <div class="form-group">
                <label for="settings-email">Email</label>
                <input type="email" id="settings-email" bind:value={profileForm.email} placeholder="you@example.com" disabled />
              </div>
              <div class="form-group">
                <label for="settings-phone">Phone Number</label>
                <PhoneInput
                  id="settings-phone"
                  value={profileForm.phone}
                  onChangeNumber={(num) => { profileForm.phone = num; }}
                />
              </div>
              {#if profileSaveError}
                <p class="companions-error">{profileSaveError}</p>
              {/if}
              {#if profileSaveSuccess}
                <p class="profile-save-success">Profile saved.</p>
              {/if}
              <div class="form-actions">
                <button type="button" class="btn-secondary" on:click={() => activeSettingsSection = null}>Cancel</button>
                <button type="submit" class="btn-primary">Update</button>
              </div>
            </form>

          {:else if activeSettingsSection === 'security'}
            <form class="edit-form">
              <div class="form-group">
                <label for="settings-current-password">Current Password</label>
                <input type="password" id="settings-current-password" placeholder="Enter current password" />
              </div>
              <div class="form-group">
                <label for="settings-new-password">New Password</label>
                <input type="password" id="settings-new-password" placeholder="Enter new password" />
              </div>
              <div class="form-group">
                <label for="settings-confirm-password">Confirm New Password</label>
                <input type="password" id="settings-confirm-password" placeholder="Confirm new password" />
              </div>
              <div class="form-actions">
                <button type="button" class="btn-secondary" on:click={() => activeSettingsSection = null}>Cancel</button>
                <button type="submit" class="btn-primary">Update</button>
              </div>
            </form>

          {/if}

        </PaneColumn>
      {/if}
    </ContentPane>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  .dashboard-root {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
  }

  .map-container {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
  }

  @media (max-width: 640px) {
    .map-container {
      height: 30vh;
      bottom: auto;
    }
  }


  .side-nav {
    position: absolute;
    top: 2.5vh;
    left: 2.5vh;
    display: flex;
    flex-direction: column;
    gap: 2vh;
    z-index: var(--z-modal-backdrop);
  }

  .nav-square {
    width: 50px;
    height: 50px;
    border-radius: var(--radius-md);
    background: var(--glass-bg-medium);
    backdrop-filter: var(--blur-md);
    -webkit-backdrop-filter: var(--blur-sm);
    border: 1px solid var(--glass-border);
    box-shadow: var(--shadow-xl);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast), color var(--transition-fast);
    padding: 0;
    color: var(--gray-dark);
  }

  .nav-square svg {
    width: 22px;
    height: 22px;
  }

  .nav-square:hover {
    background: var(--white);
    transform: scale(1.08);
    box-shadow: var(--shadow-2xl);
    color: var(--primary-color);
  }

  .nav-square:active {
    transform: scale(0.96);
  }

  .nav-square.active {
    background: var(--glass-bg-heavy);
    color: var(--primary-color);
    border-color: var(--primary-light);
  }

  .filter-section {
    margin-top: var(--spacing-lg);
  }

  .calendar-toolbar {
    display: none;
    margin-bottom: var(--spacing-md);
  }

  @media (max-width: 640px) {
    .calendar-toolbar {
      display: flex;
      align-items: center;
    }
  }

  .calendar-filter-toggle {
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
  }

  .calendar-filter-toggle svg {
    width: 16px;
    height: 16px;
  }

  /* Filter bottom sheet — mobile only */
  .filter-sheet,
  .edit-sheet {
    display: none;
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
      /* Prevent horizontal overflow */
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

    /* Normalize date inputs to match text inputs on iOS */
    input[type="date"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      min-height: 44px;
      height: 44px;
      padding: var(--spacing-sm) var(--spacing-md);
      font-size: 16px;
      line-height: 1.6;
      border: 1px solid var(--glass-border-dark);
      border-radius: var(--radius-md);
      background: var(--glass-bg-medium);
      color: var(--dark-text);
      font-family: inherit;
      box-sizing: border-box;
    }
  }

  @media (max-width: 640px) {
    .filter-sheet-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
      z-index: calc(var(--z-modal) - 1);
    }

    .filter-sheet {
      display: block;
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: var(--z-modal);
      background: var(--white);
      border-radius: var(--radius-xl) var(--radius-xl) 0 0;
      padding: var(--spacing-lg) var(--spacing-2xl) var(--spacing-4xl);
      box-shadow: var(--shadow-top);
      transform: translateY(100%);
      transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
    }

    .filter-sheet.filter-sheet-open {
      transform: translateY(0);
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

  .filter-section-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--dark-text);
    margin: 0 0 var(--spacing-md) 0;
  }

  .filter-checkboxes {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .filter-checkbox {
    display: flex;
    align-items: center;
    cursor: pointer;
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    transition: background-color 0.2s;
  }

  .filter-checkbox:hover {
    background: var(--glass-bg-light);
  }

  .filter-checkbox input[type="checkbox"] {
    width: 18px;
    height: 18px;
    margin-right: var(--spacing-sm);
    cursor: pointer;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--dark-text);
  }

  .checkbox-color {
    width: 16px;
    height: 16px;
    border-radius: var(--radius-sm);
  }

  .edit-header {
    display: flex;
    justify-content: space-between;
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

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .pane-title {
    margin: 0 0 var(--spacing-md) 0;
    font-weight: 600;
    color: var(--dark-text);
    letter-spacing: 0.01em;
  }

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

  .pane-empty {
    font-size: 0.875rem;
    color: var(--gray-text);
  }

  .timeline-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    transition: all 0.3s ease-in-out;
  }

  .trip-card,
  .timeline-item {
    background: var(--glass-bg-medium);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-border-dark);
    transition: all 0.3s ease-in-out;
  }

  .trip-card {
    overflow: hidden;
    padding: var(--spacing-xs);
  }

  .trip-card:hover,
  .timeline-item:hover {
    border-color: var(--primary-light);
    box-shadow: var(--shadow-md);
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

  .trip-card.selected {
    background: var(--indigo-50);
    border-color: var(--indigo-200);
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
    padding: 0 var(--spacing-md) var(--spacing-xs);
    font-size: 0.75rem;
    color: var(--gray-light);
    font-style: italic;
  }

  .item-owner {
    font-style: italic;
    color: var(--gray-light);
  }

  .month-header {
    font-size: 0.8rem;
    font-weight: 700;
    font-style: oblique;
    text-transform: uppercase;
    letter-spacing: .2em;
    color: var(--primary-color);
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
    background-image: repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 6px,
      rgba(0, 0, 0, 0.04) 6px,
      rgba(0, 0, 0, 0.04) 8px
    );
  }

  .timeline-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-md);
    cursor: pointer;
  }

  .timeline-item:hover {
    background: var(--white);
  }

  .timeline-item.selected {
    background: var(--white);
    border-color: var(--primary-color);
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

  .item-icon-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    width: 36px;
  }

  .item-flight-time {
    font-size: 0.6rem;
    font-weight: 600;
    color: var(--gray-text);
    line-height: 1;
    letter-spacing: 0.03em;
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

  .item-type {
    font-size: 0.7rem;
    color: var(--gray-text);
    text-transform: capitalize;
  }

  .item-datetime {
    font-size: 0.7rem;
    color: var(--gray-light);
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

  .item-datetime::before {
    content: none;
  }

  .trip-header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-xs);
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

  .attendee-badges .attendee-badge:not(:first-child) {
    margin-left: 0;
  }

  /* Add New Menu */
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

  /* Settings Menu */
  .settings-menu {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xl);
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .settings-section-title {
    margin: 0 0 var(--spacing-xs) 0;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--gray-text);
  }

  .settings-option {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md) var(--spacing-lg);
    background: var(--glass-bg-medium);
    border: 1px solid var(--glass-border-dark);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
    width: 100%;
  }

  .settings-option:hover {
    background: var(--white);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
    border-color: var(--primary-light);
  }

  .settings-option:active {
    transform: translateY(0);
  }

  .settings-option--danger:hover {
    border-color: #ef4444;
    color: #ef4444;
  }

  .settings-option--danger:hover .settings-option-icon {
    background: #fee2e2;
    color: #ef4444;
  }

  .settings-option--danger:hover .settings-option-label {
    color: #ef4444;
  }

  .settings-option-icon {
    width: 36px;
    height: 36px;
    min-width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--glass-bg-heavy);
    border-radius: var(--radius-md);
    color: var(--gray-dark);
  }

  .settings-option-icon svg {
    width: 18px;
    height: 18px;
  }

  .settings-option-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .settings-option-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--dark-text);
    transition: color var(--transition-fast);
  }

  .settings-option-description {
    font-size: 0.72rem;
    color: var(--gray-text);
  }

  .settings-option-arrow {
    width: 16px;
    height: 16px;
    color: var(--gray-text);
    flex-shrink: 0;
  }

  .settings-option.active {
    background: var(--white);
    border-color: var(--primary-light);
  }

  .settings-option.active .settings-option-label {
    color: var(--primary-color);
  }

  .settings-radio-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .settings-radio {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--dark-text);
  }

  .settings-toggle-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .settings-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md);
    background: var(--glass-bg-medium);
    border: 1px solid var(--glass-border-dark);
    border-radius: var(--radius-md);
  }

  .settings-toggle-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .settings-toggle-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--dark-text);
  }

  .settings-toggle-description {
    font-size: 0.72rem;
    color: var(--gray-text);
  }

  .settings-export-description {
    font-size: 0.85rem;
    color: var(--gray-text);
    margin: 0 0 var(--spacing-sm) 0;
    line-height: 1.5;
  }

  /* Manage Data Panel */
  .manage-data-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding-bottom: var(--spacing-xl);
    border-bottom: 1px solid var(--glass-border);
    margin-bottom: var(--spacing-xl);
  }

  .manage-data-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }

  .manage-data-section-title {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--gray-text);
    margin: 0;
  }

  /* Import Panel */
  .import-drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-lg) var(--spacing-md);
    background: var(--glass-bg-light);
    border: 2.5px dotted var(--glass-border-dark);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
    box-sizing: border-box;
  }

  .import-drop-zone:hover,
  .import-drop-zone--active {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 5%, transparent);
    color: var(--primary-color);
  }

  .import-drop-zone--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .import-drop-icon {
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
  }

  .import-drop-label {
    font-size: 0.85rem;
  }

  .import-summary {
    padding: var(--spacing-md);
    background: var(--glass-bg-light);
    border-radius: var(--radius-md);
    border: 1px solid var(--glass-border);
  }

  .import-summary-text {
    font-size: 0.85rem;
    color: var(--dark-text);
    margin: 0 0 var(--spacing-xs) 0;
  }

  .import-dup-count {
    color: #b45309;
  }

  .import-selected-count {
    font-size: 0.8rem;
    color: var(--gray-text);
    margin: 0;
  }

  .import-result {
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
  }

  .import-result p {
    margin: 0 0 var(--spacing-xs) 0;
  }

  .import-result p:last-child {
    margin: 0;
  }

  .import-result--success {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }

  .import-result--neutral {
    background: var(--glass-bg-light);
    border: 1px solid var(--glass-border);
    color: var(--gray-text);
  }

  .import-result-errors {
    color: var(--danger-color, #dc2626);
  }

  /* Import Review List */
  .import-review-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-md);
  }

  .import-review-header .pane-title {
    margin: 0;
  }

  .import-select-controls {
    display: flex;
    gap: var(--spacing-sm);
  }

  .import-select-btn {
    background: none;
    border: 1px solid var(--glass-border-dark);
    border-radius: var(--radius-sm);
    padding: 2px var(--spacing-sm);
    font-size: 0.75rem;
    color: var(--gray-text);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .import-select-btn:hover {
    background: var(--glass-bg-medium);
    color: var(--dark-text);
  }

  .import-review-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    overflow-y: auto;
    max-height: calc(100% - 60px);
  }

  .import-trip-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .import-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.85rem;
    transition: background var(--transition-fast);
  }

  .import-row:hover {
    background: var(--glass-bg-light);
  }

  .import-row input[type="checkbox"] {
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    cursor: pointer;
  }

  .import-row--trip {
    font-weight: 600;
    color: var(--dark-text);
    border-left: 3px solid var(--primary-color);
    padding-left: var(--spacing-sm);
  }

  .import-row--item {
    padding-left: calc(var(--spacing-sm) + 12px);
    color: var(--gray-text);
    border-left: 3px solid transparent;
  }

  .import-row-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .import-row-meta {
    font-size: 0.75rem;
    color: var(--gray-text);
    white-space: nowrap;
  }

  .import-row-route {
    font-size: 0.75rem;
    color: var(--gray-text);
    margin-left: 4px;
  }

  .import-row--section-header {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--gray-text);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: var(--spacing-xs) var(--spacing-sm);
    cursor: default;
  }

  .import-row--section-header:hover {
    background: none;
  }

  .import-row-type-badge {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--primary-color);
    background: var(--primary-bg-light, rgba(99, 102, 241, 0.1));
    border-radius: var(--radius-sm);
    padding: 1px 5px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .import-dup-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 0.7rem;
    font-weight: 600;
    color: #b45309;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: var(--radius-sm);
    padding: 1px 6px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .import-dup-icon {
    width: 11px;
    height: 11px;
  }

  /* Companions Panel */
  .edit-header-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .companions-table-footer {
    padding: var(--spacing-xs) var(--spacing-sm);
    border-top: 1px solid var(--glass-border-dark);
  }

  .companions-add-inline-btn {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.78rem;
    color: var(--primary-color);
    cursor: pointer;
    font-weight: 500;
  }

  .companions-add-inline-btn:hover {
    text-decoration: underline;
  }

  .companions-email-field {
    position: relative;
  }

  .companions-email-field input {
    width: 100%;
    box-sizing: border-box;
  }

  .companions-lookup-spinner {
    position: absolute;
    right: var(--spacing-md);
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.85rem;
    color: var(--gray-text);
    pointer-events: none;
  }

  .companions-error {
    margin: var(--spacing-sm) 0 0 0;
    font-size: 0.8rem;
    color: #ef4444;
  }

  .companion-add-form .form-row {
    flex-wrap: wrap;
  }

  .companion-add-form .form-group--60,
  .companion-add-form .form-group--40 {
    flex-grow: 1;
    min-width: 100px;
  }

  .companion-add-form .form-actions {
    flex-wrap: wrap;
  }

  .profile-save-success {
    margin: var(--spacing-sm) 0 0 0;
    font-size: 0.8rem;
    color: #22c55e;
  }

  .companions-empty {
    font-size: 0.85rem;
    color: var(--gray-text);
    margin: 0;
  }

  /* Companions table */
  .companions-table-wrapper {
    overflow-x: auto;
  }

  .companions-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.82rem;
  }

  .companions-table thead th {
    padding: var(--spacing-xs) var(--spacing-sm);
    text-align: left;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--gray-text);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--glass-border-dark);
    white-space: nowrap;
  }

  .companions-table thead th.col-perm {
    text-align: center;
    padding-left: var(--spacing-xs);
    padding-right: var(--spacing-xs);
  }

  .col-perm-divider {
    border-left: 1px solid var(--glass-border-dark);
  }

  .companions-table tbody .companion-row td.col-perm-divider {
    border-left: 1px solid var(--glass-border-dark);
  }

  .perm-header-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .perm-arrow {
    font-size: 0.6rem;
    line-height: 1;
    font-weight: 700;
  }

  .perm-arrow-out {
    color: var(--primary-color);
  }

  .perm-arrow-in {
    color: var(--gray-text);
  }

  .perm-icon {
    width: 11px;
    height: 11px;
    display: block;
  }

  .companions-table tbody .companion-row td {
    padding: var(--spacing-sm) var(--spacing-sm);
    border-bottom: 1px solid var(--glass-border-dark);
    vertical-align: middle;
  }

  .companions-table tbody .companion-row:last-child td {
    border-bottom: none;
  }

  .companions-table tbody .companion-row {
    transition: background var(--transition-fast);
  }

  .companions-table tbody .companion-row:hover {
    background: var(--glass-bg-medium);
  }

  .companions-table tbody .companion-row.selected {
    background: color-mix(in srgb, var(--primary-color) 6%, transparent);
  }

  .companion-identity {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .companion-avatar {
    width: 32px;
    height: 32px;
    min-width: 32px;
    border-radius: 50%;
    background: var(--primary-color);
    color: var(--white);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .companion-avatar-lg {
    width: 40px;
    height: 40px;
    min-width: 40px;
    font-size: 0.85rem;
  }

  .companion-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .companion-name {
    font-size: 0.83rem;
    font-weight: 600;
    color: var(--dark-text);
    white-space: nowrap;
  }

  .companion-email {
    font-size: 0.7rem;
    color: var(--gray-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }

  .col-perm {
    text-align: center;
    width: 52px;
  }

  .col-actions {
    width: 36px;
    text-align: right;
  }

  .perm-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--glass-border-dark);
    border: 1.5px solid var(--glass-border-dark);
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }

  .perm-dot.active {
    background: var(--primary-color);
    border-color: var(--primary-color);
  }

  .companion-edit-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--gray-text);
    cursor: pointer;
    transition: all var(--transition-fast);
    padding: 0;
  }

  .companion-edit-btn:hover,
  .companion-edit-btn.active {
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    border-color: var(--primary-light);
    color: var(--primary-color);
  }

  .companion-edit-btn svg {
    width: 13px;
    height: 13px;
  }

  .companion-edit-identity {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md) 0;
    margin-bottom: var(--spacing-md);
    border-bottom: 1px solid var(--glass-border-dark);
  }

  .edit-companion-select {
    width: 100%;
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--glass-border-dark);
    border-radius: var(--radius-md);
    background: var(--glass-bg-medium);
    font-size: 0.82rem;
    color: var(--dark-text);
    cursor: pointer;
  }

  .edit-companion-select:focus {
    outline: none;
    border-color: var(--primary-color);
  }

  .btn-danger-outline {
    background: none;
    color: #ef4444;
    border-color: #ef4444;
  }

  .btn-danger-outline:hover {
    background: #fee2e2;
  }

  .form-actions-remove {
  }

  .form-actions-remove .btn-danger-outline {
    width: 100%;
  }

  /* Form Styles */
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

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--spacing-md);
  }

  .form-row {
    display: flex;
    gap: var(--spacing-sm);
    align-items: flex-start;
  }

  .form-group--60 {
    flex: 0 0 60%;
    min-width: 0;
  }

  .form-group--40 {
    flex: 0 0 calc(40% - var(--spacing-sm));
    min-width: 0;
  }

  .form-group--half {
    flex: 0 0 calc(50% - var(--spacing-sm) / 2);
    min-width: 0;
  }

  .form-group--30 {
    flex: 0 0 calc(30% - var(--spacing-sm) / 2);
    min-width: 0;
  }

  .form-group--70 {
    flex: 0 0 calc(70% - var(--spacing-sm) / 2);
    min-width: 0;
  }

  .form-group--toggle {
    flex: 0 0 auto;
    min-width: 0;
    margin-left: auto;
  }

  .form-row:has(.form-group--toggle) > .form-group:not(.form-group--toggle) {
    flex: 1;
    min-width: 0;
  }

  .input-with-toggle {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .input-with-toggle input,
  .input-with-toggle select {
    flex: 1;
    min-width: 0;
  }

  .toggle-switch {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    user-select: none;
  }

  .toggle-switch input[type="checkbox"] {
    display: none;
  }

  .toggle-slider {
    position: relative;
    width: 56px;
    height: 30px;
    background: #f59e0b;
    border-radius: 15px;
    transition: background 0.2s;
    flex-shrink: 0;
  }

  .toggle-slider::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 24px;
    height: 24px;
    background: #fff center/16px 16px no-repeat;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23f59e0b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'/%3E%3Cline x1='12' y1='17' x2='12.01' y2='17'/%3E%3C/svg%3E");
    border-radius: 50%;
    transition: transform 0.2s, background-image 0.2s;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }

  .toggle-switch input[type="checkbox"]:checked + .toggle-slider {
    background: #10b981;
  }

  .toggle-switch input[type="checkbox"]:checked + .toggle-slider::after {
    transform: translateX(26px);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2310b981' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 11.08V12a10 10 0 1 1-5.93-9.14'/%3E%3Cpolyline points='22 4 12 14.01 9 11.01'/%3E%3C/svg%3E");
  }

  .toggle-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--dark-text);
    white-space: nowrap;
  }

.form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .form-group label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--dark-text);
  }

  .form-actions {
    display: flex;
    gap: var(--spacing-md);
    margin-top: var(--spacing-md);
  }

  .btn-primary,
  .btn-secondary,
  .btn-danger,
  .btn-danger-outline {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-lg);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--transition-fast);
    border-width: 1px;
    border-style: solid;
  }

  .btn-primary {
    background: var(--primary-color);
    color: var(--white);
    border-color: transparent;
  }

  .btn-primary:hover {
    background: var(--primary-dark);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }

  .btn-primary:active {
    transform: translateY(0);
  }

  .btn-secondary {
    background: var(--glass-bg-medium);
    color: var(--dark-text);
    border-color: var(--glass-border-dark);
  }

  .btn-secondary:hover {
    background: var(--white);
    border-color: var(--gray-dark);
  }

  .btn-danger {
    background: #ef4444;
    color: #fff;
    border-color: #dc2626;
  }

  .btn-danger:hover {
    background: #dc2626;
    border-color: #b91c1c;
  }

  /* Responsive Design for Dashboard */

  /* Mobile devices (portrait) */
  @media (max-width: 640px) {
    .side-nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      top: auto;
      flex-direction: row;
      justify-content: space-around;
      padding: var(--spacing-sm);
      background: var(--glass-bg-heavy);
      backdrop-filter: var(--blur-lg);
      -webkit-backdrop-filter: var(--blur-lg);
      border-top: 1px solid var(--glass-border-dark);
      box-shadow: var(--shadow-top);
      gap: var(--spacing-sm);
      z-index: var(--z-modal);
    }

    .nav-square {
      width: 48px;
      height: 48px;
      border-radius: var(--radius-md);
    }

    .nav-square svg {
      width: 20px;
      height: 20px;
    }

    .pane-title {
      margin-bottom: var(--spacing-lg);
    }

    .trip-card {
      border-radius: var(--radius-md);
    }

    .trip-header {
      padding: var(--spacing-sm) var(--spacing-md);
    }

    .item-row {
      padding: var(--spacing-xs) var(--spacing-md);
    }

    .timeline-item {
      padding: var(--spacing-sm) var(--spacing-md);
    }

    .trip-name {
      font-size: 0.9rem;
    }

    .trip-dates {
      font-size: 0.8rem;
    }

    .trip-purpose {
      font-size: 0.75rem;
    }

    .item-label {
      font-size: 0.85rem;
    }

    .item-type,
    .item-datetime {
      font-size: 0.7rem;
    }
  }

  /* Mobile devices (landscape) */
  @media (max-width: 900px) and (orientation: landscape) {
    .side-nav {
      top: 1vh;
      left: 1vh;
      gap: 1vh;
    }

    .nav-square {
      width: 44px;
      height: 44px;
    }

    .pane-title {
      margin-bottom: var(--spacing-md);
    }

    .trip-header {
      padding: var(--spacing-xs) var(--spacing-sm);
    }

    .item-row {
      padding: var(--spacing-xs) var(--spacing-sm);
    }

    .timeline-item {
      padding: var(--spacing-xs) var(--spacing-sm);
    }

    .trip-name {
      font-size: 0.8rem;
    }

    .trip-dates {
      font-size: 0.7rem;
    }

    .trip-purpose {
      font-size: 0.65rem;
    }

    .item-label {
      font-size: 0.8rem;
    }

    .item-type,
    .item-datetime {
      font-size: 0.65rem;
    }
  }

  /* Smooth rendering for flight paths */
  :global(.smooth-path) {
    shape-rendering: geometricPrecision;
    vector-effect: non-scaling-stroke;
  }

  /* Glowing effect for paths */
  :global(.path-glow) {
    filter: blur(2px);
  }

  /* Glowing effect for markers */
  :global(.marker-glow) {
    filter: blur(3px);
  }

  /* Touch device optimizations */
  @media (hover: none) and (pointer: coarse) {
    .nav-square {
      min-width: 48px;
      min-height: 48px;
    }

    .item-row {
      min-height: 44px;
      padding: var(--spacing-sm) var(--spacing-md);
    }

    .timeline-item {
      min-height: 44px;
      padding: var(--spacing-sm) var(--spacing-md);
    }

    .trip-header {
      min-height: 48px;
      padding: var(--spacing-sm) var(--spacing-md);
    }
  }

  /* Attendee section */
  .attendee-section {
    margin-top: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--glass-bg-light, rgba(255,255,255,0.05));
    border: 1px solid var(--glass-border-dark, rgba(0,0,0,0.12));
    border-radius: var(--radius-md, 8px);
  }

  .attendee-section-title {
    font-size: 0.85rem;
    font-weight: 600;
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
    flex: 1;
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
