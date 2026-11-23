export interface StoredAccount {
  handle: string;
  password?: string;
  session?: any;
}

const STORAGE_KEY_ACCOUNTS = 'bsky_accounts';
const STORAGE_KEY_ACTIVE_HANDLE = 'bsky_handle';
const STORAGE_KEY_ACTIVE_PASSWORD = 'bsky_password';
const STORAGE_KEY_ACTIVE_SESSION = 'bsky_session_data';

/**
 * Retrieves all stored accounts from localStorage, including migration support.
 */
export function getStoredAccounts(): StoredAccount[] {
  const accountsJson = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
  let accounts: StoredAccount[] = accountsJson ? JSON.parse(accountsJson) : [];

  // Backward compatibility migration for active account keys
  const activeHandle = localStorage.getItem(STORAGE_KEY_ACTIVE_HANDLE);
  if (activeHandle && !accounts.some(a => a.handle === activeHandle)) {
    const savedSession = localStorage.getItem(STORAGE_KEY_ACTIVE_SESSION);
    accounts.push({
      handle: activeHandle,
      password: localStorage.getItem(STORAGE_KEY_ACTIVE_PASSWORD) || undefined,
      session: savedSession ? JSON.parse(savedSession) : undefined
    });
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
  }

  return accounts.filter(a => a?.handle?.trim() && a?.handle !== 'null');
}

/**
 * Retrieves a specific stored account by handle.
 */
export function getStoredAccount(handle: string): StoredAccount | undefined {
  const accounts = getStoredAccounts();
  return accounts.find(a => a.handle === handle);
}

/**
 * Saves or updates an account in the multi-account storage list and synchronizes active keys.
 */
export function saveOrUpdateAccount(handle: string, password: string, session: any, rememberPassword: boolean): void {
  const accounts = getStoredAccounts();
  const existingIndex = accounts.findIndex(a => a.handle === handle);
  const existing = existingIndex >= 0 ? accounts[existingIndex] : null;

  const accountData: StoredAccount = {
    handle,
    password: rememberPassword ? password : (existing?.password || undefined),
    session: session !== undefined ? session : (existing?.session || undefined)
  };

  if (existingIndex >= 0) {
    accounts[existingIndex] = accountData;
  } else {
    accounts.push(accountData);
  }

  localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
  localStorage.setItem(STORAGE_KEY_ACTIVE_HANDLE, handle);

  if (rememberPassword && password) {
    localStorage.setItem(STORAGE_KEY_ACTIVE_PASSWORD, password);
  } else if (!password) {
    localStorage.removeItem(STORAGE_KEY_ACTIVE_PASSWORD);
  }

  if (session) {
    localStorage.setItem(STORAGE_KEY_ACTIVE_SESSION, JSON.stringify(session));
  }
}

/**
 * Removes an account from the multi-account storage list and updates active keys.
 */
export function removeStoredAccount(handle: string): StoredAccount[] {
  let accounts = getStoredAccounts();
  accounts = accounts.filter(a => a.handle !== handle);

  localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));

  const remainingActive = accounts[0];
  if (remainingActive) {
    localStorage.setItem(STORAGE_KEY_ACTIVE_HANDLE, remainingActive.handle);
    if (remainingActive.password) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_PASSWORD, remainingActive.password);
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_PASSWORD);
    }
    if (remainingActive.session) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_SESSION, JSON.stringify(remainingActive.session));
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
    }
  } else {
    localStorage.removeItem(STORAGE_KEY_ACTIVE_HANDLE);
    localStorage.removeItem(STORAGE_KEY_ACTIVE_PASSWORD);
    localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
  }

  return accounts;
}
