import assert from 'node:assert/strict'
import { articleDeleteSchema, articleSaveSchema } from '../lib/cms-article-schemas.ts'
import { docsSaveSchema } from '../lib/cms-docs-schema.ts'
import { cmsSingletonItemSchemas } from '../lib/cms-singleton-schemas.ts'

const uuid = '00000000-0000-4000-8000-000000000001'
const revision = 'a'.repeat(32)
const article = {
  request_id: uuid,
  expected_revision: revision,
  post: {
    slug: 'safe-article', title: 'Safe article', title_html: '', card_title: '', subtitle: 'Subtitle', category: '',
    catalog_category_id: null, author: '', date_label: '', read_time: '', bg_key: '', bg_color: '', hero_image_path: '',
    card_image_path: '', hero_image_alt: '', body_html: '<p>Body</p>', is_published: true, sort_order: 1,
  },
  tags: [{ id: '1', tag: 'Diamond' }],
  products: [{ id: '2', product_id: uuid }],
  content_blocks: [{ id: '3', block_type: 'text', heading: '', body_html: '<p>Block</p>', image_path: '', image_alt: '', image_caption: '', is_enabled: true }],
  deleted_tag_ids: [], deleted_product_ids: [], deleted_block_ids: [],
}

assert.equal(articleSaveSchema.safeParse(article).success, true)
assert.equal(articleSaveSchema.safeParse({ ...article, admin_only: true }).success, false)
assert.equal(articleSaveSchema.safeParse({ ...article, deleted_tag_ids: ['4', '4'] }).success, false)
assert.equal(articleSaveSchema.safeParse({ ...article, deleted_product_ids: ['2'] }).success, false)
assert.equal(articleDeleteSchema.safeParse({ request_id: uuid, expected_revision: revision }).success, true)
assert.equal(articleDeleteSchema.safeParse({ request_id: uuid }).success, false)

const docs = {
  request_id: uuid,
  expected_revision: revision,
  page: { title: 'Terms', eyebrow: 'Legal', subtitle: 'Terms text', faq_category_id: null },
  blocks: [{ id: '8', heading: 'Heading', description: '', body: '<p>Body</p>' }],
  deleted_block_ids: [],
}
assert.equal(docsSaveSchema.safeParse(docs).success, true)
assert.equal(docsSaveSchema.safeParse({ ...docs, deleted_block_ids: ['8'] }).success, false)
assert.equal(docsSaveSchema.safeParse({ ...docs, deleted_block_ids: ['9', '9'] }).success, false)

const hero = {
  is_enabled: true, heading: 'Learn', paragraph: 'Explore', button_label: 'Read', button_link: '/education',
  desktop_image_path: 'education/desktop.webp', desktop_image_alt: 'Diamonds', mobile_image_path: 'education/mobile.webp', mobile_image_alt: 'Diamonds',
}
assert.equal(cmsSingletonItemSchemas.blog_hero.safeParse(hero).success, true)
assert.equal(cmsSingletonItemSchemas.education_hero.safeParse(hero).success, true)
assert.equal(cmsSingletonItemSchemas.education_hero.safeParse({ ...hero, unexpected: true }).success, false)

console.log('Blog, Education, and Documents CMS validation tests passed.')
