begin;

-- Remove only source rows that are either incompatible with their section type
-- or point at a master-catalog record that no longer exists. This is idempotent.
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
    or (source.source_kind = 'subcategory_option' and not exists (select 1 from public.catalog_options item where item.id::text = source.source_item_id))
    or (source.source_kind = 'metal' and not exists (select 1 from public.catalog_metals item where item.id::text = source.source_item_id))
    or (source.source_kind = 'stone_shape' and not exists (select 1 from public.catalog_stone_shapes item where item.id::text = source.source_item_id))
    or (source.source_kind = 'ring_size' and not exists (select 1 from public.catalog_ring_sizes item where item.id::text = source.source_item_id))
    or (source.source_kind = 'certificate' and not exists (select 1 from public.catalog_certificates item where item.id::text = source.source_item_id))
    or (source.source_kind = 'style' and not exists (select 1 from public.catalog_styles item where item.id::text = source.source_item_id))
  );

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
  select section_type into v_section_type from public.navbar_sections where id = new.section_id;
  if not found then raise exception 'Navbar section does not exist.' using errcode = '23503'; end if;

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

  if (new.source_kind = 'subcategory_option' and not exists (select 1 from public.catalog_options item where item.id::text = new.source_item_id))
     or (new.source_kind = 'metal' and not exists (select 1 from public.catalog_metals item where item.id::text = new.source_item_id))
     or (new.source_kind = 'stone_shape' and not exists (select 1 from public.catalog_stone_shapes item where item.id::text = new.source_item_id))
     or (new.source_kind = 'ring_size' and not exists (select 1 from public.catalog_ring_sizes item where item.id::text = new.source_item_id))
     or (new.source_kind = 'certificate' and not exists (select 1 from public.catalog_certificates item where item.id::text = new.source_item_id))
     or (new.source_kind = 'style' and not exists (select 1 from public.catalog_styles item where item.id::text = new.source_item_id)) then
    raise exception 'Navbar source item does not exist.' using errcode = '23503';
  end if;
  return new;
end;
$$;

create or replace function public.catalog_navbar_source_delete_guard_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1 from public.navbar_section_source_items source
    where source.source_kind = tg_argv[0] and source.source_item_id = old.id::text
  ) then
    raise exception 'This catalog value is still used by a navbar section.' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists navbar_section_source_item_type_guard on public.navbar_section_source_items;
create trigger navbar_section_source_item_type_guard
before insert or update of section_id, source_kind, source_item_id on public.navbar_section_source_items
for each row execute function public.navbar_section_source_item_type_guard_v1();

drop trigger if exists catalog_options_navbar_source_delete_guard on public.catalog_options;
create trigger catalog_options_navbar_source_delete_guard before delete on public.catalog_options
for each row execute function public.catalog_navbar_source_delete_guard_v1('subcategory_option');
drop trigger if exists catalog_metals_navbar_source_delete_guard on public.catalog_metals;
create trigger catalog_metals_navbar_source_delete_guard before delete on public.catalog_metals
for each row execute function public.catalog_navbar_source_delete_guard_v1('metal');
drop trigger if exists catalog_stone_shapes_navbar_source_delete_guard on public.catalog_stone_shapes;
create trigger catalog_stone_shapes_navbar_source_delete_guard before delete on public.catalog_stone_shapes
for each row execute function public.catalog_navbar_source_delete_guard_v1('stone_shape');
drop trigger if exists catalog_ring_sizes_navbar_source_delete_guard on public.catalog_ring_sizes;
create trigger catalog_ring_sizes_navbar_source_delete_guard before delete on public.catalog_ring_sizes
for each row execute function public.catalog_navbar_source_delete_guard_v1('ring_size');
drop trigger if exists catalog_certificates_navbar_source_delete_guard on public.catalog_certificates;
create trigger catalog_certificates_navbar_source_delete_guard before delete on public.catalog_certificates
for each row execute function public.catalog_navbar_source_delete_guard_v1('certificate');
drop trigger if exists catalog_styles_navbar_source_delete_guard on public.catalog_styles;
create trigger catalog_styles_navbar_source_delete_guard before delete on public.catalog_styles
for each row execute function public.catalog_navbar_source_delete_guard_v1('style');

commit;
