<script>
  export let activePane = null;
  export let onTogglePane = null; // (pane) => void
</script>

<nav class="side-nav">
  <button
    class="nav-square"
    class:active={activePane === 'addNew'}
    title="Add New"
    aria-label="Add New"
    on:click={() => onTogglePane && onTogglePane('addNew')}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
    <span class="nav-label">Add</span>
  </button>

  <button
    class="nav-square"
    class:active={activePane === 'timeline'}
    title="Timeline"
    aria-label="Timeline"
    on:click={() => onTogglePane && onTogglePane('timeline')}
  >
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M120-240q-33 0-56.5-23.5T40-320q0-33 23.5-56.5T120-400h10.5q4.5 0 9.5 2l182-182q-2-5-2-9.5V-600q0-33 23.5-56.5T400-680q33 0 56.5 23.5T480-600q0 2-2 20l102 102q5-2 9.5-2h21q4.5 0 9.5 2l142-142q-2-5-2-9.5V-640q0-33 23.5-56.5T840-720q33 0 56.5 23.5T920-640q0 33-23.5 56.5T840-560h-10.5q-4.5 0-9.5-2L678-420q2 5 2 9.5v10.5q0 33-23.5 56.5T600-320q-33 0-56.5-23.5T520-400v-10.5q0-4.5 2-9.5L420-522q-5 2-9.5 2H400q-2 0-20-2L198-340q2 5 2 9.5v10.5q0 33-23.5 56.5T120-240Z"/></svg>
    <span class="nav-label">Timeline</span>
  </button>

  <button
    class="nav-square"
    class:active={activePane === 'shared'}
    title="Friends' Trips"
    aria-label="Friends' Trips"
    on:click={() => onTogglePane && onTogglePane('shared')}
  >
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M480-40 360-160H200q-33 0-56.5-23.5T120-240v-560q0-33 23.5-56.5T200-880h560q33 0 56.5 23.5T840-800v560q0 33-23.5 56.5T760-160H600L480-40ZM200-286q54-53 125.5-83.5T480-400q83 0 154.5 30.5T760-286v-514H200v514Zm379-235q41-41 41-99t-41-99q-41-41-99-41t-99 41q-41 41-41 99t41 99q41 41 99 41t99-41ZM280-240h400v-10q-42-35-93-52.5T480-320q-56 0-107 17.5T280-250v10Zm157.5-337.5Q420-595 420-620t17.5-42.5Q455-680 480-680t42.5 17.5Q540-645 540-620t-17.5 42.5Q505-560 480-560t-42.5-17.5ZM480-543Z"/></svg>
    <span class="nav-label">Friends</span>
  </button>

  <button
    class="nav-square"
    class:active={activePane === 'calendar'}
    title="Calendar"
    aria-label="Calendar"
    on:click={() => onTogglePane && onTogglePane('calendar')}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
    <span class="nav-label">Calendar</span>
  </button>

  <button
    class="nav-square"
    class:active={activePane === 'settings'}
    title="Settings"
    aria-label="Settings"
    on:click={() => onTogglePane && onTogglePane('settings')}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
    <span class="nav-label">Settings</span>
  </button>
</nav>

<style>
  /* ── Desktop: vertical floating buttons ── */
  .side-nav {
    position: absolute;
    top: 2.5vh;
    left: 2.5vh;
    display: flex;
    flex-direction: column;
    gap: 2vh;
    z-index: var(--z-modal-backdrop);
  }

  .nav-label {
    display: none;
  }

  .nav-square {
    width: var(--nav-btn-size);
    height: var(--nav-btn-size);
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
    width: clamp(16px, 1.75vw, 22px);
    height: clamp(16px, 1.75vw, 22px);
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

  /* ── Mobile: solid tab bar at bottom ── */
  @media (max-width: 640px) {
    .side-nav {
      position: fixed;
      top: auto;
      left: 0;
      bottom: 0;
      right: 0;
      width: 100%;
      flex-direction: row;
      justify-content: space-around;
      align-items: stretch;
      gap: 0;
      padding-bottom: env(safe-area-inset-bottom, 0px);
      border-radius: 0;
      background: var(--white);
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      border: none;
      border-top: 1px solid var(--border-color);
      box-shadow: 0 -1px 0 var(--border-color), var(--shadow-top);
      z-index: var(--z-modal-backdrop);
    }

    .nav-label {
      display: block;
      font-size: 10px;
      font-weight: 500;
      line-height: 1;
      letter-spacing: 0.01em;
      margin-top: 3px;
    }

    .nav-square {
      flex: 1;
      height: 52px;
      width: auto;
      border-radius: 0;
      background: transparent;
      border: none;
      box-shadow: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0;
      color: var(--gray-text);
      transition: color var(--transition-fast), background var(--transition-fast);
    }

    .nav-square svg {
      width: 22px;
      height: 22px;
    }

    .nav-square:hover {
      background: var(--grey-50);
      transform: none;
      box-shadow: none;
      color: var(--primary-color);
    }

    .nav-square:active {
      transform: none;
      background: var(--grey-100);
    }

    .nav-square.active {
      background: transparent;
      border: none;
      color: var(--primary-color);
    }

    .nav-square.active .nav-label {
      font-weight: 600;
    }
  }
</style>
