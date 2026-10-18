import 'server-only'
import { readAdminAuthProvider } from './auth/integration'
import { imageTarget } from './image-provider'

export type VideoProvider = 'legacy' | 'aws'
export type VideoContext = 'products' | 'hiphop' | 'about'
export type VideoSource = { bucket: string; baseUrl: string; prefix: string }
export function readVideoProvider(env: NodeJS.ProcessEnv = process.env): VideoProvider {
  readAdminAuthProvider(env)
  const value = env.ADMIN_VIDEO_PROVIDER
  if (!value || value === 'legacy') return 'legacy'
  if (value === 'aws') return 'aws'
  throw new Error('Video service unavailable.')
}
export function videoTarget(context: VideoContext, env: NodeJS.ProcessEnv = process.env): VideoSource {
  if (env.ADMIN_VIDEO_ROUTING_VERIFIED !== 'true') throw new Error('Video service unavailable.')
  const target = imageTarget(context === 'about' ? 'content' : 'product', env)
  return { ...target, prefix: context === 'about' ? 'about/hero/video/' : `${context}/videos/` }
}
/** Explicit inventory, never a root bucket scan or a rewrite of historical URLs. */
export function videoSources(env: NodeJS.ProcessEnv = process.env): VideoSource[] {
  const product = videoTarget('products', env)
  return [product, videoTarget('hiphop', env),
    { ...product, prefix: 'bespoke/videos/' },
    { ...product, prefix: 'about/hero/video/' }, videoTarget('about', env)]
}
export function videoNamespace(sources: VideoSource[]) {
  return JSON.stringify(['aws-video-v1', ...sources.map(s => [s.bucket, s.prefix, s.baseUrl])])
}
export function legacyVideoNamespace(env: NodeJS.ProcessEnv = process.env) {
  return JSON.stringify(['legacy-r2-v1', env.CLOUDFLARE_R2_ACCOUNT_ID?.trim() ?? '', env.CLOUDFLARE_R2_BUCKET?.trim() ?? '', env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.trim() ?? '', env.CLOUDFLARE_R2_VIDEO_PREFIX?.trim() || 'products/videos', env.CLOUDFLARE_R2_BESPOKE_VIDEO_PREFIX?.trim() || 'bespoke/videos'])
}
