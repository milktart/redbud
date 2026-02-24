<script>
  import { Link, navigate } from 'svelte-routing';
  import { onMount, onDestroy } from 'svelte';
  import { authAPI } from '../lib/services/api';
  import { user, isAuthenticated } from '../lib/stores/user';

  onMount(() => document.body.classList.add('scrollable'));
  onDestroy(() => document.body.classList.remove('scrollable'));

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
    <div class="header-content">
      <Link to="/" class="header-logo-link"><h1>Redbud</h1></Link>
      <nav class="header-nav">
        <Link to="/register" class="btn btn-sm btn-primary">Register</Link>
      </nav>
    </div>
  </header>

  <main class="main-content">
    <div class="auth-card">
      <h2>Welcome back</h2>
      <p class="auth-subtitle">Log in to your Redbud account</p>
      <form on:submit|preventDefault={handleSubmit}>
        <div class="form-group">
          <label for="identifier">Email or Phone Number</label>
          <input
            type="text"
            id="identifier"
            bind:value={identifier}
            placeholder="you@example.com or +15551234567"
            autocomplete="username"
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
            autocomplete="current-password"
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
    </div>
  </main>

  <footer class="footer">
    <p>&copy; 2026 Redbud Travel Planner</p>
  </footer>
</div>

<style>
  .header-logo-link {
    text-decoration: none;
  }
</style>
