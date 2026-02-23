<script>
  import { Link } from 'svelte-routing';
</script>

<div class="container">
  <header class="header">
    <h1>Bluebonnet Travel Planner</h1>
  </header>

  <main class="main-content">
    <div class="hero">
      <h2>Plan Your Perfect Trip</h2>
      <p>Organize flights, hotels, events, and more in one place</p>
      <div class="cta-buttons">
        <Link to="/login" class="btn btn-primary">Log In</Link>
        <Link to="/register" class="btn btn-secondary">Sign Up</Link>
      </div>
    </div>

    <section class="features">
      <div class="feature">
        <h3>✈️ Manage Flights</h3>
        <p>Keep track of all your flight details in one place</p>
      </div>
      <div class="feature">
        <h3>🏨 Hotel Bookings</h3>
        <p>Organize your accommodations with ease</p>
      </div>
      <div class="feature">
        <h3>🎉 Events & Activities</h3>
        <p>Plan and schedule your trip activities</p>
      </div>
      <div class="feature">
        <h3>👥 Share with Friends</h3>
        <p>Collaborate with travel companions</p>
      </div>
    </section>
  </main>

  <footer class="footer">
    <p>&copy; 2026 Bluebonnet Travel Planner</p>
  </footer>
</div>

<style>
  /* Component styles will be moved to global stylesheet */
</style>
