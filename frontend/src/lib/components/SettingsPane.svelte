<script>
  import ContentPane from './ContentPane.svelte';
  import PaneColumn from './PaneColumn.svelte';
  import PhoneInput from './PhoneInput.svelte';

  export let isMobileView = false;
  export let isAdmin = false;
  export let activeSettingsSection = null; // 'profile' | 'security' | 'companions' | 'loyalty' | 'data' | 'admin-airports' | 'admin-flights'
  export let profileForm = { firstName: '', lastName: '', email: '', phone: '' };
  export let profileSaveError = '';
  export let profileSaveSuccess = false;
  export let companions = [];
  export let companionsLoading = false;
  export let importData = null;
  export let importSummary = null;
  export let importSelections = {};
  export let importSelectedCount = 0;
  export let importResult = null;
  export let importSubmitting = false;
  export let importLoading = false;
  export let importDragOver = false;
  export let importFileError = '';

  // callbacks
  export let onSectionChange = null; // (section) => void
  export let onLogout = null;
  export let onSaveProfile = null;
  export let onExportData = null;
  export let onImportFileChange = null;
  export let onImportDrop = null;
  export let onImportDragOver = null;
  export let onImportDragLeave = null;
  export let onExecuteImport = null;
  export let onClearImport = null;
  export let onSelectAll = null;
  export let onDeselectAll = null;
  export let onImportSelectionChange = null; // (key, checked, tripItems?, tripImportIndex?) => void
  export let onShowDeleteDataModal = null;
  // companion callbacks — all are async, return Promise
  export let onAddCompanion = null; // (email, firstName, lastName) => Promise<void>
  export let onSaveEditCompanion = null; // (companionUserId, permission) => Promise<void>
  export let onRemoveCompanion = null; // (companionUserId) => Promise<void>
  export let onSearchCompanions = null; // (q) => Promise<User[]>

  // loyalty program props and callbacks
  export let loyaltyPrograms = [];
  export let loyaltyLoading = false;
  export let onAddLoyaltyProgram = null;
  export let onUpdateLoyaltyProgram = null;
  export let onDeleteLoyaltyProgram = null;

  // admin callbacks
  export let onLoadAdminAirports = null; // () => Promise<Airport[]>
  export let onUpdateAdminAirport = null; // (iata, data) => Promise<Airport>
  export let onLoadCachedFlights = null; // () => Promise<FlightLookup[]>
  export let onDeleteCachedFlight = null; // (id) => Promise<void>
  export let onDeleteAllCachedFlights = null; // () => Promise<void>
  export let onRefreshCachedFlight = null; // (flightNumber, date) => Promise<record>

  // local state — only relevant within SettingsPane
  let showSettingsSheet = false;
  let addingCompanion = false;
  let addCompanionEmail = '';
  let addCompanionFirstName = '';
  let addCompanionLastName = '';
  let addCompanionError = '';
  let companionLookupLoading = false;
  let companionSuggestions = [];
  let editingCompanion = null;
  let editCompanionPermission = 'view';
  let editCompanionError = '';

  // loyalty local state
  let addingLoyalty = false;
  let loyaltyForm = { programName: '', memberNumber: '', category: 'airline', accountFirstName: '', accountLastName: '' };
  let loyaltyFormError = '';
  let editingLoyalty = null;
  let editLoyaltyForm = { programName: '', memberNumber: '', category: 'airline', accountFirstName: '', accountLastName: '' };
  let editLoyaltyError = '';

  // admin local state
  let adminAirports = [];
  let adminAirportsLoading = false;
  let adminAirportsError = '';
  let adminAirportSearch = '';
  let editingAirport = null;
  let editAirportForm = { icao: '', name: '', city: '', country: '', latitude: '', longitude: '', timezone: '' };
  let editAirportError = '';
  let editAirportSuccess = false;

  let cachedFlights = [];
  let cachedFlightsLoading = false;
  let cachedFlightsError = '';
  let cachedFlightsDeleteConfirm = false;
  let refreshingFlightId = null;
  let refreshedFlightIds = new Set();
  let refreshingAll = false;

  function selectSection(section) {
    if (onSectionChange) onSectionChange(section);
    if (isMobileView) showSettingsSheet = true;
  }

  function closeSheet() {
    showSettingsSheet = false;
    if (onSectionChange) onSectionChange(null);
    closeEditCompanion();
    addingCompanion = false;
    addCompanionEmail = '';
    addCompanionError = '';
    closeEditLoyalty();
    addingLoyalty = false;
    loyaltyFormError = '';
    closeEditAirport();
    adminAirportSearch = '';
    cachedFlightsDeleteConfirm = false;
    if (onClearImport) onClearImport();
  }

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

  async function submitAddCompanion(e) {
    e.preventDefault();
    addCompanionError = '';
    if (!addCompanionEmail.trim()) return;
    try {
      await onAddCompanion(addCompanionEmail.trim(), addCompanionFirstName.trim(), addCompanionLastName.trim());
      addCompanionEmail = '';
      addCompanionFirstName = '';
      addCompanionLastName = '';
      addingCompanion = false;
    } catch (err) {
      addCompanionError = err.message ?? 'Failed to add companion';
    }
  }

  async function submitSaveEditCompanion(e) {
    e.preventDefault();
    if (!editingCompanion) return;
    editCompanionError = '';
    try {
      await onSaveEditCompanion(editingCompanion.companionUser.id, editCompanionPermission);
      closeEditCompanion();
    } catch (err) {
      editCompanionError = err.message ?? 'Failed to update permissions';
    }
  }

  async function submitRemoveCompanion(companionUserId) {
    try {
      await onRemoveCompanion(companionUserId);
      if (editingCompanion?.companionUser?.id === companionUserId) closeEditCompanion();
    } catch (err) {
      editCompanionError = err.message ?? 'Failed to remove companion';
    }
  }

  let companionLookupTimer = null;

  function handleCompanionIdentifierInput() {
    clearTimeout(companionLookupTimer);
    addCompanionFirstName = '';
    addCompanionLastName = '';
    companionSuggestions = [];
    const q = addCompanionEmail.trim();
    if (q.length < 2) return;
    companionLookupLoading = true;
    companionLookupTimer = setTimeout(async () => {
      try {
        companionSuggestions = onSearchCompanions ? await onSearchCompanions(q) : [];
      } catch {
        companionSuggestions = [];
      } finally {
        companionLookupLoading = false;
      }
    }, 300);
  }

  function handleDismissCompanionSuggestions() {
    setTimeout(() => { companionSuggestions = []; }, 150);
  }

  function handleSelectCompanionSuggestion(u) {
    addCompanionEmail = u.email || u.phone || '';
    addCompanionFirstName = u.firstName ?? '';
    addCompanionLastName = u.lastName?.[0] ?? '';
    companionSuggestions = [];
  }

  function openEditLoyalty(prog) {
    editingLoyalty = prog;
    editLoyaltyForm = { programName: prog.programName, memberNumber: prog.memberNumber, category: prog.category, accountFirstName: prog.accountFirstName ?? '', accountLastName: prog.accountLastName ?? '' };
    editLoyaltyError = '';
    addingLoyalty = false;
  }

  function closeEditLoyalty() {
    editingLoyalty = null;
    editLoyaltyError = '';
  }

  async function submitAddLoyalty(e) {
    e.preventDefault();
    loyaltyFormError = '';
    try {
      await onAddLoyaltyProgram({ ...loyaltyForm });
      loyaltyForm = { programName: '', memberNumber: '', category: 'airline', accountFirstName: '', accountLastName: '' };
      addingLoyalty = false;
    } catch (err) {
      loyaltyFormError = err.message ?? 'Failed to add program';
    }
  }

  async function submitEditLoyalty(e) {
    e.preventDefault();
    editLoyaltyError = '';
    try {
      await onUpdateLoyaltyProgram(editingLoyalty.id, { ...editLoyaltyForm });
      closeEditLoyalty();
    } catch (err) {
      editLoyaltyError = err.message ?? 'Failed to update program';
    }
  }

  async function submitDeleteLoyalty(id) {
    editLoyaltyError = '';
    try {
      await onDeleteLoyaltyProgram(id);
      closeEditLoyalty();
    } catch (err) {
      editLoyaltyError = err.message ?? 'Failed to remove program';
    }
  }

  async function loadAdminAirports() {
    if (!onLoadAdminAirports) return;
    adminAirportsLoading = true;
    adminAirportsError = '';
    try {
      adminAirports = await onLoadAdminAirports();
    } catch (err) {
      adminAirportsError = err.message ?? 'Failed to load airports';
    } finally {
      adminAirportsLoading = false;
    }
  }

  function openEditAirport(airport) {
    editingAirport = airport;
    editAirportForm = {
      icao: airport.icao ?? '',
      name: airport.name ?? '',
      city: airport.city ?? '',
      country: airport.country ?? '',
      latitude: airport.latitude ?? '',
      longitude: airport.longitude ?? '',
      timezone: airport.timezone ?? '',
    };
    editAirportError = '';
    editAirportSuccess = false;
  }

  function closeEditAirport() {
    editingAirport = null;
    editAirportError = '';
    editAirportSuccess = false;
  }

  async function submitEditAirport(e) {
    e.preventDefault();
    if (!editingAirport || !onUpdateAdminAirport) return;
    editAirportError = '';
    editAirportSuccess = false;
    try {
      const updated = await onUpdateAdminAirport(editingAirport.iata, {
        icao: editAirportForm.icao || undefined,
        name: editAirportForm.name || undefined,
        city: editAirportForm.city || undefined,
        country: editAirportForm.country || undefined,
        latitude: editAirportForm.latitude !== '' ? parseFloat(editAirportForm.latitude) : undefined,
        longitude: editAirportForm.longitude !== '' ? parseFloat(editAirportForm.longitude) : undefined,
        timezone: editAirportForm.timezone || undefined,
      });
      // Update in local list
      adminAirports = adminAirports.map(a => a.iata === updated.iata ? { ...a, ...updated } : a);
      editAirportSuccess = true;
    } catch (err) {
      editAirportError = err.message ?? 'Failed to update airport';
    }
  }

  async function loadCachedFlights() {
    if (!onLoadCachedFlights) return;
    cachedFlightsLoading = true;
    cachedFlightsError = '';
    try {
      cachedFlights = await onLoadCachedFlights();
    } catch (err) {
      cachedFlightsError = err.message ?? 'Failed to load cached flights';
    } finally {
      cachedFlightsLoading = false;
    }
  }

  async function handleDeleteCachedFlight(id) {
    if (!onDeleteCachedFlight) return;
    try {
      await onDeleteCachedFlight(id);
      cachedFlights = cachedFlights.filter(f => f.id !== id);
    } catch (err) {
      cachedFlightsError = err.message ?? 'Failed to delete';
    }
  }

  async function handleDeleteAllCachedFlights() {
    if (!onDeleteAllCachedFlights) return;
    cachedFlightsDeleteConfirm = false;
    cachedFlightsError = '';
    try {
      await onDeleteAllCachedFlights();
      cachedFlights = [];
    } catch (err) {
      cachedFlightsError = err.message ?? 'Failed to delete all';
    }
  }

  async function handleRefreshCachedFlight(f) {
    if (!onRefreshCachedFlight || refreshingFlightId === f.id) return;
    refreshingFlightId = f.id;
    cachedFlightsError = '';
    try {
      const updated = await onRefreshCachedFlight(f.flightIata, f.flightDate);
      cachedFlights = cachedFlights.map(r => r.id === f.id ? { ...r, ...updated, id: f.id } : r);
      refreshedFlightIds = new Set([...refreshedFlightIds, f.id]);
      setTimeout(() => {
        refreshedFlightIds = new Set([...refreshedFlightIds].filter(id => id !== f.id));
      }, 2000);
    } catch (err) {
      cachedFlightsError = err.message ?? 'Failed to refresh flight';
    } finally {
      refreshingFlightId = null;
    }
  }

  async function handleRefreshAllCachedFlights() {
    if (!onRefreshCachedFlight || refreshingAll) return;
    refreshingAll = true;
    cachedFlightsError = '';
    const results = [];
    for (const f of cachedFlights) {
      try {
        const updated = await onRefreshCachedFlight(f.flightIata, f.flightDate);
        cachedFlights = cachedFlights.map(r => r.id === f.id ? { ...r, ...updated, id: f.id } : r);
        results.push(f.id);
      } catch {
        // continue with remaining flights
      }
    }
    refreshedFlightIds = new Set(results);
    setTimeout(() => { refreshedFlightIds = new Set(); }, 2000);
    refreshingAll = false;
  }

  $: filteredAdminAirports = adminAirportSearch.trim().length >= 1
    ? adminAirports.filter(a => {
        const q = adminAirportSearch.trim().toLowerCase();
        return a.iata?.toLowerCase().includes(q) || a.name?.toLowerCase().includes(q) || a.city?.toLowerCase().includes(q) || a.country?.toLowerCase().includes(q);
      })
    : adminAirports;

  $: if (activeSettingsSection === 'admin-airports' && adminAirports.length === 0 && !adminAirportsLoading) {
    loadAdminAirports();
  }

  $: if (activeSettingsSection === 'admin-flights' && cachedFlights.length === 0 && !cachedFlightsLoading) {
    loadCachedFlights();
  }

  function formatMRZName(firstName, lastName) {
    if (!lastName) return '';
    const normalize = (s) => s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z]/g, '');
    const last = normalize(lastName);
    const first = firstName ? normalize(firstName) : '';
    return first ? `${last}/${first}` : last;
  }

  $: companionsPaneSpan = (addingCompanion || editingCompanion) ? 4 : 3;
  $: loyaltyPaneSpan = (addingLoyalty || editingLoyalty) ? 4 : 3;
  $: adminAirportsPaneSpan = editingAirport ? 4 : 3;
  $: dataPaneColumns = activeSettingsSection === 'data' && importData ? 4 : activeSettingsSection === 'companions' ? companionsPaneSpan : activeSettingsSection === 'loyalty' ? loyaltyPaneSpan : activeSettingsSection === 'admin-airports' ? adminAirportsPaneSpan : activeSettingsSection === 'admin-flights' ? 3 : activeSettingsSection ? 2 : 1;
</script>

<ContentPane columns={isMobileView ? 1 : dataPaneColumns} mobileTop="0">
  <!-- Settings menu column -->
  <PaneColumn span={1}>
    <h3 class="pane-title">Settings</h3>

    <div class="settings-menu">
      <div class="settings-section">
        <h4 class="settings-section-title">Account</h4>
        <button class="settings-option" class:active={activeSettingsSection === 'profile'} on:click={() => selectSection('profile')}>
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

        <button class="settings-option" class:active={activeSettingsSection === 'security'} on:click={() => selectSection('security')}>
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
        <button class="settings-option" class:active={activeSettingsSection === 'companions'} on:click={() => selectSection('companions')}>
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
        <h4 class="settings-section-title">Travel</h4>
        <button class="settings-option" class:active={activeSettingsSection === 'loyalty'} on:click={() => selectSection('loyalty')}>
          <div class="settings-option-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </div>
          <div class="settings-option-content">
            <span class="settings-option-label">Loyalty Programs</span>
            <span class="settings-option-description">Save your frequent flyer and hotel numbers</span>
          </div>
          <svg class="settings-option-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      <div class="settings-section">
        <h4 class="settings-section-title">Data</h4>
        <button class="settings-option" class:active={activeSettingsSection === 'data'} on:click={() => { selectSection('data'); }}>
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

      {#if isAdmin}
      <div class="settings-section">
        <h4 class="settings-section-title settings-section-title--admin">Admin</h4>
        <button class="settings-option" class:active={activeSettingsSection === 'admin-airports'} on:click={() => selectSection('admin-airports')}>
          <div class="settings-option-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
          </div>
          <div class="settings-option-content">
            <span class="settings-option-label">Manage Airports</span>
            <span class="settings-option-description">Edit airport data and timezones</span>
          </div>
          <svg class="settings-option-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        <button class="settings-option" class:active={activeSettingsSection === 'admin-flights'} on:click={() => selectSection('admin-flights')}>
          <div class="settings-option-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
          </div>
          <div class="settings-option-content">
            <span class="settings-option-label">Cached Flights</span>
            <span class="settings-option-description">Manage cached flight lookup data</span>
          </div>
          <svg class="settings-option-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
      {/if}

      <div class="settings-section">
        <button class="settings-option settings-option--danger" on:click={onLogout}>
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

  <!-- Companions section (desktop) -->
  {#if activeSettingsSection === 'companions' && !isMobileView}
    <PaneColumn span={2} divider={true}>
      <div class="edit-header">
        <h3 class="pane-title">Travel Companions</h3>
        <button class="close-button" on:click={() => { if (onSectionChange) onSectionChange(null); closeEditCompanion(); }} aria-label="Close">×</button>
      </div>

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
        <form class="edit-form companion-add-form" on:submit={submitAddCompanion}>
          <div class="form-group">
            <label for="companion-email">Email or Phone Number</label>
            <div class="companions-email-field">
              <input
                type="text"
                id="companion-email"
                bind:value={addCompanionEmail}
                on:input={handleCompanionIdentifierInput}
                on:blur={handleDismissCompanionSuggestions}
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
                      <button type="button" class="attendee-suggestion-item" on:mousedown={() => handleSelectCompanionSuggestion(u)}>
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
              <input type="text" id="companion-first-name" bind:value={addCompanionFirstName} placeholder="First name" required />
            </div>
            <div class="form-group form-group--40">
              <label for="companion-last-initial">Last Initial</label>
              <input type="text" id="companion-last-initial" bind:value={addCompanionLastName} placeholder="e.g. S" maxlength="1" required />
            </div>
          </div>
          {#if addCompanionError}
            <p class="companions-error">{addCompanionError}</p>
          {/if}
          <div class="form-actions">
            <button type="button" class="btn-secondary" on:click={() => { addingCompanion = false; addCompanionEmail = ''; addCompanionFirstName = ''; addCompanionLastName = ''; addCompanionError = ''; }}>Cancel</button>
            <button type="submit" class="btn-primary">Add</button>
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
        <form class="edit-form" on:submit={submitSaveEditCompanion}>
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
            <button type="button" class="btn-danger-outline" on:click={() => submitRemoveCompanion(editingCompanion.companionUser.id)}>Remove</button>
          </div>
        </form>
      </PaneColumn>
    {/if}

  <!-- Loyalty Programs section (desktop) -->
  {:else if activeSettingsSection === 'loyalty' && !isMobileView}
    <PaneColumn span={2} divider={true}>
      <div class="edit-header">
        <h3 class="pane-title">Loyalty Programs</h3>
        <button class="close-button" on:click={() => { if (onSectionChange) onSectionChange(null); closeEditLoyalty(); addingLoyalty = false; }} aria-label="Close">×</button>
      </div>

      {#if loyaltyLoading}
        <p class="companions-empty">Loading...</p>
      {:else if loyaltyPrograms.length === 0}
        <p class="companions-empty">No programs saved yet.
          <button class="companions-add-inline-btn" on:click={() => { addingLoyalty = true; closeEditLoyalty(); }}>+ Add one</button>
        </p>
      {:else}
        <div class="companions-table-wrapper">
          <table class="companions-table loyalty-table">
            <thead>
              <tr>
                <th>Program</th>
                <th>Member #</th>
                <th>Name</th>
                <th class="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {#each loyaltyPrograms as prog}
                <tr class="companion-row" class:selected={editingLoyalty?.id === prog.id}>
                  <td>{prog.programName}</td>
                  <td class="loyalty-member-num">{prog.memberNumber}</td>
                  <td class="loyalty-mrz-name">{formatMRZName(prog.accountFirstName, prog.accountLastName)}</td>
                  <td class="col-actions">
                    <button class="companion-edit-btn" class:active={editingLoyalty?.id === prog.id} on:click={() => openEditLoyalty(prog)} aria-label="Edit">
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
                <td colspan="4" class="companions-table-footer">
                  <button class="companions-add-inline-btn" on:click={() => { addingLoyalty = !addingLoyalty; closeEditLoyalty(); loyaltyFormError = ''; }}>
                    {addingLoyalty ? '− Cancel' : '+ Add New'}
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      {/if}
    </PaneColumn>

    {#if addingLoyalty}
      <PaneColumn span={1} divider={true}>
        <div class="edit-header">
          <h3 class="pane-title">Add Program</h3>
          <button class="close-button" on:click={() => { addingLoyalty = false; loyaltyFormError = ''; }} aria-label="Close">×</button>
        </div>
        <form class="edit-form" on:submit={submitAddLoyalty}>
          <div class="form-group">
            <label for="loyalty-program-name">Program Name</label>
            <input type="text" id="loyalty-program-name" bind:value={loyaltyForm.programName} placeholder="e.g. United MileagePlus" required />
          </div>
          <div class="form-group">
            <label for="loyalty-member-num">Member Number</label>
            <input type="text" id="loyalty-member-num" bind:value={loyaltyForm.memberNumber} placeholder="e.g. UA123456789" required />
          </div>
          <div class="form-group">
            <label for="loyalty-category">Category</label>
            <select id="loyalty-category" bind:value={loyaltyForm.category}>
              <option value="airline">Airline</option>
              <option value="hotel">Hotel</option>
              <option value="car_rental">Car Rental</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label for="loyalty-account-first-name">Account First Name</label>
            <input type="text" id="loyalty-account-first-name" bind:value={loyaltyForm.accountFirstName} placeholder="As shown on account" />
          </div>
          <div class="form-group">
            <label for="loyalty-account-last-name">Account Last Name</label>
            <input type="text" id="loyalty-account-last-name" bind:value={loyaltyForm.accountLastName} placeholder="As shown on account" />
          </div>
          {#if loyaltyFormError}
            <p class="companions-error">{loyaltyFormError}</p>
          {/if}
          <div class="form-actions">
            <button type="button" class="btn-secondary" on:click={() => { addingLoyalty = false; loyaltyFormError = ''; }}>Cancel</button>
            <button type="submit" class="btn-primary">Save</button>
          </div>
        </form>
      </PaneColumn>
    {:else if editingLoyalty}
      <PaneColumn span={1} divider={true}>
        <div class="edit-header">
          <h3 class="pane-title">Edit Program</h3>
          <button class="close-button" on:click={closeEditLoyalty} aria-label="Close">×</button>
        </div>
        <form class="edit-form" on:submit={submitEditLoyalty}>
          <div class="form-group">
            <label for="edit-loyalty-program-name">Program Name</label>
            <input type="text" id="edit-loyalty-program-name" bind:value={editLoyaltyForm.programName} required />
          </div>
          <div class="form-group">
            <label for="edit-loyalty-member-num">Member Number</label>
            <input type="text" id="edit-loyalty-member-num" bind:value={editLoyaltyForm.memberNumber} required />
          </div>
          <div class="form-group">
            <label for="edit-loyalty-category">Category</label>
            <select id="edit-loyalty-category" bind:value={editLoyaltyForm.category}>
              <option value="airline">Airline</option>
              <option value="hotel">Hotel</option>
              <option value="car_rental">Car Rental</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label for="edit-loyalty-account-first-name">Account First Name</label>
            <input type="text" id="edit-loyalty-account-first-name" bind:value={editLoyaltyForm.accountFirstName} placeholder="As shown on account" />
          </div>
          <div class="form-group">
            <label for="edit-loyalty-account-last-name">Account Last Name</label>
            <input type="text" id="edit-loyalty-account-last-name" bind:value={editLoyaltyForm.accountLastName} placeholder="As shown on account" />
          </div>
          {#if editLoyaltyError}
            <p class="companions-error">{editLoyaltyError}</p>
          {/if}
          <div class="form-actions">
            <button type="button" class="btn-secondary" on:click={closeEditLoyalty}>Cancel</button>
            <button type="submit" class="btn-primary">Save</button>
          </div>
          <div class="form-actions-remove">
            <button type="button" class="btn-danger-outline" on:click={() => submitDeleteLoyalty(editingLoyalty.id)}>Remove</button>
          </div>
        </form>
      </PaneColumn>
    {/if}

  <!-- Data section (desktop) -->
  {:else if activeSettingsSection === 'data' && !isMobileView}
    <PaneColumn span={1} divider={true}>
      <div class="edit-header">
        <h3 class="pane-title">Manage Data</h3>
        <button class="close-button" on:click={() => { if (onSectionChange) onSectionChange(null); if (onClearImport) onClearImport(); }} aria-label="Close">×</button>
      </div>

      <div class="manage-data-section">
        <h4 class="manage-data-section-title">Export Data</h4>
        <p class="settings-export-description">Download a copy of all your travel data including trips, flights, hotels, and other items.</p>
        <div class="form-group">
          <button type="button" class="btn-primary" style="width:100%" on:click={onExportData}>Download</button>
        </div>
      </div>

      <div class="manage-data-section">
        <h4 class="manage-data-section-title">Import Data</h4>
        <p class="settings-export-description">Select a previously exported JSON file to import your trips and items.</p>
        <div class="form-group">
          <input
            type="file"
            id="import-file-input"
            accept=".json,application/json"
            style="display:none"
            on:change={onImportFileChange}
          />
          <div
            class="import-drop-zone"
            class:import-drop-zone--active={importDragOver}
            class:import-drop-zone--disabled={importLoading}
            role="button"
            tabindex="0"
            on:click={() => !importLoading && document.getElementById('import-file-input').click()}
            on:keydown={(e) => e.key === 'Enter' && !importLoading && document.getElementById('import-file-input').click()}
            on:dragover={(e) => { e.preventDefault(); if (onImportDragOver) onImportDragOver(); }}
            on:dragleave={() => { if (onImportDragLeave) onImportDragLeave(); }}
            on:drop={onImportDrop}
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
              {#if importSummary.vouchers > 0}, <strong>{importSummary.vouchers}</strong> voucher{importSummary.vouchers !== 1 ? 's' : ''}{/if}{#if importSummary.loyaltyCount > 0}, <strong>{importSummary.loyaltyCount}</strong> loyalty program{importSummary.loyaltyCount !== 1 ? 's' : ''}{/if}
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
            <button type="button" class="btn-secondary" on:click={onClearImport}>Clear</button>
            <button type="button" class="btn-primary" on:click={onExecuteImport} disabled={importSubmitting || importSelectedCount === 0}>
              {importSubmitting ? 'Importing...' : 'Import Selected'}
            </button>
          </div>
        {/if}
      </div>

      <div class="manage-data-section manage-data-section--danger">
        <h4 class="manage-data-section-title manage-data-section-title--danger">
          <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm330.5-51.5Q520-263 520-280t-11.5-28.5Q497-320 480-320t-28.5 11.5Q440-297 440-280t11.5 28.5Q463-240 480-240t28.5-11.5ZM440-360h80v-200h-80v200Zm40-100Z"/></svg>
          DANGER SETTINGS
        </h4>
        <p class="settings-export-description">These actions are permanent and cannot be undone.</p>
        <div class="form-group">
          <button type="button" class="btn-danger" style="width:100%" on:click={onShowDeleteDataModal}>Delete All Trip Data</button>
        </div>
      </div>
    </PaneColumn>

    <!-- Import review list column -->
    {#if importData}
      <PaneColumn span={2} divider={true}>
        <div class="import-review-header">
          <h3 class="pane-title">Review</h3>
          <div class="import-select-controls">
            <button type="button" class="import-select-btn" on:click={onSelectAll}>Select All</button>
            <button type="button" class="import-select-btn" on:click={onDeselectAll}>Deselect All</button>
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
                  if (onImportSelectionChange) onImportSelectionChange(tripKey, e.target.checked, tripItems, trip._importIndex);
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
                  <input type="checkbox" checked={importSelections[itemKey]} on:change={(e) => {
                    if (onImportSelectionChange) onImportSelectionChange(itemKey, e.target.checked);
                  }} />
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
                    <input type="checkbox" checked={importSelections[itemKey]} on:change={(e) => {
                      if (onImportSelectionChange) onImportSelectionChange(itemKey, e.target.checked);
                    }} />
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
                  <input type="checkbox" checked={importSelections[vKey]} on:change={(e) => {
                    if (onImportSelectionChange) onImportSelectionChange(vKey, e.target.checked);
                  }} />
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

          {#if importData.loyaltyPrograms?.length > 0}
            <div class="import-trip-block">
              <div class="import-row import-row--section-header">Loyalty Programs</div>
              {#each importData.loyaltyPrograms as lp (lp._importIndex)}
                {@const lpKey = `loyalty:${lp._importIndex}`}
                <label class="import-row import-row--item">
                  <input type="checkbox" checked={importSelections[lpKey]} on:change={(e) => {
                    if (onImportSelectionChange) onImportSelectionChange(lpKey, e.target.checked);
                  }} />
                  <span class="import-row-type-badge">{lp.category === 'car_rental' ? 'Car Rental' : lp.category?.charAt(0).toUpperCase() + lp.category?.slice(1)}</span>
                  <span class="import-row-name">{lp.programName} — {lp.memberNumber}</span>
                  {#if lp.isDuplicate}
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

  <!-- Admin: Manage Airports (desktop) -->
  {:else if activeSettingsSection === 'admin-airports' && !isMobileView}
    <PaneColumn span={2} divider={true}>
      <div class="edit-header">
        <h3 class="pane-title">Manage Airports</h3>
        <button class="close-button" on:click={() => { if (onSectionChange) onSectionChange(null); closeEditAirport(); adminAirportSearch = ''; }} aria-label="Close">×</button>
      </div>

      {#if adminAirportsLoading}
        <p class="companions-empty">Loading...</p>
      {:else if adminAirportsError}
        <p class="companions-error">{adminAirportsError}</p>
      {:else}
        <div class="admin-search-row">
          <input class="admin-search-input" type="text" placeholder="Search IATA, name, city, or country..." bind:value={adminAirportSearch} />
          <span class="admin-search-count">{filteredAdminAirports.length} / {adminAirports.length}</span>
        </div>
        <div class="companions-table-wrapper">
          <table class="companions-table airports-table">
            <thead>
              <tr>
                <th>IATA</th>
                <th class="col-airport-text">Name</th>
                <th class="col-airport-text">City</th>
                <th class="col-airport-text">Country</th>
                <th class="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {#each filteredAdminAirports as airport (airport.iata)}
                <tr class="companion-row" class:selected={editingAirport?.iata === airport.iata}>
                  <td><code>{airport.iata}</code></td>
                  <td class="col-airport-text">{airport.name}</td>
                  <td class="col-airport-text">{airport.city}</td>
                  <td class="col-airport-text">{airport.country}</td>
                  <td class="col-actions">
                    <button class="companion-edit-btn" class:active={editingAirport?.iata === airport.iata} on:click={() => editingAirport?.iata === airport.iata ? closeEditAirport() : openEditAirport(airport)} aria-label="Edit airport">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </PaneColumn>

    {#if editingAirport}
      <PaneColumn span={1} divider={true}>
        <div class="edit-header">
          <h3 class="pane-title">Edit {editingAirport.iata}</h3>
          <button class="close-button" on:click={closeEditAirport} aria-label="Close">×</button>
        </div>
        <form class="edit-form" on:submit={submitEditAirport}>
          <div class="form-group">
            <label for="admin-airport-name">Name</label>
            <input id="admin-airport-name" type="text" bind:value={editAirportForm.name} />
          </div>
          <div class="form-row">
            <div class="form-group form-group--60">
              <label for="admin-airport-city">City</label>
              <input id="admin-airport-city" type="text" bind:value={editAirportForm.city} />
            </div>
            <div class="form-group form-group--40">
              <label for="admin-airport-country">Country</label>
              <input id="admin-airport-country" type="text" bind:value={editAirportForm.country} />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group form-group--50">
              <label for="admin-airport-icao">ICAO</label>
              <input id="admin-airport-icao" type="text" bind:value={editAirportForm.icao} maxlength="4" />
            </div>
            <div class="form-group form-group--50">
              <label for="admin-airport-tz">Timezone</label>
              <input id="admin-airport-tz" type="text" bind:value={editAirportForm.timezone} placeholder="America/New_York" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group form-group--50">
              <label for="admin-airport-lat">Latitude</label>
              <input id="admin-airport-lat" type="number" step="any" bind:value={editAirportForm.latitude} />
            </div>
            <div class="form-group form-group--50">
              <label for="admin-airport-lon">Longitude</label>
              <input id="admin-airport-lon" type="number" step="any" bind:value={editAirportForm.longitude} />
            </div>
          </div>
          {#if editAirportError}
            <p class="companions-error">{editAirportError}</p>
          {/if}
          {#if editAirportSuccess}
            <p class="profile-save-success">Saved.</p>
          {/if}
          <div class="form-actions">
            <button type="button" class="btn-secondary" on:click={closeEditAirport}>Cancel</button>
            <button type="submit" class="btn-primary">Save</button>
          </div>
        </form>
      </PaneColumn>
    {/if}

  <!-- Admin: Cached Flights (desktop) -->
  {:else if activeSettingsSection === 'admin-flights' && !isMobileView}
    <PaneColumn span={2} divider={true}>
      <div class="edit-header">
        <h3 class="pane-title">Cached Flights</h3>
        <button class="close-button" on:click={() => { if (onSectionChange) onSectionChange(null); cachedFlightsDeleteConfirm = false; }} aria-label="Close">×</button>
      </div>

      {#if cachedFlightsError}
        <p class="companions-error">{cachedFlightsError}</p>
      {/if}

      {#if cachedFlightsLoading}
        <p class="companions-empty">Loading...</p>
      {:else if cachedFlights.length === 0}
        <p class="companions-empty">No cached flight lookups.</p>
      {:else}
        <div class="companions-table-wrapper">
          <table class="companions-table">
            <thead>
              <tr>
                <th>Flight</th>
                <th>Date</th>
                <th>Route</th>
                <th>Status</th>
                <th>Fetched</th>
                <th class="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {#each cachedFlights as f (f.id)}
                <tr class="companion-row" class:cache-row-refreshed={refreshedFlightIds.has(f.id)}>
                  <td><code>{f.flightIata}</code></td>
                  <td>{f.flightDate}</td>
                  <td>{f.depIata ?? '?'} → {f.arrIata ?? '?'}</td>
                  <td>{f.flightStatus ?? '—'}</td>
                  <td class="admin-tz-cell">{f.apiLastFetched ? new Date(f.apiLastFetched).toLocaleDateString() : '—'}</td>
                  <td class="col-actions col-actions-multi">
                    <div class="col-actions-btns">
                      <button class="companion-edit-btn" class:cache-refreshed={refreshedFlightIds.has(f.id)} on:click={() => handleRefreshCachedFlight(f)} aria-label="Refresh flight data" disabled={refreshingFlightId === f.id || refreshingAll}>
                        {#if refreshedFlightIds.has(f.id)}
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        {:else}
                          <svg class:spin={refreshingFlightId === f.id || refreshingAll} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="23 4 23 10 17 10"/>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                          </svg>
                        {/if}
                      </button>
                      <button class="companion-edit-btn companion-edit-btn--danger" on:click={() => handleDeleteCachedFlight(f.id)} aria-label="Delete cached flight" disabled={refreshingFlightId === f.id || refreshingAll}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="6" class="companions-table-footer">
                  {#if cachedFlightsDeleteConfirm}
                    <span class="admin-confirm-inline">
                      Delete all {cachedFlights.length} records?
                      <button class="companions-add-inline-btn companions-add-inline-btn--danger" on:click={handleDeleteAllCachedFlights}>Yes, delete all</button>
                      <button class="companions-add-inline-btn" on:click={() => cachedFlightsDeleteConfirm = false}>Cancel</button>
                    </span>
                  {:else}
                    <button class="companions-add-inline-btn" on:click={handleRefreshAllCachedFlights} disabled={refreshingAll}>
                      {refreshingAll ? 'Refreshing...' : '↻ Refresh All'}
                    </button>
                    <button class="companions-add-inline-btn companions-add-inline-btn--danger" on:click={() => cachedFlightsDeleteConfirm = true}>Delete All</button>
                  {/if}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      {/if}
    </PaneColumn>

  <!-- Profile / Security section (desktop) -->
  {:else if activeSettingsSection && !isMobileView}
    <PaneColumn span={1} divider={true}>
      <div class="edit-header">
        <h3 class="pane-title">
          {#if activeSettingsSection === 'profile'}Profile
          {:else if activeSettingsSection === 'security'}Password & Security
          {/if}
        </h3>
        <button class="close-button" on:click={() => { if (onSectionChange) onSectionChange(null); }} aria-label="Close">×</button>
      </div>

      {#if activeSettingsSection === 'profile'}
        <form class="edit-form" on:submit={onSaveProfile}>
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
            <button type="button" class="btn-secondary" on:click={() => { if (onSectionChange) onSectionChange(null); }}>Cancel</button>
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
            <button type="button" class="btn-secondary" on:click={() => { if (onSectionChange) onSectionChange(null); }}>Cancel</button>
            <button type="submit" class="btn-primary">Update</button>
          </div>
        </form>
      {/if}
    </PaneColumn>
  {/if}
</ContentPane>

<!-- Mobile settings bottom sheet -->
{#if isMobileView && showSettingsSheet}
  <div class="edit-sheet-backdrop" on:click={closeSheet}></div>
  <div class="edit-sheet edit-sheet-open">
    <div class="filter-sheet-handle"></div>
    <div class="edit-sheet-scroll">
      <div class="filter-sheet-header">
        <h3 class="pane-title" style="margin:0">
          {#if activeSettingsSection === 'profile'}Profile
          {:else if activeSettingsSection === 'security'}Password & Security
          {:else if activeSettingsSection === 'companions'}
            {#if addingCompanion}Add Companion
            {:else if editingCompanion}Edit Companion
            {:else}Travel Companions
            {/if}
          {:else if activeSettingsSection === 'loyalty'}
            {#if addingLoyalty}Add Program
            {:else if editingLoyalty}Edit Program
            {:else}Loyalty Programs
            {/if}
          {:else if activeSettingsSection === 'data'}Manage Data
          {:else if activeSettingsSection === 'admin-airports'}Manage Airports
          {:else if activeSettingsSection === 'admin-flights'}Cached Flights
          {/if}
        </h3>
        <button class="close-btn" on:click={closeSheet}>✕</button>
      </div>

      {#if activeSettingsSection === 'profile'}
        <form class="edit-form" on:submit={onSaveProfile}>
          <div class="form-row">
            <div class="form-group form-group--60">
              <label for="settings-sheet-first-name">First Name</label>
              <input type="text" id="settings-sheet-first-name" bind:value={profileForm.firstName} placeholder="Your first name" />
            </div>
            <div class="form-group form-group--40">
              <label for="settings-sheet-last-name">Last Initial</label>
              <input type="text" id="settings-sheet-last-name" bind:value={profileForm.lastName} placeholder="e.g. S" maxlength="1" />
            </div>
          </div>
          <div class="form-group">
            <label for="settings-sheet-email">Email</label>
            <input type="email" id="settings-sheet-email" bind:value={profileForm.email} placeholder="you@example.com" disabled />
          </div>
          <div class="form-group">
            <label for="settings-sheet-phone">Phone Number</label>
            <PhoneInput
              id="settings-sheet-phone"
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
            <button type="button" class="btn-secondary" on:click={() => { showSettingsSheet = false; if (onSectionChange) onSectionChange(null); }}>Cancel</button>
            <button type="submit" class="btn-primary">Update</button>
          </div>
        </form>

      {:else if activeSettingsSection === 'security'}
        <form class="edit-form">
          <div class="form-group">
            <label for="settings-sheet-current-password">Current Password</label>
            <input type="password" id="settings-sheet-current-password" placeholder="Enter current password" />
          </div>
          <div class="form-group">
            <label for="settings-sheet-new-password">New Password</label>
            <input type="password" id="settings-sheet-new-password" placeholder="Enter new password" />
          </div>
          <div class="form-group">
            <label for="settings-sheet-confirm-password">Confirm New Password</label>
            <input type="password" id="settings-sheet-confirm-password" placeholder="Confirm new password" />
          </div>
          <div class="form-actions">
            <button type="button" class="btn-secondary" on:click={() => { showSettingsSheet = false; if (onSectionChange) onSectionChange(null); }}>Cancel</button>
            <button type="submit" class="btn-primary">Update</button>
          </div>
        </form>

      {:else if activeSettingsSection === 'companions'}
        {#if addingCompanion}
          <form class="edit-form companion-add-form" on:submit={submitAddCompanion}>
            <div class="form-group">
              <label for="companion-sheet-email">Email or Phone Number</label>
              <div class="companions-email-field">
                <input
                  type="text"
                  id="companion-sheet-email"
                  bind:value={addCompanionEmail}
                  on:input={handleCompanionIdentifierInput}
                  on:blur={handleDismissCompanionSuggestions}
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
                        <button type="button" class="attendee-suggestion-item" on:mousedown={() => handleSelectCompanionSuggestion(u)}>
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
                <label for="companion-sheet-first-name">First Name</label>
                <input type="text" id="companion-sheet-first-name" bind:value={addCompanionFirstName} placeholder="First name" required />
              </div>
              <div class="form-group form-group--40">
                <label for="companion-sheet-last-initial">Last Initial</label>
                <input type="text" id="companion-sheet-last-initial" bind:value={addCompanionLastName} placeholder="e.g. S" maxlength="1" required />
              </div>
            </div>
            {#if addCompanionError}
              <p class="companions-error">{addCompanionError}</p>
            {/if}
            <div class="form-actions">
              <button type="button" class="btn-secondary" on:click={() => { addingCompanion = false; addCompanionEmail = ''; addCompanionFirstName = ''; addCompanionLastName = ''; addCompanionError = ''; }}>Cancel</button>
              <button type="submit" class="btn-primary">Add</button>
            </div>
          </form>

        {:else if editingCompanion}
          <div class="companion-edit-identity">
            <div class="companion-avatar companion-avatar-lg">
              {editingCompanion.companionUser.firstName[0]}{editingCompanion.companionUser.lastName[0]}
            </div>
            <div class="companion-info">
              <span class="companion-name">{editingCompanion.companionUser.firstName} {editingCompanion.companionUser.lastName}.</span>
              <span class="companion-email">{editingCompanion.companionUser.email ?? editingCompanion.companionUser.phone ?? ''}</span>
            </div>
          </div>
          <form class="edit-form" on:submit={submitSaveEditCompanion}>
            <div class="form-group">
              <label for="edit-companion-sheet-permission">My permission level for them</label>
              <select id="edit-companion-sheet-permission" bind:value={editCompanionPermission} class="edit-companion-select">
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
              <button type="button" class="btn-danger-outline" on:click={() => submitRemoveCompanion(editingCompanion.companionUser.id)}>Remove</button>
            </div>
          </form>

        {:else}
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
                        <span class="perm-dot" class:active={companion.permissionLevel === 'view' || companion.permissionLevel === 'manage_all'}></span>
                      </td>
                      <td class="col-perm">
                        <span class="perm-dot" class:active={companion.permissionLevel === 'manage_all'}></span>
                      </td>
                      <td class="col-perm col-perm-divider">
                        <span class="perm-dot" class:active={companion.reversePermissionLevel === 'view' || companion.reversePermissionLevel === 'manage_all'}></span>
                      </td>
                      <td class="col-perm">
                        <span class="perm-dot" class:active={companion.reversePermissionLevel === 'manage_all'}></span>
                      </td>
                      <td class="col-actions">
                        <button class="companion-edit-btn" class:active={editingCompanion?.id === companion.id} on:click={() => openEditCompanion(companion)} aria-label="Edit companion">
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
        {/if}

      {:else if activeSettingsSection === 'loyalty'}
        {#if addingLoyalty}
          <form class="edit-form" on:submit={submitAddLoyalty}>
            <div class="form-group">
              <label for="loyalty-sheet-program-name">Program Name</label>
              <input type="text" id="loyalty-sheet-program-name" bind:value={loyaltyForm.programName} placeholder="e.g. United MileagePlus" required />
            </div>
            <div class="form-group">
              <label for="loyalty-sheet-member-num">Member Number</label>
              <input type="text" id="loyalty-sheet-member-num" bind:value={loyaltyForm.memberNumber} placeholder="e.g. UA123456789" required />
            </div>
            <div class="form-group">
              <label for="loyalty-sheet-category">Category</label>
              <select id="loyalty-sheet-category" bind:value={loyaltyForm.category}>
                <option value="airline">Airline</option>
                <option value="hotel">Hotel</option>
                <option value="car_rental">Car Rental</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="form-group">
              <label for="loyalty-sheet-account-first-name">Account First Name</label>
              <input type="text" id="loyalty-sheet-account-first-name" bind:value={loyaltyForm.accountFirstName} placeholder="As shown on account" />
            </div>
            <div class="form-group">
              <label for="loyalty-sheet-account-last-name">Account Last Name</label>
              <input type="text" id="loyalty-sheet-account-last-name" bind:value={loyaltyForm.accountLastName} placeholder="As shown on account" />
            </div>
            {#if loyaltyFormError}
              <p class="companions-error">{loyaltyFormError}</p>
            {/if}
            <div class="form-actions">
              <button type="button" class="btn-secondary" on:click={() => { addingLoyalty = false; loyaltyFormError = ''; }}>Cancel</button>
              <button type="submit" class="btn-primary">Save</button>
            </div>
          </form>

        {:else if editingLoyalty}
          <form class="edit-form" on:submit={submitEditLoyalty}>
            <div class="form-group">
              <label for="edit-loyalty-sheet-program-name">Program Name</label>
              <input type="text" id="edit-loyalty-sheet-program-name" bind:value={editLoyaltyForm.programName} required />
            </div>
            <div class="form-group">
              <label for="edit-loyalty-sheet-member-num">Member Number</label>
              <input type="text" id="edit-loyalty-sheet-member-num" bind:value={editLoyaltyForm.memberNumber} required />
            </div>
            <div class="form-group">
              <label for="edit-loyalty-sheet-category">Category</label>
              <select id="edit-loyalty-sheet-category" bind:value={editLoyaltyForm.category}>
                <option value="airline">Airline</option>
                <option value="hotel">Hotel</option>
                <option value="car_rental">Car Rental</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="form-group">
              <label for="edit-loyalty-sheet-account-first-name">Account First Name</label>
              <input type="text" id="edit-loyalty-sheet-account-first-name" bind:value={editLoyaltyForm.accountFirstName} placeholder="As shown on account" />
            </div>
            <div class="form-group">
              <label for="edit-loyalty-sheet-account-last-name">Account Last Name</label>
              <input type="text" id="edit-loyalty-sheet-account-last-name" bind:value={editLoyaltyForm.accountLastName} placeholder="As shown on account" />
            </div>
            {#if editLoyaltyError}
              <p class="companions-error">{editLoyaltyError}</p>
            {/if}
            <div class="form-actions">
              <button type="button" class="btn-secondary" on:click={closeEditLoyalty}>Cancel</button>
              <button type="submit" class="btn-primary">Save</button>
            </div>
            <div class="form-actions-remove">
              <button type="button" class="btn-danger-outline" on:click={() => submitDeleteLoyalty(editingLoyalty.id)}>Remove</button>
            </div>
          </form>

        {:else}
          {#if loyaltyLoading}
            <p class="companions-empty">Loading...</p>
          {:else if loyaltyPrograms.length === 0}
            <p class="companions-empty">No programs saved yet.
              <button class="companions-add-inline-btn" on:click={() => { addingLoyalty = true; closeEditLoyalty(); }}>+ Add one</button>
            </p>
          {:else}
            <div class="companions-table-wrapper">
              <table class="companions-table loyalty-table">
                <thead>
                  <tr>
                    <th>Program</th>
                    <th>Member #</th>
                    <th>Name</th>
                    <th class="col-actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each loyaltyPrograms as prog}
                    <tr class="companion-row" class:selected={editingLoyalty?.id === prog.id}>
                      <td>{prog.programName}</td>
                      <td class="loyalty-member-num">{prog.memberNumber}</td>
                      <td class="loyalty-mrz-name">{formatMRZName(prog.accountFirstName, prog.accountLastName)}</td>
                      <td class="col-actions">
                        <button class="companion-edit-btn" on:click={() => openEditLoyalty(prog)} aria-label="Edit">
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
                    <td colspan="4" class="companions-table-footer">
                      <button class="companions-add-inline-btn" on:click={() => { addingLoyalty = true; closeEditLoyalty(); loyaltyFormError = ''; }}>
                        + Add New
                      </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          {/if}
        {/if}

      {:else if activeSettingsSection === 'data'}
        <div class="manage-data-section">
          <h4 class="manage-data-section-title">Export Data</h4>
          <p class="settings-export-description">Download a copy of all your travel data including trips, flights, hotels, and other items.</p>
          <div class="form-group">
            <button type="button" class="btn-primary" style="width:100%" on:click={onExportData}>Download</button>
          </div>
        </div>

        <div class="manage-data-section">
          <h4 class="manage-data-section-title">Import Data</h4>
          <p class="settings-export-description">Select a previously exported JSON file to import your trips and items.</p>
          <div class="form-group">
            <input
              type="file"
              id="import-file-input-sheet"
              accept=".json,application/json"
              style="display:none"
              on:change={onImportFileChange}
            />
            <div
              class="import-drop-zone"
              class:import-drop-zone--active={importDragOver}
              class:import-drop-zone--disabled={importLoading}
              role="button"
              tabindex="0"
              on:click={() => !importLoading && document.getElementById('import-file-input-sheet').click()}
              on:keydown={(e) => e.key === 'Enter' && !importLoading && document.getElementById('import-file-input-sheet').click()}
              on:dragover={(e) => { e.preventDefault(); if (onImportDragOver) onImportDragOver(); }}
              on:dragleave={() => { if (onImportDragLeave) onImportDragLeave(); }}
              on:drop={onImportDrop}
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
                {#if importSummary.vouchers > 0}, <strong>{importSummary.vouchers}</strong> voucher{importSummary.vouchers !== 1 ? 's' : ''}{/if}{#if importSummary.loyaltyCount > 0}, <strong>{importSummary.loyaltyCount}</strong> loyalty program{importSummary.loyaltyCount !== 1 ? 's' : ''}{/if}
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

            <div class="import-review-header">
              <h3 class="pane-title" style="margin:0">Review</h3>
              <div class="import-select-controls">
                <button type="button" class="import-select-btn" on:click={onSelectAll}>Select All</button>
                <button type="button" class="import-select-btn" on:click={onDeselectAll}>Deselect All</button>
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
                      if (onImportSelectionChange) onImportSelectionChange(tripKey, e.target.checked, tripItems, trip._importIndex);
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
                      <input type="checkbox" checked={importSelections[itemKey]} on:change={(e) => {
                        if (onImportSelectionChange) onImportSelectionChange(itemKey, e.target.checked);
                      }} />
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
                        <input type="checkbox" checked={importSelections[itemKey]} on:change={(e) => {
                          if (onImportSelectionChange) onImportSelectionChange(itemKey, e.target.checked);
                        }} />
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
                      <input type="checkbox" checked={importSelections[vKey]} on:change={(e) => {
                        if (onImportSelectionChange) onImportSelectionChange(vKey, e.target.checked);
                      }} />
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

              {#if importData.loyaltyPrograms?.length > 0}
                <div class="import-trip-block">
                  <div class="import-row import-row--section-header">Loyalty Programs</div>
                  {#each importData.loyaltyPrograms as lp (lp._importIndex)}
                    {@const lpKey = `loyalty:${lp._importIndex}`}
                    <label class="import-row import-row--item">
                      <input type="checkbox" checked={importSelections[lpKey]} on:change={(e) => {
                        if (onImportSelectionChange) onImportSelectionChange(lpKey, e.target.checked);
                      }} />
                      <span class="import-row-type-badge">{lp.category === 'car_rental' ? 'Car Rental' : lp.category?.charAt(0).toUpperCase() + lp.category?.slice(1)}</span>
                      <span class="import-row-name">{lp.programName} — {lp.memberNumber}</span>
                      {#if lp.isDuplicate}
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

            <div class="form-actions">
              <button type="button" class="btn-secondary" on:click={onClearImport}>Clear</button>
              <button type="button" class="btn-primary" on:click={onExecuteImport} disabled={importSubmitting || importSelectedCount === 0}>
                {importSubmitting ? 'Importing...' : 'Import Selected'}
              </button>
            </div>
          {/if}
        </div>

        <div class="manage-data-section manage-data-section--danger">
          <h4 class="manage-data-section-title manage-data-section-title--danger">
            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm330.5-51.5Q520-263 520-280t-11.5-28.5Q497-320 480-320t-28.5 11.5Q440-297 440-280t11.5 28.5Q463-240 480-240t28.5-11.5ZM440-360h80v-200h-80v200Zm40-100Z"/></svg>
            DANGER SETTINGS
          </h4>
          <p class="settings-export-description">These actions are permanent and cannot be undone.</p>
          <div class="form-group">
            <button type="button" class="btn-danger" style="width:100%" on:click={onShowDeleteDataModal}>Delete All Trip Data</button>
          </div>
        </div>
      {:else if activeSettingsSection === 'admin-airports'}
        {#if adminAirportsError}
          <p class="companions-error">{adminAirportsError}</p>
        {/if}
        {#if adminAirportsLoading}
          <p class="companions-empty">Loading...</p>
        {:else}
          <div class="admin-search-row">
            <input class="admin-search-input" type="text" placeholder="Search IATA, name, city, or country..." bind:value={adminAirportSearch} />
          </div>
          <div class="companions-table-wrapper">
            <table class="companions-table">
              <thead>
                <tr>
                  <th>IATA</th>
                  <th>Name</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {#each filteredAdminAirports as airport (airport.iata)}
                  <tr>
                    <td><code>{airport.iata}</code></td>
                    <td>{airport.name}</td>
                    <td>
                      <button class="companion-edit-btn" class:active={editingAirport?.iata === airport.iata} on:click={() => editingAirport?.iata === airport.iata ? closeEditAirport() : openEditAirport(airport)}>Edit</button>
                    </td>
                  </tr>
                  {#if editingAirport?.iata === airport.iata}
                    <tr>
                      <td colspan="4">
                        <form class="edit-form admin-inline-form" on:submit={submitEditAirport}>
                          <div class="form-group">
                            <label for="admin-mob-name">Name</label>
                            <input id="admin-mob-name" type="text" bind:value={editAirportForm.name} />
                          </div>
                          <div class="form-row">
                            <div class="form-group form-group--50">
                              <label for="admin-mob-city">City</label>
                              <input id="admin-mob-city" type="text" bind:value={editAirportForm.city} />
                            </div>
                            <div class="form-group form-group--50">
                              <label for="admin-mob-country">Country</label>
                              <input id="admin-mob-country" type="text" bind:value={editAirportForm.country} />
                            </div>
                          </div>
                          <div class="form-row">
                            <div class="form-group form-group--50">
                              <label for="admin-mob-icao">ICAO</label>
                              <input id="admin-mob-icao" type="text" bind:value={editAirportForm.icao} maxlength="4" />
                            </div>
                            <div class="form-group form-group--50">
                              <label for="admin-mob-tz">Timezone</label>
                              <input id="admin-mob-tz" type="text" bind:value={editAirportForm.timezone} />
                            </div>
                          </div>
                          <div class="form-row">
                            <div class="form-group form-group--50">
                              <label for="admin-mob-lat">Lat</label>
                              <input id="admin-mob-lat" type="number" step="any" bind:value={editAirportForm.latitude} />
                            </div>
                            <div class="form-group form-group--50">
                              <label for="admin-mob-lon">Lon</label>
                              <input id="admin-mob-lon" type="number" step="any" bind:value={editAirportForm.longitude} />
                            </div>
                          </div>
                          {#if editAirportError}<p class="companions-error">{editAirportError}</p>{/if}
                          {#if editAirportSuccess}<p class="profile-save-success">Saved.</p>{/if}
                          <div class="form-actions">
                            <button type="button" class="btn-secondary" on:click={closeEditAirport}>Cancel</button>
                            <button type="submit" class="btn-primary">Save</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  {/if}
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

      {:else if activeSettingsSection === 'admin-flights'}
        {#if cachedFlightsError}
          <p class="companions-error">{cachedFlightsError}</p>
        {/if}
        {#if cachedFlightsLoading}
          <p class="companions-empty">Loading...</p>
        {:else if cachedFlights.length === 0}
          <p class="companions-empty">No cached flight lookups.</p>
        {:else}
          <div class="companions-table-wrapper">
            <table class="companions-table">
              <thead>
                <tr><th>Flight</th><th>Date</th><th>Route</th><th class="col-actions col-actions-multi"></th></tr>
              </thead>
              <tbody>
                {#each cachedFlights as f (f.id)}
                  <tr class="companion-row" class:cache-row-refreshed={refreshedFlightIds.has(f.id)}>
                    <td><code>{f.flightIata}</code></td>
                    <td>{f.flightDate}</td>
                    <td>{f.depIata ?? '?'} → {f.arrIata ?? '?'}</td>
                    <td class="col-actions col-actions-multi">
                      <div class="col-actions-btns">
                        <button class="companion-edit-btn" class:cache-refreshed={refreshedFlightIds.has(f.id)} on:click={() => handleRefreshCachedFlight(f)} aria-label="Refresh" disabled={refreshingFlightId === f.id || refreshingAll}>
                          {#if refreshedFlightIds.has(f.id)}
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          {:else}
                            <svg class:spin={refreshingFlightId === f.id || refreshingAll} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <polyline points="23 4 23 10 17 10"/>
                              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                            </svg>
                          {/if}
                        </button>
                        <button class="companion-edit-btn companion-edit-btn--danger" on:click={() => handleDeleteCachedFlight(f.id)} aria-label="Delete" disabled={refreshingFlightId === f.id || refreshingAll}>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="4" class="companions-table-footer">
                    {#if cachedFlightsDeleteConfirm}
                      <span class="admin-confirm-inline">
                        Delete all {cachedFlights.length} records?
                        <button class="companions-add-inline-btn companions-add-inline-btn--danger" on:click={handleDeleteAllCachedFlights}>Yes, delete all</button>
                        <button class="companions-add-inline-btn" on:click={() => cachedFlightsDeleteConfirm = false}>Cancel</button>
                      </span>
                    {:else}
                      <button class="companions-add-inline-btn" on:click={handleRefreshAllCachedFlights} disabled={refreshingAll}>
                        {refreshingAll ? 'Refreshing...' : '↻ Refresh All'}
                      </button>
                      <button class="companions-add-inline-btn companions-add-inline-btn--danger" on:click={() => cachedFlightsDeleteConfirm = true}>Delete All</button>
                    {/if}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        {/if}
      {/if}

    </div>
  </div>
{/if}

<style>
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

  .settings-export-description {
    font-size: 0.85rem;
    color: var(--gray-text);
    margin: 0 0 var(--spacing-sm) 0;
    line-height: 1.5;
  }

  .manage-data-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding-bottom: var(--spacing-xl);
    border-bottom: 1px solid var(--glass-border);
    margin-bottom: var(--spacing-xl);
  }

  .manage-data-section--danger {
    border-color: #fca5a5;
    background: #fff5f5;
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
    border: 1px solid #fca5a5;
    margin-bottom: 0;
    padding-bottom: var(--spacing-lg);
  }

  .manage-data-section-title--danger {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    color: #dc2626;
  }

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

  .import-review-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-md);
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

  .profile-save-success {
    margin: var(--spacing-sm) 0 0 0;
    font-size: 0.8rem;
    color: #22c55e;
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

  .companions-empty {
    font-size: 0.85rem;
    color: var(--gray-text);
    margin: 0;
  }

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

  .col-actions-multi {
    width: 68px;
    text-align: right;
  }

  .col-actions-btns {
    display: flex;
    gap: 2px;
    justify-content: flex-end;
    align-items: center;
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

  .settings-section-title--admin {
    color: var(--primary-color);
  }

  .admin-search-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
  }

  .admin-search-input {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--glass-border-dark);
    border-radius: var(--radius-md);
    font-size: 0.85rem;
    background: var(--glass-bg-medium);
    color: var(--dark-text);
    font-family: inherit;
    transition: border-color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast);
    box-sizing: border-box;
  }

  .admin-search-input::placeholder {
    color: var(--gray-light);
  }

  .admin-search-input:focus {
    outline: none;
    border-color: var(--primary-color);
    background: var(--white);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .admin-search-count {
    font-size: 0.78rem;
    color: var(--grey-500);
    white-space: nowrap;
  }

  .admin-tz-cell {
    font-size: 0.78rem;
    color: var(--grey-600);
  }

  .airports-table {
    table-layout: fixed;
  }

  .airports-table th:first-child,
  .airports-table td:first-child {
    width: 3.5rem;
    white-space: nowrap;
  }

  .airports-table .col-airport-text {
    width: calc((100% - 3.5rem - 36px) / 3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .companions-add-inline-btn--danger {
    color: var(--error-color);
  }

  .companions-add-inline-btn--danger:hover {
    color: var(--error-color);
  }

  .admin-confirm-inline {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    font-size: 0.78rem;
    color: var(--grey-600);
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .spin {
    animation: spin 0.8s linear infinite;
    transform-origin: center;
  }

  .cache-refreshed {
    color: var(--success-color, #22c55e);
    border-color: transparent;
  }

  .cache-refreshed:hover {
    background: color-mix(in srgb, var(--success-color, #22c55e) 10%, transparent);
  }

  .cache-row-refreshed td {
    transition: background 0.3s;
    background: color-mix(in srgb, var(--success-color, #22c55e) 6%, transparent);
  }

  .companion-edit-btn--danger {
    color: var(--error-color);
  }

  .companion-edit-btn--danger:hover {
    background: color-mix(in srgb, var(--error-color) 10%, transparent);
    border-color: color-mix(in srgb, var(--error-color) 40%, transparent);
  }

  .admin-inline-form {
    padding: var(--spacing-sm) 0;
  }

  @media (max-width: 640px) {
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
  }
</style>
