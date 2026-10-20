import 'server-only'
import { readAdminAuthProvider } from './auth/integration'
import { deploymentProfile } from './deployment-profile'

export type ImageProvider = 'legacy' | 'aws'
export function readImageProvider(env: NodeJS.ProcessEnv = process.env): ImageProvider {
  readAdminAuthProvider(env)
  const value = env.ADMIN_IMAGE_PROVIDER
  if (!value || value === 'legacy') return 'legacy'
  if (value === 'aws') return 'aws'
  throw new Error('Image service unavailable.')
}

export type ImageContext = 'product' | 'content'
export function imageTarget(context: ImageContext, env: NodeJS.ProcessEnv = process.env) {
  // Historical admin CMS objects are in the product bucket. New content routing
  // requires separate review; never reinterpret or move those existing keys.
  if (context === 'content' && env.ADMIN_IMAGE_CONTENT_ROUTING_VERIFIED !== 'true') throw new Error('Image service unavailable.')
  const bucket = context === 'product' ? env.AWS_MEDIA_BUCKET : env.AWS_CONTENT_BUCKET
  const baseUrl = context === 'product' ? env.NEXT_PUBLIC_MEDIA_CDN_BASE_URL : env.AWS_CONTENT_CDN_BASE_URL
  const profile = deploymentProfile(env.NEXT_PUBLIC_HOD_DEPLOYMENT)
  const expected = context === 'product' ? { ...profile.media } : { ...profile.content }
  if (bucket?.trim() !== expected.bucket || baseUrl?.trim().replace(/\/+$/, '') !== expected.baseUrl) throw new Error('Image service unavailable.')
  return expected
}
