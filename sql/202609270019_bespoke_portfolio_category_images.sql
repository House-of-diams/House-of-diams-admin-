begin;

-- Optional category artwork powers the Bespoke storefront collection rail.
-- Existing categories remain valid and continue to use the hero-slider fallback.
alter table public.bespoke_portfolio_categories
  add column if not exists image_path text null;

notify pgrst, 'reload schema';

commit;
