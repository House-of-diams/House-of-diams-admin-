// The admin login page starts Keycloak sign-in by itself. To stay safe it never does so
// twice in a row within a short time (a bounce back to the page shows the button
// instead of looping), and never right after the person signed out.
export const AUTO_LOGIN_COOLDOWN_MS = 30_000
export const AUTO_LOGIN_STORAGE_KEY = 'hod-admin-autologin-at'

export function shouldAutoLogin(lastAttemptAt: number, now: number): boolean {
  return !(Number.isFinite(lastAttemptAt) && lastAttemptAt > 0 && now - lastAttemptAt < AUTO_LOGIN_COOLDOWN_MS)
}

/** Only a plain visit starts sign-in; ?logout=... or ?error=... always show the page. */
export function autoLoginAllowed(params: { logout?: string | string[]; error?: string | string[] } | undefined): boolean {
  return !params?.logout && !params?.error
}
