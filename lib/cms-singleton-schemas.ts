import { z } from 'zod'

export type CmsSingletonKind = 'about_hero' | 'about_wide_banner' | 'blog_hero' | 'education_hero' | 'contact_hero' | 'bespoke_showcase' | 'collection_page' | 'hiphop_showcase'

const text = (max = 10_000) => z.string().max(max)
const requiredText = (max = 10_000) => z.string().trim().min(1).max(max)
const safeLink = z.string().max(2_000).refine((value) => !/^\s*(?:javascript|data|vbscript):/i.test(value), 'Executable links are not allowed.')
const imageHero = z.object({
  is_enabled: z.boolean(), heading: requiredText(500), paragraph: text(10_000), button_label: text(500), button_link: safeLink,
  desktop_image_path: text(2_000), desktop_image_alt: text(2_000), mobile_image_path: text(2_000), mobile_image_alt: text(2_000),
}).strict()

export const cmsSingletonItemSchemas = {
  about_hero: z.object({
    section_key: z.string().optional(), is_enabled: z.boolean(), media_type: z.enum(['image', 'video']), desktop_media_path: text(2_000),
    mobile_media_path: text(2_000), video_poster_path: text(2_000), media_alt: text(2_000), show_text_overlay: z.boolean(),
    heading: text(500), paragraph: text(10_000), show_button: z.boolean(), button_label: text(500), button_link: safeLink,
    overlay_position: z.enum(['left', 'center', 'right', 'bottom-left', 'bottom-center', 'bottom-right']), overlay_scrim_enabled: z.boolean(),
  }).strict(),
  about_wide_banner: z.object({
    section_key: z.string().optional(), is_enabled: z.boolean(), desktop_image_path: text(2_000), mobile_image_path: text(2_000),
    image_alt: text(2_000), heading: text(500), paragraph: text(10_000), show_button: z.boolean(), button_label: text(500),
    button_link: safeLink, content_position: z.enum(['left', 'center', 'right', 'bottom-left', 'bottom-center', 'bottom-right']),
    sort_order: z.coerce.number().int().min(-1_000_000).max(1_000_000),
  }).strict(),
  blog_hero: imageHero,
  education_hero: imageHero,
  contact_hero: z.object({ section_key: z.string().optional(), eyebrow: requiredText(500), heading: requiredText(500), subtitle: requiredText(10_000) }).strict(),
  bespoke_showcase: z.object({
    is_enabled: z.boolean(), eyebrow: text(500), heading: requiredText(500), subtitle: text(10_000), cta_label: text(500),
    image_path: text(2_000), mobile_image_path: text(2_000), image_alt: text(2_000), sort_order: z.coerce.number().int().min(-1_000_000).max(1_000_000),
  }).strict(),
  collection_page: z.object({
    page_enabled: z.boolean(), show_in_footer: z.boolean(), show_home_showcase: z.boolean(), showcase_heading: text(500),
    showcase_subtitle: text(10_000), showcase_cta_label: text(500), showcase_cta_href: safeLink, showcase_image_path: text(2_000),
    showcase_mobile_image_path: text(2_000),
  }).strict(),
  hiphop_showcase: z.object({
    is_enabled: z.boolean(), eyebrow: text(500), heading_line_1: requiredText(500), heading_line_2: text(500), heading_emphasis: text(500),
    cta_label: text(500), cta_link: safeLink, image_path: text(2_000), image_alt: text(2_000),
  }).strict(),
} satisfies Record<CmsSingletonKind, z.ZodTypeAny>
