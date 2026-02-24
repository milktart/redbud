<script>
  import { Link } from 'svelte-routing';
  import { onMount, onDestroy } from 'svelte';

  onMount(() => document.body.classList.add('scrollable'));
  onDestroy(() => document.body.classList.remove('scrollable'));
</script>

<div class="container">
  <header class="header">
    <div class="header-content">
      <h1>Redbud</h1>
      <nav class="header-nav">
        <Link to="/login" class="btn btn-sm btn-outline">Log In</Link>
        <Link to="/register" class="btn btn-sm btn-primary">Register</Link>
      </nav>
    </div>
  </header>

  <main class="main-content">
    <div class="hero">
      <h2>Plan your trip.<br><span class="hero-accent">Travel together.</span></h2>
      <p>Organize flights, hotels, events, and more in one place. Share itineraries with your travel companions in real time.</p>
      <div class="cta-buttons">
        <Link to="/register" class="btn btn-primary">Get started</Link>
        <Link to="/login" class="btn btn-outline">Log in</Link>
      </div>
    </div>

    <section class="features">
      <div class="feature">
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 2L11 13"/>
            <path d="M22 2L15 22 11 13 2 9l20-7z"/>
          </svg>
        </div>
        <h3>Manage Flights</h3>
        <p>Keep track of all your flight details in one place</p>
      </div>
      <div class="feature">
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
            <line x1="12" y1="12" x2="12" y2="16"/>
            <line x1="10" y1="14" x2="14" y2="14"/>
          </svg>
        </div>
        <h3>Hotel Bookings</h3>
        <p>Organize your accommodations with ease</p>
      </div>
      <div class="feature">
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
            <line x1="8" y1="14" x2="8" y2="14"/>
            <line x1="12" y1="14" x2="12" y2="14"/>
            <line x1="16" y1="14" x2="16" y2="14"/>
            <line x1="8" y1="18" x2="8" y2="18"/>
            <line x1="12" y1="18" x2="12" y2="18"/>
          </svg>
        </div>
        <h3>Events & Activities</h3>
        <p>Plan and schedule your trip activities</p>
      </div>
      <div class="feature">
        <div class="feature-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
          </svg>
        </div>
        <h3>Share with Friends</h3>
        <p>Collaborate with travel companions</p>
      </div>
    </section>
  </main>

  <footer class="footer">
    <p>&copy; 2026 Redbud Travel Planner</p>
  </footer>
</div>

<style>
</style>
