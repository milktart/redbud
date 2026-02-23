<script>
  import { Router, Route } from 'svelte-routing';
  import Landing from './routes/Landing.svelte';
  import Login from './routes/Login.svelte';
  import Register from './routes/Register.svelte';
  import Dashboard from './routes/Dashboard.svelte';

  export let url = '';
</script>

<Router {url}>
  <Route path="/"><Landing /></Route>
  <Route path="/login"><Login /></Route>
  <Route path="/register"><Register /></Route>
  <Route path="/dashboard"><Dashboard /></Route>
</Router>
