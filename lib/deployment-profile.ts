// HOD-010: the identity issuer and storage targets each deployment may use.
// Values stay pinned (a typo fails closed instead of pointing somewhere else);
// NEXT_PUBLIC_HOD_DEPLOYMENT picks the set. Unset means UAT, the current setup.
// It is NEXT_PUBLIC_ so the browser-side account check reads the same value; set it
// at build time as well as at runtime.
export type DeploymentProfile = Readonly<{
  name: 'uat' | 'production'
  oidcIssuer: string
  media: Readonly<{ bucket: string; baseUrl: string }>
  content: Readonly<{ bucket: string; baseUrl: string }>
}>

const PROFILES: Record<DeploymentProfile['name'], DeploymentProfile> = {
  uat: {
    name: 'uat',
    oidcIssuer: 'https://auth-uat.houseofdiams.com/realms/houseofdiams',
    media: { bucket: 'house-of-diams', baseUrl: 'https://media.houseofdiams.com' },
    content: { bucket: 'house-of-diams-hod', baseUrl: 'https://content.houseofdiams.com' },
  },
  // Confirm with DevOps before go-live. A wrong value only makes login or uploads
  // unavailable; it never sends data to an unlisted host.
  production: {
    name: 'production',
    oidcIssuer: 'https://auth.houseofdiams.com/realms/houseofdiams',
    media: { bucket: 'house-of-diams', baseUrl: 'https://media.houseofdiams.com' },
    content: { bucket: 'house-of-diams-hod', baseUrl: 'https://content.houseofdiams.com' },
  },
}

/** The literal process.env read lets Next inline the value into browser code. */
export function deploymentProfile(name: string | undefined = process.env.NEXT_PUBLIC_HOD_DEPLOYMENT): DeploymentProfile {
  const key = name?.trim() || 'uat'
  if (key !== 'uat' && key !== 'production') throw new Error('Unknown deployment profile.')
  return PROFILES[key]
}
