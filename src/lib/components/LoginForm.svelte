<script lang="ts">
  let {
    handle = $bindable(''),
    password = $bindable(''),
    rememberPassword = $bindable(false),
    isLoading = false,
    onlogin,
    msg,
    i18n
  } = $props();
  let showPassword = $state(false);
</script>

<div class="card login-box">
  <h2>{msg.authTitle}</h2>
  <form onsubmit={(e) => { e.preventDefault(); onlogin?.(e); }} class="login-form">
    <!-- Handle input field -->
    <div class="field">
      <label for="handle">{msg.authHandle}</label>
      <input id="handle" type="text" placeholder="user.bsky.social" bind:value={handle} disabled={isLoading} required />
    </div>

    <!-- Password input field with visibility toggle -->
    <div class="field password-field">
      <label for="password">{msg.authPassword}</label>
      <div class="password-input-wrapper" style="position: relative; display: flex; align-items: center;">
        <input
          id="password"
          type={showPassword ? "text" : "password"}
          placeholder="xxxx-xxxx-xxxx-xxxx"
          bind:value={password}
          disabled={isLoading}
          required
          style="width: 100%; padding-right: 40px;"
        />
        <button
          type="button"
          class="tool-btn show-password-btn"
          onclick={() => showPassword = !showPassword}
        >
          {#if showPassword}
            <!-- Eye Off Icon -->
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          {:else}
            <!-- Eye Icon -->
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          {/if}
        </button>
      </div>
    </div>

    <!-- Remember password checkbox -->
    <div class="field-checkbox" style="display: flex; align-items: center; gap: 8px; margin-bottom: 1rem;">
      <input id="remember" type="checkbox" bind:checked={rememberPassword} disabled={isLoading} />
      <label for="remember" style="cursor: pointer; user-select: none;">{msg.authRemember}</label>
    </div>

    <!-- Submit button -->
    <button class="btn-primary" type="submit" disabled={isLoading}>{msg.authLogin}</button>
  </form>
</div>

<!-- Language selector footer -->
<div class="lang-selector">
  <button
    class="lang-btn"
    class:active={i18n.locale === 'ja'}
    onclick={() => i18n.set('ja')}
  >
    JP
  </button>
  <span class="divider">/</span>
  <button
    class="lang-btn"
    class:active={i18n.locale === 'en'}
    onclick={() => i18n.set('en')}
  >
    EN
  </button>
</div>

<style>
  .login-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 4px 30px 4px;
  }
  .show-password-btn {
     position: absolute;
     right: var(--sp-md);
  }
  .lang-selector {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8rem;
    opacity: 0.7;
  }
  .lang-selector:hover {
    opacity: 1;
  }
  .lang-btn {
    background: none;
    border: none;
    padding: 2px 4px;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .lang-btn.active {
    font-weight: bold;
    text-decoration: underline;
  }
  .divider {
    color: inherit;
  }
</style>
