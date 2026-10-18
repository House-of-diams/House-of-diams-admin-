begin;

-- Remove only rows whose source type cannot belong to their current section type.
-- This is idempotent and deliberately does not touch valid selections, sections,
-- featured cards, or any master-catalog data.
delete from public.navbar_section_source_items source
using public.navbar_sections section
where section.id = source.section_id
  and (
    (section.section_type = 'category_list' and source.source_kind <> 'subcategory_option')
    or (section.section_type = 'metal_swatches' and source.source_kind <> 'metal')
    or (section.section_type = 'stone_shapes' and source.source_kind <> 'stone_shape')
    or (section.section_type = 'ring_sizes' and source.source_kind <> 'ring_size')
    or (section.section_type = 'certificates' and source.source_kind <> 'certificate')
    or (section.section_type = 'styles' and source.source_kind <> 'style')
    or (section.section_type in ('manual_links', 'category_link'))
  );

-- Defend the table itself so no future write path can attach an incompatible
-- source item to a navbar section.
create or replace function public.navbar_section_source_item_type_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_section_type public.navbar_section_type;
  v_expected_kind text;
begin
  select section_type into v_section_type
  from public.navbar_sections
  where id = new.section_id;

  if not found then
    raise exception 'Navbar section does not exist.' using errcode = '23503';
  end if;

  v_expected_kind := case v_section_type
    when 'category_list' then 'subcategory_option'
    when 'metal_swatches' then 'metal'
    when 'stone_shapes' then 'stone_shape'
    when 'ring_sizes' then 'ring_size'
    when 'certificates' then 'certificate'
    when 'styles' then 'style'
    else null
  end;

  if v_expected_kind is null or new.source_kind <> v_expected_kind then
    raise exception 'Navbar source kind does not match its section type.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists navbar_section_source_item_type_guard on public.navbar_section_source_items;
create trigger navbar_section_source_item_type_guard
before insert or update of section_id, source_kind on public.navbar_section_source_items
for each row execute function public.navbar_section_source_item_type_guard_v1();

commit;
