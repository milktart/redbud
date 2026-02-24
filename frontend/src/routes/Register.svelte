<script>
  import { Link, navigate } from 'svelte-routing';
  import { onMount, onDestroy } from 'svelte';
  import { authAPI } from '../lib/services/api';
  import { user, isAuthenticated } from '../lib/stores/user';
  import PhoneInput from '../lib/components/PhoneInput.svelte';

  onMount(() => document.body.classList.add('scrollable'));
  onDestroy(() => document.body.classList.remove('scrollable'));

  let firstName = '';
  let lastInitial = '';
  let identifierType = 'email'; // 'email' | 'phone'
  let email = '';
  let phone = '';
  let password = '';
  let error = '';
  let loading = false;

  async function handleSubmit() {
    error = '';
    loading = true;

    try {
      const userData = await authAPI.register({
        firstName,
        lastName: lastInitial,
        email: identifierType === 'email' ? email : undefined,
        phone: identifierType === 'phone' ? phone : undefined,
        password,
        confirmPassword: password,
      });
      user.set(userData);
      isAuthenticated.set(true);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      error = err.message || 'Registration failed. Please try again.';
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
        <Link to="/login" class="btn btn-sm btn-outline">Log In</Link>
      </nav>
    </div>
  </header>

  <main class="main-content">
    <div class="auth-card">
      <h2>Create your account</h2>
      <p class="auth-subtitle">Start planning your travels with Redbud</p>
      <form on:submit|preventDefault={handleSubmit}>
        <div class="form-group">
          <label for="firstName">First Name</label>
          <input
            type="text"
            id="firstName"
            bind:value={firstName}
            autocomplete="given-name"
            required
            disabled={loading}
          />
        </div>
        <div class="form-group">
          <label for="lastInitial">Last Initial</label>
          <input
            type="text"
            id="lastInitial"
            bind:value={lastInitial}
            autocomplete="family-name"
            required
            maxlength="1"
            disabled={loading}
          />
        </div>
        <div class="form-group">
          <div class="identifier-toggle">
            <button
              type="button"
              class="identifier-tab"
              class:active={identifierType === 'email'}
              on:click={() => identifierType = 'email'}
              disabled={loading}
            >Email</button>
            <button
              type="button"
              class="identifier-tab"
              class:active={identifierType === 'phone'}
              on:click={() => identifierType = 'phone'}
              disabled={loading}
            >Phone</button>
          </div>
          {#if identifierType === 'email'}
            <input
              type="email"
              id="email"
              bind:value={email}
              placeholder="you@example.com"
              autocomplete="email"
              required
              disabled={loading}
            />
          {:else}
            <PhoneInput
              id="phone"
              value={phone}
              onChangeNumber={(num) => { phone = num; }}
              disabled={loading}
            />
          {/if}
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input
            type="password"
            id="password"
            bind:value={password}
            autocomplete="new-password"
            required
            disabled={loading}
          />
        </div>
        {#if error}
          <div class="error-message">{error}</div>
        {/if}
        <button type="submit" class="btn btn-primary btn-block" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
      <p class="auth-link">
        Already have an account? <Link to="/login">Log in</Link>
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

  .identifier-toggle {
    display: flex;
    gap: 0;
    margin-bottom: var(--spacing-sm);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .identifier-tab {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--white);
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--gray-text);
    transition: background var(--transition-base), color var(--transition-base);
  }

  .identifier-tab.active {
    background: var(--primary-color);
    color: var(--white);
  }

  .identifier-tab:disabled {
    opacity: var(--opacity-disabled);
    cursor: not-allowed;
  }
</style>
