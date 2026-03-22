<script>
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { authAPI, tripAPI, itemAPI, attendeeAPI, companionAPI, usersAPI, loyaltyAPI, flightLookupAPI, adminAPI } from '../lib/services/api';
  import { lookupAirline } from '../lib/data/airlines.js';
  import { user, isAuthenticated } from '../lib/stores/user';
  import DeleteModal from '../lib/components/DeleteModal.svelte';
  import SideNav from '../lib/components/SideNav.svelte';
  import TimelinePane from '../lib/components/TimelinePane.svelte';
  import SharedPane from '../lib/components/SharedPane.svelte';
  import CalendarPane from '../lib/components/CalendarPane.svelte';
  import AddNewPane from '../lib/components/AddNewPane.svelte';
  import SettingsPane from '../lib/components/SettingsPane.svelte';
  import { flattenStandaloneObj, generateCurvedPath, splitPathAtDateline, getItemLocations, getItemLabel, getItemIcon, getItemSortDateTime, getItemLocalTimezone, groupItemsByDate, parseDateOnly, formatDate, formatDateGroupHeader, getTripNights, getMonthYear, formatDateTime, formatTime24, getFlightDuration, getLayoverDuration, getItemEndDateTime, getAttendeeInitials, sortAttendees, getOwnerName, extractAirportCode, getItemDateTime, getItemPrimaryDate, utcDateTimeParts, parseUtcOffsetMinutes } from '../lib/utils/itemHelpers.js';
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

  // Delete all trip data state
  let showDeleteDataModal = false;
  let deleteDataConfirmText = '';
  let deleteDataSubmitting = false;
  let deleteDataError = '';

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

  async function handleDeleteAllTripData() {
    if (deleteDataConfirmText !== 'DELETE') return;
    deleteDataSubmitting = true;
    deleteDataError = '';
    try {
      await usersAPI.deleteAllTripData();
      showDeleteDataModal = false;
      deleteDataConfirmText = '';
      // Reload trips and items
      await loadTripsAndItems();
    } catch (err) {
      deleteDataError = err?.response?.data?.message ?? 'Failed to delete data. Please try again.';
    } finally {
      deleteDataSubmitting = false;
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
      const result = await usersAPI.importPreview({ trips: parsed.trips, standalone: parsed.standalone ?? null, vouchers: parsed.vouchers ?? null, loyaltyPrograms: parsed.loyaltyPrograms ?? null });
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
      for (const lp of (importData.loyaltyPrograms ?? [])) {
        importSelections[`loyalty:${lp._importIndex}`] = !lp.isDuplicate;
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

    const loyaltyPayload = (importData.loyaltyPrograms ?? []).map((lp) => ({
      data: stripAnnotations(lp),
      selected: !!importSelections[`loyalty:${lp._importIndex}`],
    }));

    try {
      const result = await usersAPI.executeImport(tripsPayload, importCompanions, standalonePayload, vouchersPayload, loyaltyPayload);
      importResult = result;
      if (result.imported > 0) {
        await loadTripsAndItems();
        await loadLoyaltyPrograms();
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
    const loyaltyCount = importData.loyaltyPrograms?.length ?? 0;
    const dups = importData.trips.reduce((n, t) =>
      n + (t.isDuplicate ? 1 : 0) + itemTypes.reduce((m, k) => m + countDups(t[k]), 0), 0)
      + (importData.standalone ? itemTypes.reduce((n, k) => n + countDups(importData.standalone[k]), 0) : 0)
      + countDups(importData.vouchers)
      + countDups(importData.loyaltyPrograms);
    return { trips, items: tripItems + standaloneItems, vouchers: voucherCount, loyaltyCount, dups };
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
  let selectedFriendsCompanionIds = new Set();

  async function loadCompanions() {
    companionsLoading = true;
    try {
      companions = await companionAPI.getMyCompanions();
    } finally {
      companionsLoading = false;
    }
  }

  $: if (activeSettingsSection === 'companions') {
    loadCompanions();
  }

  let loyaltyPrograms = [];
  let loyaltyLoading = false;

  async function loadLoyaltyPrograms() {
    loyaltyLoading = true;
    try {
      loyaltyPrograms = await loyaltyAPI.getMyPrograms();
    } finally {
      loyaltyLoading = false;
    }
  }

  $: if (activeSettingsSection === 'loyalty') {
    loadLoyaltyPrograms();
  }

  async function handleAddLoyaltyProgram(data) {
    await loyaltyAPI.addProgram(data);
    await loadLoyaltyPrograms();
  }

  async function handleUpdateLoyaltyProgram(id, data) {
    await loyaltyAPI.updateProgram(id, data);
    await loadLoyaltyPrograms();
  }

  async function handleDeleteLoyaltyProgram(id) {
    await loyaltyAPI.deleteProgram(id);
    await loadLoyaltyPrograms();
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
  let addNewReturnPane = null; // pane to return to instead of staying on 'addNew'
  let selectedItem = null; // Currently selected item for editing
  let editForm = {}; // Form data for editing
  let selectedTrip = null; // Currently selected trip for editing
  let editTripForm = {}; // Form data for editing a trip
  let markers = []; // Map markers
  let polylines = []; // Map polylines for flights and transportation
  let L; // Leaflet library

  let visibleItemTypes = {
    trip: true,
    flight: true,
    hotel: true,
    transportation: true,
    car_rental: true,
    event: true
  };

  function toggleVisibleItemType(type) {
    visibleItemTypes = { ...visibleItemTypes, [type]: !visibleItemTypes[type] };
  }

  // Reactive statement to update map markers when items or timeline tab changes
  $: if (map && L && (items || activeTimelineTab || activePane || trips || friendsTrips || attendeeStandaloneItems || companionStandaloneItems || selectedFriendsCompanionIds || visibleItemTypes)) {
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

  let flightLookupLoading = false;

  async function autofillFlight(form, flightNumber, date, isEdit = false) {
    if (!flightNumber || !/^[A-Z]{2}\d{1,4}$/i.test(flightNumber)) return;
    if (!date) return;

    flightLookupLoading = true;
    try {
      const result = await flightLookupAPI.lookup(flightNumber, date);
      if (result?.origin)              form.origin = result.origin;
      if (result?.destination)         form.destination = result.destination;
      if (result?.departureDate)       form.departureDate = result.departureDate;
      if (result?.arrivalDate)         form.arrivalDate = result.arrivalDate;
      if (result?.departureTime)       form.departureTime = result.departureTime;
      if (result?.arrivalTime)         form.arrivalTime = result.arrivalTime;
      if (result?.departureTimezone)   form.originTimezone = result.departureTimezone;
      if (result?.arrivalTimezone)     form.destinationTimezone = result.arrivalTimezone;
      if (result?.flightLookupId)      form.flightLookupId = result.flightLookupId;
      if (isEdit) editForm = editForm; else itemForm = itemForm;
    } catch {
      // Silent — user can fill manually
    } finally {
      flightLookupLoading = false;
    }
  }

  function onItemFlightNumberInput(e) {
    const upper = e.target.value.toUpperCase();
    if (e.target.value !== upper) e.target.value = upper;
    itemForm.flightNumber = upper;
    const looked = lookupAirline(itemForm.flightNumber);
    itemForm.airline = looked;
    itemForm = itemForm; // trigger reactivity
  }

  function onItemFlightNumberBlur() {
    autofillFlight(itemForm, itemForm.flightNumber, itemForm.departureDate);
  }

  function onEditFlightNumberInput(e) {
    const upper = e.target.value.toUpperCase();
    if (e.target.value !== upper) e.target.value = upper;
    editForm.flightNumber = upper;
    const looked = lookupAirline(editForm.flightNumber);
    editForm.airline = looked;
    editForm = editForm; // trigger reactivity
  }

  function onEditFlightNumberBlur() {
    autofillFlight(editForm, editForm.flightNumber, editForm.departureDate, true);
  }

  function togglePane(pane) {
    activePane = (activePane === pane && !isMobileView) ? null : pane;
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

  function openHotelFormForTrip(tripId, gapStart, gapEnd) {
    addNewReturnPane = activePane !== 'addNew' ? activePane : null;
    activePane = 'addNew';
    addNewView = 'itemForm';
    resetAttendeeState();
    const trip = trips.find(t => t.id === tripId);
    if (trip?.attendees) {
      pendingAttendees = trip.attendees
        .filter(a => String(a.userId) !== String($user?.id) && a.user?.email)
        .map(a => ({ email: a.user.email, firstName: a.user.firstName || '', lastName: a.user.lastName || '' }));
    }
    const checkInDate = gapStart ? new Date(gapStart).toISOString().slice(0, 10) : '';
    const checkOutDate = gapEnd ? new Date(gapEnd).toISOString().slice(0, 10) : '';
    itemForm = {
      itemType: 'hotel',
      tripId: tripId || '',
      status: 'confirmed',
      airline: '', flightNumber: '', departureDate: '', departureTime: '', arrivalDate: '', arrivalTime: '',
      origin: '', destination: '', pnr: '', seat: '',
      hotelName: '', address: '', phone: '', checkInDate, checkInTime: '14:00', checkOutDate, checkOutTime: '11:00',
      confirmationNumber: '', roomNumber: '',
      method: '', journeyNumber: '',
      name: '', startDate: '', startTime: '', endDate: '', endTime: '', allDay: false, location: '',
      contactPhone: '', contactEmail: '', description: '', eventUrl: '',
      company: '', pickupLocation: '', pickupDate: '', pickupTime: '', dropoffLocation: '', dropoffDate: '', dropoffTime: ''
    };
  }

  function backToMenu() {
    if (addNewReturnPane) {
      activePane = addNewReturnPane;
      addNewReturnPane = null;
      resetAttendeeState();
      return;
    }
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
        payload.flightLookupId = itemForm.flightLookupId || undefined;
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


  async function handlePnrImport(tripId, flights) {
    for (const f of flights) {
      await itemAPI.createItem({
        itemType: 'flight',
        tripId,
        flightNumber: f.flightNumber,
        airline: f.airline,
        origin: f.origin,
        destination: f.destination,
        departureDate: f.departureDate,
        departureTime: f.departureTime,
        arrivalDate: f.arrivalDate,
        arrivalTime: f.arrivalTime,
        ...(f.seat ? { seat: f.seat } : {}),
        pnr: f.pnr,
      });
    }
    await loadTripsAndItems();
  }

  async function loadTripsAndItems() {
    try {
      const response = await tripAPI.getAllTrips();

      trips = response.trips || [];
      friendsTrips = response.friendsTrips || [];
      standaloneItems = flattenStandaloneObj(response.standalone || {});
      attendeeStandaloneItems = flattenStandaloneObj(response.attendeeStandalone || {});
      const allCompanionStandalone = flattenStandaloneObj(response.companionStandalone || {});
      // Items I was explicitly added to as an attendee belong on my timeline.
      // Remove them from the companion list to avoid showing them twice.
      const attendeeItemIds = new Set(attendeeStandaloneItems.map(i => i.id));
      companionStandaloneItems = allCompanionStandalone.filter(i => !attendeeItemIds.has(i.id));
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
      ? getFriendsTimelineEntries(selectedFriendsCompanionIds)
      : getAllItemsChronological();
    const seenMapIds = new Set();
    const filteredItems = [];
    const currentUserId = $user?.id;
    const isAttendeeOnItem = (item) =>
      Array.isArray(item.attendees) && item.attendees.some(a => String(a.userId) === String(currentUserId));
    // In the shared pane, entries already come from friends' trips so the attendee
    // check is not applicable — show all their items on the map.
    const skipAttendeeCheck = activePane === 'shared';
    for (const entry of timelineEntries) {
      if (entry.type === 'trip' && visibleItemTypes.trip !== false) {
        for (const dateGroup of (entry.itemsByDate || [])) {
          for (const item of (dateGroup.items || [])) {
            if (!seenMapIds.has(item.id) && visibleItemTypes[item.itemType] !== false && (skipAttendeeCheck || isAttendeeOnItem(item))) {
              seenMapIds.add(item.id);
              filteredItems.push(item);
            }
          }
        }
      } else if (entry.type === 'item') {
        if (!seenMapIds.has(entry.item.id) && visibleItemTypes[entry.item.itemType] !== false) {
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
          <strong>${getItemLabel(location.item, formatTime24)}</strong><br/>
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
                  <strong>${getItemLabel(item, formatTime24)}</strong><br/>
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

    await Promise.all([loadTripsAndItems(), loadCompanions(), loadLoyaltyPrograms()]);

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






  function filterTripsByItemDate(itemDate, currentTripId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const itemIsPast = itemDate ? parseDateOnly(itemDate) < today : false;
    return trips.filter(trip => {
      if (currentTripId && trip.id === currentTripId) return true;
      const tripEnd = trip.returnDate ? parseDateOnly(trip.returnDate) : parseDateOnly(trip.departureDate);
      const tripIsPast = tripEnd < today;
      return itemIsPast ? tripIsPast : !tripIsPast;
    });
  }








  // Item types that have a meaningful arrival/end time to anchor accommodation gap detection
  const TRAVEL_ANCHOR_TYPES = new Set(['flight', 'transportation', 'car_rental']);

  function buildTripRenderRows(itemsByDate, tripId) {
    const rows = [];
    let lastFlight = null;
    // lastAnchor: the most recent flight/transportation/car_rental item (has a reliable end time)
    let lastAnchor = null;
    // gapCardInserted: track the row index after lastAnchor so we only insert one card per gap
    let gapCardInsertedAfter = null;
    // Flatten all items in chronological order for gap detection
    const allItems = itemsByDate.flatMap(dg => dg.items);
    // Build a set of hotel date ranges to check coverage
    const hotels = allItems.filter(i => i.itemType === 'hotel');

    for (const dateGroup of itemsByDate) {
      rows.push({ type: 'date-header', dateKey: dateGroup.dateKey });
      for (const item of dateGroup.items) {
        if (item.itemType === 'flight' && lastFlight) {
          const layover = getLayoverDuration(lastFlight, item);
          if (layover) rows.push({ type: 'layover', duration: layover });
        }
        rows.push({ type: 'item', item });

        // After pushing an anchor item, check if the gap to the next anchor exceeds
        // 30h with no hotel coverage — insert the suggestion card immediately after.
        if (activeTimelineTab === 'upcoming' && TRAVEL_ANCHOR_TYPES.has(item.itemType)) {
          if (lastAnchor && gapCardInsertedAfter !== lastAnchor) {
            const prevEnd = getItemEndDateTime(lastAnchor);
            const nextStart = getItemSortDateTime(item);
            if (prevEnd && nextStart) {
              const gapMs = new Date(nextStart) - new Date(prevEnd);
              const thirtyHoursMs = 30 * 60 * 60 * 1000;
              if (gapMs > thirtyHoursMs) {
                const gapCovered = hotels.some(h => {
                  const hotelStart = h.checkInDateTime;
                  const hotelEnd = h.checkOutDateTime;
                  if (!hotelStart || !hotelEnd) return false;
                  return new Date(hotelStart) < new Date(nextStart) && new Date(hotelEnd) > new Date(prevEnd);
                });
                if (!gapCovered) {
                  // Find the index of the lastAnchor item row and insert the card right after it
                  let insertIdx = rows.length - 1;
                  for (let i = rows.length - 2; i >= 0; i--) {
                    if (rows[i].type === 'item' && rows[i].item === lastAnchor) {
                      insertIdx = i + 1;
                      break;
                    }
                  }
                  rows.splice(insertIdx, 0, { type: 'accommodation-gap', tripId, gapStart: prevEnd, gapEnd: nextStart });
                  gapCardInsertedAfter = lastAnchor;
                }
              }
            }
          }
          lastAnchor = item;
        }

        if (item.itemType === 'flight') lastFlight = item;
      }
    }
    return rows;
  }

  function getItemsForTrip(tripId) {
    return items.filter(item => item.tripId === tripId);
  }








  function getAllItemsChronological(tab = activeTimelineTab) {
    // Create timeline entries for trips and standalone items
    const timelineEntries = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Add trips as timeline entries
    for (const trip of trips) {
      const tripEndDate = trip.returnDate ? parseDateOnly(trip.returnDate) : parseDateOnly(trip.departureDate);
      tripEndDate.setHours(0, 0, 0, 0);

      // Filter trips based on active tab
      if (tab === 'upcoming') {
        if (tripEndDate < now) {
          continue; // Skip past trips
        }
      } else if (tab === 'past') {
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
        if (tab === 'upcoming') {
          if (itemDate < now) continue; // Skip past items
        } else if (tab === 'past') {
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
    if (tab === 'upcoming') {
      timelineEntries.sort((a, b) => a.sortDate - b.sortDate); // Oldest first
    } else {
      timelineEntries.sort((a, b) => b.sortDate - a.sortDate); // Newest first
    }

    return timelineEntries;
  }



  function getFriendsTimelineEntries(filterIds = null) {
    // Returns upcoming and in-progress trips/items from companions, sorted chronologically
    // filterIds: optional Set of companion user IDs to restrict results to
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const entries = [];

    // Add all trips not owned by me: companion-shared + attendee trips
    // Also include owned trips where I removed myself as an attendee (created on behalf of others).
    const allFriendTrips = [
      ...friendsTrips,
      ...trips.filter(t => t.isShared),
    ].filter(t => {
      if (!filterIds || !filterIds.size) return true;
      // Self-removed owned trips (owner === current user) always show regardless of companion filter
      if (t.user && String(t.user.id) === String($user?.id)) return true;
      return t.user && filterIds.has(t.user.id);
    });
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

    // Add standalone items from friends: companion-library items + items the friend explicitly shared
    // with the current user as an attendee (isOwner=false means the friend owns it)
    const seenStandaloneIds = new Set();
    const allFriendStandalone = [
      ...companionStandaloneItems,
      ...attendeeStandaloneItems.filter(i => !i.isOwner),
    ].filter(i => {
      if (seenStandaloneIds.has(i.id)) return false;
      seenStandaloneIds.add(i.id);
      return true;
    });
    const filteredStandaloneItems = (!filterIds || !filterIds.size)
      ? allFriendStandalone
      : allFriendStandalone.filter(i => i.user && filterIds.has(i.user.id));
    for (const item of filteredStandaloneItems) {
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


  // Date sync helpers: keep start/end date pairs consistent
  function onItemStartDateChange(startField, endField) {
    const start = itemForm[startField];
    if (!itemForm[endField] || start > itemForm[endField]) {
      itemForm[endField] = start;
    }
    if (startField === 'departureDate') autofillFlight(itemForm, itemForm.flightNumber, start);
  }

  function onItemEndDateChange(startField, endField) {
    // Do not snap the departure date backward — flights crossing the international
    // date line can have a local arrival date that appears earlier than the departure.
  }

  function onEditStartDateChange(startField, endField) {
    const start = editForm[startField];
    if (!editForm[endField] || start > editForm[endField]) {
      editForm[endField] = start;
    }
    if (startField === 'departureDate') autofillFlight(editForm, editForm.flightNumber, start, true);
  }

  function onEditEndDateChange(startField, endField) {
    // Do not snap the departure date backward — flights crossing the international
    // date line can have a local arrival date that appears earlier than the departure.
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
      editForm.allDay = editForm.startTime === '00:00' && editForm.endTime === '23:59';
    } else if (item.itemType === 'car_rental') {
      if (item.pickupDateTime) {
        const p = utcDateTimeParts(item.pickupDateTime, item.pickupTimezone);
        editForm.pickupDate = p.date;
        editForm.pickupTime = p.time;
      }
      if (item.dropoffDateTime) {
        const p = utcDateTimeParts(item.dropoffDateTime, item.dropoffTimezone);
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

  // Called from SharedPane when a trip card is clicked.
  // Only the creator of the trip can edit it; open the edit form within the shared pane.
  function handleFriendsTripClick(trip) {
    if (String(trip.createdBy) !== String($user?.id)) return;
    handleTripClick(trip);
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
        tripId: editForm.tripId || null
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
        payload.flightLookupId = editForm.flightLookupId || undefined;
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
  <SideNav {activePane} onTogglePane={togglePane} />

  <!-- Independent content pane -->
  {#if activePane === 'timeline'}
    <TimelinePane
      {trips}
      {isMobileView}
      {timelineVersion}
      {selectedItem}
      {selectedTrip}
      {editForm}
      {editTripForm}
      {formAttendees}
      {formAttendeesLoading}
      bind:attendeeEmailInput
      {attendeeSuggestions}
      {attendeeSuggestionsLoading}
      {attendeeAddLoading}
      {attendeeAddError}
      bind:activeTimelineTab
      {getAllItemsChronological}
      {buildTripRenderRows}
      onItemClick={handleItemClick}
      onTripClick={handleTripClick}
      onCloseEditForm={closeEditForm}
      onCloseTripEditForm={closeTripEditForm}
      onUpdateItem={handleUpdateItem}
      onUpdateTrip={handleUpdateTrip}
      onDeleteItem={handleDeleteItem}
      onDeleteTrip={handleDeleteTrip}
      onOpenHotelFormForTrip={openHotelFormForTrip}
      onEditFlightNumberInput={onEditFlightNumberInput}
      onEditFlightNumberBlur={onEditFlightNumberBlur}
      onEditStartDateChange={onEditStartDateChange}
      onEditEndDateChange={onEditEndDateChange}
      {flightLookupLoading}
      onAttendeeInput={onAttendeeInput}
      onDismissSuggestions={dismissAttendeeSuggestions}
      onAddAttendee={handleAddAttendee}
      onRemoveAttendee={handleRemoveAttendee}
      onSelectAttendeeSuggestion={selectAttendeeSuggestion}
      {loyaltyPrograms}
      onPnrImport={(flights) => handlePnrImport(selectedTrip?.id, flights)}
    />
  {/if}

  {#if activePane === 'shared'}
    <SharedPane
      {friendsTrips}
      {companions}
      {companionStandaloneItems}
      {attendeeStandaloneItems}
      {visibleItemTypes}
      {isMobileView}
      onToggleItemType={toggleVisibleItemType}
      {getFriendsTimelineEntries}
      bind:selectedFriendsCompanionIds
      onTripClick={handleFriendsTripClick}
      {selectedTrip}
      {editTripForm}
      {formAttendees}
      {formAttendeesLoading}
      bind:attendeeEmailInput
      {attendeeSuggestions}
      {attendeeSuggestionsLoading}
      {attendeeAddLoading}
      {attendeeAddError}
      {loyaltyPrograms}
      onCloseTripEditForm={closeTripEditForm}
      onUpdateTrip={handleUpdateTrip}
      onDeleteTrip={handleDeleteTrip}
      onAttendeeInput={onAttendeeInput}
      onDismissSuggestions={dismissAttendeeSuggestions}
      onAddAttendee={handleAddAttendee}
      onRemoveAttendee={handleRemoveAttendee}
      onSelectAttendeeSuggestion={selectAttendeeSuggestion}
      onPnrImport={(flights) => handlePnrImport(selectedTrip?.id, flights)}
    />
  {/if}

  {#if activePane === 'addNew'}
    <AddNewPane
      {addNewView}
      {tripForm}
      {trips}
      {itemForm}
      {pendingAttendees}
      bind:attendeeEmailInput
      {attendeeSuggestions}
      {attendeeSuggestionsLoading}
      {attendeeAddError}
      onShowTripForm={showTripForm}
      onShowItemForm={showItemForm}
      onBackToMenu={backToMenu}
      onCreateTrip={handleCreateTrip}
      onTripStartDateChange={onTripStartDateChange}
      onTripEndDateChange={onTripEndDateChange}
      onCreateItem={handleCreateItem}
      onItemFlightNumberInput={onItemFlightNumberInput}
      onItemFlightNumberBlur={onItemFlightNumberBlur}
      onItemStartDateChange={onItemStartDateChange}
      onItemEndDateChange={onItemEndDateChange}
      {flightLookupLoading}
      {filterTripsByItemDate}
      {getItemPrimaryDate}
      onAttendeeInput={onAttendeeInput}
      onDismissSuggestions={dismissAttendeeSuggestions}
      onQueueAttendee={handleQueueAttendee}
      onRemovePendingAttendee={handleRemovePendingAttendee}
      onSelectAttendeeSuggestion={selectAttendeeSuggestion}
    />
  {/if}

  {#if activePane === 'calendar'}
    <CalendarPane
      {trips}
      {standaloneItems}
      {attendeeStandaloneItems}
      {companionStandaloneItems}
      {friendsTrips}
      {companions}
      {visibleItemTypes}
      {isMobileView}
      onToggleItemType={toggleVisibleItemType}
    />
  {/if}

  {#if activePane === 'settings'}
    <SettingsPane
      {isMobileView}
      {activeSettingsSection}
      {profileForm}
      {profileSaveError}
      {profileSaveSuccess}
      {companions}
      {companionsLoading}
      {importData}
      {importSummary}
      {importSelections}
      {importSelectedCount}
      {importResult}
      {importSubmitting}
      {importLoading}
      {importDragOver}
      {importFileError}
      onSectionChange={(s) => { activeSettingsSection = s; }}
      onLogout={handleLogout}
      onSaveProfile={handleSaveProfile}
      onExportData={handleExportData}
      onImportFileChange={handleImportFileChange}
      onImportDrop={handleImportDrop}
      onImportDragOver={() => { importDragOver = true; }}
      onImportDragLeave={() => { importDragOver = false; }}
      onExecuteImport={handleExecuteImport}
      onClearImport={() => { importData = null; importCompanions = []; importSelections = {}; importResult = null; importFileError = ''; }}
      onSelectAll={() => { const next = {}; for (const k of Object.keys(importSelections)) next[k] = true; importSelections = next; }}
      onDeselectAll={() => { const next = {}; for (const k of Object.keys(importSelections)) next[k] = false; importSelections = next; }}
      onImportSelectionChange={(key, checked, tripItems, tripImportIndex) => {
        const next = { ...importSelections, [key]: checked };
        if (tripItems) for (const i of tripItems) next[`${i._itemType}:${tripImportIndex}:${i._importIndex}`] = checked;
        importSelections = next;
      }}
      onShowDeleteDataModal={() => { showDeleteDataModal = true; deleteDataConfirmText = ''; deleteDataError = ''; }}
      onAddCompanion={async (email, fn, ln) => { await companionAPI.addCompanion(email, fn, ln); await loadCompanions(); }}
      onSaveEditCompanion={async (id, perm) => { await companionAPI.updatePermission(id, perm); await loadCompanions(); }}
      onRemoveCompanion={async (id) => { await companionAPI.removeCompanion(id); await loadCompanions(); }}
      onSearchCompanions={(q) => companionAPI.searchUsers(q)}
      {loyaltyPrograms}
      {loyaltyLoading}
      onAddLoyaltyProgram={handleAddLoyaltyProgram}
      onUpdateLoyaltyProgram={handleUpdateLoyaltyProgram}
      onDeleteLoyaltyProgram={handleDeleteLoyaltyProgram}
      isAdmin={$user?.isAdmin === true}
      onLoadAdminAirports={() => adminAPI.getAllAirports()}
      onUpdateAdminAirport={(iata, data) => adminAPI.updateAirport(iata, data)}
      onLoadCachedFlights={() => adminAPI.getCachedFlights()}
      onDeleteCachedFlight={(id) => adminAPI.deleteCachedFlight(id)}
      onDeleteAllCachedFlights={() => adminAPI.deleteAllCachedFlights()}
      onRefreshCachedFlight={(flightNumber, date) => adminAPI.refreshCachedFlight(flightNumber, date)}
    />
  {/if}
</div>

<!-- Delete All Trip Data confirmation modal -->
<DeleteModal
  show={showDeleteDataModal}
  bind:confirmText={deleteDataConfirmText}
  submitting={deleteDataSubmitting}
  error={deleteDataError}
  onConfirm={handleDeleteAllTripData}
  onCancel={() => { showDeleteDataModal = false; deleteDataConfirmText = ''; deleteDataError = ''; }}
/>

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
    height: 100dvh;
  }

  @media (max-width: 640px) {
    .dashboard-root::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 0;
      background:
        radial-gradient(ellipse 180px 140px at 15% 20%, #1a8fc0 0%, transparent 70%),
        radial-gradient(ellipse 220px 160px at 75% 10%, #d4780a 0%, transparent 70%),
        radial-gradient(ellipse 150px 200px at 85% 45%, #1060a8 0%, transparent 70%),
        radial-gradient(ellipse 200px 120px at 30% 60%, #b85c10 0%, transparent 70%),
        radial-gradient(ellipse 160px 180px at 60% 78%, #c87c10 0%, transparent 70%),
        radial-gradient(ellipse 130px 150px at 10% 88%, #0a8fcc 0%, transparent 70%),
        radial-gradient(ellipse 190px 130px at 50% 42%, #0e70c0 0%, transparent 70%),
        radial-gradient(ellipse 140px 170px at 90% 82%, #d08820 0%, transparent 70%);
      filter: blur(30px);
    }
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
</style>