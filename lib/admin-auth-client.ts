'use client'

export async function adminAuthProvider(): Promise<'supabase' | 'keycloak'> {
  const response = await fetch('/api/auth/provider', { credentials: 'same-origin', cache: 'no-store' })
  const data = await response.json()
  if (!response.ok || !['supabase', 'keycloak'].includes(data?.provider)) throw new Error('Admin authentication unavailable.')
  return data.provider
}

export async function adminCookieSession() {
  const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
  const data = await response.json()
  if (!response.ok || data?.authenticated !== true || typeof data.actor?.profileId !== 'string'
    || typeof data.csrfToken !== 'string' || !data.csrfToken) throw new Error('Please sign in again.')
  return { profileId: data.actor.profileId as string, csrfToken: data.csrfToken as string }
}

/** The response is a handoff, never evidence that a password was changed. */
export async function openAdminAccount(): Promise<string> {
  if (await adminAuthProvider() !== 'keycloak') throw new Error('Keycloak account management is not selected.')
  const session = await adminCookieSession()
  const response = await fetch('/api/auth/account', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'x-admin-csrf': session.csrfToken } })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error ?? 'Account management unavailable.')
  if (data?.action !== 'account-console' || data.url !== 'https://auth-uat.houseofdiams.com/realms/houseofdiams/account/') throw new Error('Invalid account destination.')
  return data.url
}

export async function logoutAdmin(): Promise<{ upstreamLogout: boolean }> {
  if (await adminAuthProvider() === 'supabase') {
    const { supabase } = await import('./supabase')
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error('Unable to sign out.')
    return { upstreamLogout: true }
  }
  let headers: Record<string, string>
  try {
    const session = await adminCookieSession()
    headers = { 'x-admin-csrf': session.csrfToken }
  } catch {
    // A revoked mapping must still be able to delete its own opaque session.
    // This proof is domain-separated and cannot authorize a business mutation.
    const challenge = await fetch('/api/auth/logout-challenge', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'x-admin-logout-intent': 'local-signout' } })
    const recovery = await challenge.json()
    if (!challenge.ok || typeof recovery?.logoutCsrfToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(recovery.logoutCsrfToken)) throw new Error('Unable to confirm sign-out. Please retry.')
    headers = { 'x-admin-logout-csrf': recovery.logoutCsrfToken }
  }
  const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers })
  const data = await response.json()
  // B1 deletes local authorization before upstream logout; a 502 must be shown honestly.
  if (data?.authenticated === false && (response.ok || response.status === 502) && typeof data.upstreamLogout === 'boolean') return { upstreamLogout: data.upstreamLogout }
  throw new Error('Unable to confirm sign-out. Please retry.')
}
