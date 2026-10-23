import 'server-only'
import { readAdminAuthProvider } from './auth/integration'
import { imageTarget } from './image-provider'

export type VideoProvider = 'aws'
export type VideoContext = 'products' | 'hiphop' | 'about' | 'section'
export type VideoSource = { bucket: string; baseUrl: string; prefix: string }
export function readVideoProvider(env: NodeJS.ProcessEnv = process.env): VideoProvider {
  readAdminAuthProvider(env)
  if (env.ADMIN_VIDEO_PROVIDER !== 'aws') throw new Error('Video service unavailable.')
  return 'aws'
}
export function videoTarget(context: VideoContext, env: NodeJS.ProcessEnv = process.env): VideoSource {
  if (env.ADMIN_VIDEO_ROUTING_VERIFIED !== 'true') throw new Error('Video service unavailable.')
  const target = imageTarget(context === 'about' ? 'content' : 'product', env)
  // Banner videos share the product video prefix, so they are covered by the same bucket protections and admission registry.
  return { ...target, prefix: context === 'about' ? 'about/hero/video/' : context === 'section' ? 'products/videos/' : `${context}/videos/` }
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
