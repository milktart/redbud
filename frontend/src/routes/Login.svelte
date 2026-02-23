<script>
  import { Link, navigate } from 'svelte-routing';
  import { authAPI } from '../lib/services/api';
  import { user, isAuthenticated } from '../lib/stores/user';

  let identifier = '';
  let password = '';
  let error = '';
  let loading = false;

  async function handleSubmit() {
    error = '';
    loading = true;

    try {
      const userData = await authAPI.login(identifier, password);
      user.set(userData);
      isAuthenticated.set(true);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      error = err.message || 'Login failed. Please try again.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="container">
  <header class="header">
    <h1>Bluebonnet Travel Planner</h1>
  </header>

  <main class="main-content">
    <div class="auth-card">
      <h2>Log In</h2>
      <form on:submit|preventDefault={handleSubmit}>
        <div class="form-group">
          <label for="identifier">Email or Phone Number</label>
          <input
            type="text"
            id="identifier"
            bind:value={identifier}
            placeholder="you@example.com or +15551234567"
            required
            disabled={loading}
          />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input
            type="password"
            id="password"
            bind:value={password}
            required
            disabled={loading}
          />
        </div>
        {#if error}
          <div class="error-message">{error}</div>
        {/if}
        <button type="submit" class="btn btn-primary btn-block" disabled={loading}>
          {loading ? 'Logging in...' : 'Log In'}
        </button>
      </form>
      <p class="auth-link">
        Don't have an account? <Link to="/register">Sign up</Link>
      </p>
      <p class="auth-link">
        <Link to="/">Back to home</Link>
      </p>
    </div>
  </main>

  <footer class="footer">
    <p>&copy; 2026 Bluebonnet Travel Planner</p>
  </footer>
</div>
