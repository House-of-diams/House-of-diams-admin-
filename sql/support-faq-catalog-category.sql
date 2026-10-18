alter table public.support_faq_items
  add column if not exists catalog_category_id uuid null;

alter table public.support_faq_items
  drop constraint if exists support_faq_items_catalog_category_id_fkey;

alter table public.support_faq_items
  add constraint support_faq_items_catalog_category_id_fkey
  foreign key (catalog_category_id)
  references public.catalog_categories(id)
  on delete set null;

create index if not exists support_faq_items_catalog_category_id_idx
  on public.support_faq_items(catalog_category_id);
