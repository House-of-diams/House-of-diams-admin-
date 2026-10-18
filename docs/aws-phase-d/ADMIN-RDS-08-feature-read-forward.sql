-- REVIEW DRAFT until ADMIN-RDS-08-review.md accepts this exact hash.
-- Bounded admin READ permissions only. No rows, write rights, roles or provider settings change.
-- Execute the entire file on hod_staging using hod_dev_migration (HOD Staging).
-- That existing login owns customer tables and can SET ROLE hod_migration for restored tables.
-- Existing product-read installation, other roles and policies must remain intact.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE admin_read08_scope ON COMMIT DROP AS
 SELECT * FROM jsonb_to_recordset('[{"name":"public.about_founders","owner":"hod_migration","rls":true,"all":true,"columns":["bio","designation","id","image_path","name","sort_order"]},{"name":"public.about_hero","owner":"hod_migration","rls":true,"all":true,"columns":["button_label","button_link","desktop_media_path","heading","is_enabled","media_alt","media_type","mobile_media_path","overlay_position","overlay_scrim_enabled","paragraph","section_key","show_button","show_text_overlay","updated_at","video_poster_path"]},{"name":"public.about_timeline","owner":"hod_migration","rls":true,"all":true,"columns":["id","label","sort_order","year"]},{"name":"public.about_values","owner":"hod_migration","rls":true,"all":false,"columns":["description","icon_path","id","image_alt","image_path","sort_order","title"]},{"name":"public.about_wide_banner","owner":"hod_migration","rls":true,"all":true,"columns":["button_label","button_link","content_position","desktop_image_path","heading","image_alt","is_enabled","mobile_image_path","paragraph","section_key","show_button","sort_order","updated_at"]},{"name":"public.admin_notification_reads","owner":"hod_migration","rls":true,"all":false,"columns":["admin_user_id","notification_key"]},{"name":"public.bespoke_form_carat_options","owner":"hod_migration","rls":true,"all":true,"columns":["display_order","id"]},{"name":"public.bespoke_form_guarantees","owner":"hod_migration","rls":true,"all":true,"columns":["display_order","id"]},{"name":"public.bespoke_form_metal_options","owner":"hod_migration","rls":true,"all":true,"columns":["display_order","id"]},{"name":"public.bespoke_form_piece_types","owner":"hod_migration","rls":true,"all":true,"columns":["display_order","id"]},{"name":"public.bespoke_form_settings","owner":"hod_migration","rls":true,"all":true,"columns":["id","updated_at"]},{"name":"public.bespoke_form_stone_options","owner":"hod_migration","rls":true,"all":true,"columns":["display_order","id"]},{"name":"public.bespoke_hero_content","owner":"hod_migration","rls":true,"all":true,"columns":["id","updated_at"]},{"name":"public.bespoke_hero_slider_items","owner":"hod_migration","rls":true,"all":true,"columns":["hero_id","id","sort_order"]},{"name":"public.bespoke_portfolio_categories","owner":"hod_migration","rls":true,"all":true,"columns":[]},{"name":"public.bespoke_portfolio_items","owner":"hod_migration","rls":true,"all":true,"columns":[]},{"name":"public.bespoke_process_cards","owner":"hod_migration","rls":true,"all":true,"columns":["description","eyebrow","id","sort_order","title"]},{"name":"public.bespoke_process_steps","owner":"hod_migration","rls":true,"all":false,"columns":["description","eyebrow","id","image_path","media_path","media_type","sort_order","step","title"]},{"name":"public.bespoke_submissions","owner":"hod_migration","rls":true,"all":false,"columns":["approx_carat","country","created_at","email","full_name","id","message","phone","piece_type","preferred_metal","status","stone_preference"]},{"name":"public.blog_page_hero","owner":"hod_migration","rls":true,"all":true,"columns":["button_label","button_link","desktop_image_alt","desktop_image_path","heading","id","is_enabled","mobile_image_alt","mobile_image_path","paragraph","updated_at"]},{"name":"public.blog_post_content_blocks","owner":"hod_migration","rls":true,"all":true,"columns":["id","post_id","sort_order"]},{"name":"public.blog_post_products","owner":"hod_migration","rls":true,"all":true,"columns":["id","post_id","product_id","sort_order"]},{"name":"public.blog_post_tags","owner":"hod_migration","rls":true,"all":true,"columns":["id","post_id","sort_order","tag"]},{"name":"public.blog_posts","owner":"hod_migration","rls":true,"all":true,"columns":["author","catalog_category_id","category","date_label","id","is_published","read_time","slug","sort_order","title","updated_at"]},{"name":"public.certifications_items","owner":"hod_migration","rls":true,"all":true,"columns":["badge","description","icon_path","id","sort_order","title"]},{"name":"public.certifications_section","owner":"hod_migration","rls":true,"all":true,"columns":["section_key"]},{"name":"public.checkout_result_page","owner":"hod_migration","rls":true,"all":true,"columns":["id","is_enabled","main_banner_image_alt","main_banner_image_path","secondary_banner_image_alt","secondary_banner_image_path","secondary_eyebrow","secondary_heading","secondary_paragraph","updated_at"]},{"name":"public.checkout_result_states","owner":"hod_migration","rls":true,"all":true,"columns":["eyebrow","heading","is_enabled","order_button_label","paragraph","state","updated_at"]},{"name":"public.cms_home_bestseller_products","owner":"hod_migration","rls":true,"all":true,"columns":["display_image_path","display_order","display_title","id","product_id","section_id"]},{"name":"public.cms_home_bestsellers","owner":"hod_migration","rls":true,"all":true,"columns":["cta_href","cta_label","eyebrow","heading","id","status"]},{"name":"public.cms_summary_pointers","owner":"hod_migration","rls":true,"all":true,"columns":["id","section_id","sort_order"]},{"name":"public.cms_summary_sections","owner":"hod_migration","rls":true,"all":true,"columns":["heading","id","is_enabled","section_key","updated_at"]},{"name":"public.collection_items","owner":"hod_migration","rls":true,"all":true,"columns":["description","id","image_path","label","link","sort_order","title"]},{"name":"public.collection_page_config","owner":"hod_migration","rls":true,"all":true,"columns":["page_enabled","section_key","show_home_showcase","show_in_footer","showcase_cta_href","showcase_cta_label","showcase_heading","showcase_image_path","showcase_mobile_image_path","showcase_subtitle","updated_at"]},{"name":"public.contact_hero","owner":"hod_migration","rls":true,"all":true,"columns":["eyebrow","heading","section_key","subtitle","updated_at"]},{"name":"public.contact_info","owner":"hod_migration","rls":true,"all":true,"columns":["href","icon_path","id","label","note","sort_order","value"]},{"name":"public.contact_submissions","owner":"hod_migration","rls":true,"all":false,"columns":["created_at","email","full_name","id","message","phone","status","topic"]},{"name":"public.coupons","owner":"hod_migration","rls":true,"all":false,"columns":["banner_description","banner_enabled","banner_title","code","created_at","discount_type","discount_value","ends_at","featured_priority","gift_banner_image_url","gift_product_id","gift_variant_data","id","is_active","minimum_order_amount","reward_type","starts_at","title","usage_count","usage_limit"]},{"name":"public.customer_identities","owner":"hod_dev_migration","rls":true,"all":false,"columns":["created_at","email","email_verified","id"]},{"name":"public.customer_profiles","owner":"hod_dev_migration","rls":true,"all":false,"columns":["first_name","identity_id","last_name"]},{"name":"public.discover_shapes_items","owner":"hod_migration","rls":true,"all":true,"columns":["description","id","image_alt","image_path","shape_id","sort_order","status","title"]},{"name":"public.docs_blocks","owner":"hod_migration","rls":true,"all":true,"columns":["body","description","heading","id","page_id","sort_order"]},{"name":"public.docs_pages","owner":"hod_migration","rls":true,"all":true,"columns":["faq_category_id","id","slug"]},{"name":"public.education_page_hero","owner":"hod_migration","rls":true,"all":true,"columns":["button_label","button_link","desktop_image_alt","desktop_image_path","heading","id","is_enabled","mobile_image_alt","mobile_image_path","paragraph","updated_at"]},{"name":"public.education_post_content_blocks","owner":"hod_migration","rls":true,"all":true,"columns":["id","post_id","sort_order"]},{"name":"public.education_post_products","owner":"hod_migration","rls":true,"all":true,"columns":["id","post_id","product_id","sort_order"]},{"name":"public.education_post_tags","owner":"hod_migration","rls":true,"all":true,"columns":["id","post_id","sort_order","tag"]},{"name":"public.education_posts","owner":"hod_migration","rls":true,"all":true,"columns":["author","category","date_label","id","is_published","read_time","slug","sort_order","title","updated_at"]},{"name":"public.hiphop_showcase_section","owner":"hod_migration","rls":true,"all":true,"columns":["cta_label","cta_link","eyebrow","heading_emphasis","heading_line_1","heading_line_2","image_alt","image_path","is_enabled","section_key","updated_at"]},{"name":"public.home_bespoke_showcase_section","owner":"hod_migration","rls":true,"all":true,"columns":["cta_label","eyebrow","heading","image_alt","image_path","is_enabled","mobile_image_path","section_key","sort_order","subtitle","updated_at"]},{"name":"public.home_instagram_reels","owner":"hod_migration","rls":true,"all":true,"columns":["cover_image_url","display_order","id","instagram_url","is_enabled","section_key","title"]},{"name":"public.home_instagram_reels_section","owner":"hod_migration","rls":true,"all":true,"columns":["section_key"]},{"name":"public.homepage_hero","owner":"hod_migration","rls":true,"all":true,"columns":["id","is_active","section_key","seo_description","seo_title","slider_enabled"]},{"name":"public.homepage_hero_slider_items","owner":"hod_migration","rls":true,"all":true,"columns":["button_link","button_text","headline","hero_id","id","image_path","mobile_image_path","sort_order","subtitle"]},{"name":"public.homepage_shop_by_category","owner":"hod_migration","rls":true,"all":true,"columns":["desktop_columns","heading","id","is_enabled","mobile_columns","section_key","shop_all_label","shop_all_link","tablet_columns"]},{"name":"public.homepage_shop_by_category_items","owner":"hod_migration","rls":true,"all":true,"columns":["category_id","display_order","id","is_active","item_type","option_id","section_id","subcategory_id"]},{"name":"public.navbar_featured_cards","owner":"hod_migration","rls":true,"all":true,"columns":["column_number","display_order","id","navbar_item_id","sort_order"]},{"name":"public.navbar_section_links","owner":"hod_migration","rls":true,"all":true,"columns":["column_number","display_order","id","navbar_item_id","section_id","sort_order"]},{"name":"public.navbar_section_source_items","owner":"hod_migration","rls":true,"all":true,"columns":["column_number","display_order","id","navbar_item_id","section_id","sort_order"]},{"name":"public.navbar_sections","owner":"hod_migration","rls":true,"all":true,"columns":["column_number","display_order","id","navbar_item_id","sort_order"]},{"name":"public.newsletter_submissions","owner":"hod_migration","rls":true,"all":false,"columns":["created_at","email","id","source","status"]},{"name":"public.order_items","owner":"hod_migration","rls":true,"all":true,"columns":[]},{"name":"public.order_love_letters","owner":"hod_migration","rls":true,"all":true,"columns":[]},{"name":"public.orders","owner":"hod_migration","rls":true,"all":true,"columns":[]},{"name":"public.promotion_popup","owner":"hod_migration","rls":true,"all":true,"columns":["cta_action","cta_link","cta_text","description","id","image_alt","image_only_mode","image_path","is_active","label","mobile_image_path","section_key","selected_coupon_id","show_once_per_session","title","updated_at"]},{"name":"public.promotion_popup_questions","owner":"hod_migration","rls":true,"all":true,"columns":["field_key","id","promotion_id","question","sort_order"]},{"name":"public.promotion_popup_responses","owner":"hod_migration","rls":true,"all":false,"columns":["answers","coupon_revealed","created_at","email","id","promotion_id","revealed_at"]},{"name":"public.service_banner_blocks","owner":"hod_migration","rls":true,"all":true,"columns":["id","sort_order"]},{"name":"public.service_banner_section","owner":"hod_migration","rls":true,"all":true,"columns":["id","image_alt","image_path","is_enabled","updated_at"]},{"name":"public.site_settings","owner":"hod_migration","rls":true,"all":false,"columns":["default_gst_slab_id","estimated_delivery_text","maintenance_mode_enabled","maintenance_mode_message","settings_key","whatsapp_number"]},{"name":"public.support_announcement_bar","owner":"hod_migration","rls":true,"all":true,"columns":["autoplay","id","is_active","section_key","speed_ms","updated_at"]},{"name":"public.support_announcement_bar_items","owner":"hod_migration","rls":true,"all":true,"columns":["bar_id","id","sort_order"]},{"name":"public.support_faq_categories","owner":"hod_migration","rls":true,"all":true,"columns":["id","image_alt","image_path","is_active","name","slug","sort_order"]},{"name":"public.support_faq_items","owner":"hod_migration","rls":true,"all":true,"columns":["id","section_id","sort_order"]},{"name":"public.support_faq_section","owner":"hod_migration","rls":true,"all":true,"columns":["id","section_key","subtitle","title","updated_at"]}]'::jsonb)
 AS x(name text,owner text,rls boolean,"all" boolean,columns jsonb);
DO $guard$
DECLARE r record;
BEGIN
 IF current_database()<>'hod_staging' OR session_user<>'hod_dev_migration' THEN
  RAISE EXCEPTION 'Use HOD Staging / hod_dev_migration / hod_staging; nothing installed'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hod_admin_app' AND NOT rolcanlogin
  AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
 OR EXISTS(SELECT FROM pg_roles WHERE rolname<>'hod_admin_app' AND pg_has_role('hod_admin_app',oid,'MEMBER'))
 THEN RAISE EXCEPTION 'Admin capability must remain isolated'; END IF;
 FOR r IN SELECT * FROM admin_read08_scope LOOP
  IF r.owner NOT IN ('hod_migration','hod_dev_migration') OR NOT pg_has_role(session_user,r.owner,'SET')
  OR NOT EXISTS(SELECT FROM pg_class WHERE oid=to_regclass(r.name) AND relkind='r'
   AND relowner::regrole::text=r.owner AND relrowsecurity=r.rls AND NOT relforcerowsecurity)
  THEN RAISE EXCEPTION 'Table/owner/RLS differs from reviewed evidence: %',r.name; END IF;
  EXECUTE format('SET LOCAL ROLE %I',r.owner);
  EXECUTE format('LOCK TABLE %s IN SHARE UPDATE EXCLUSIVE MODE',r.name);
  EXECUTE 'RESET ROLE';
  IF EXISTS(SELECT FROM pg_policies WHERE schemaname='public' AND tablename=split_part(r.name,'.',2)
    AND (policyname='hod_admin_feature_read_v1' OR permissive<>'PERMISSIVE'))
  OR has_any_column_privilege('hod_admin_app',to_regclass(r.name),'SELECT')
  OR has_table_privilege('hod_admin_app',to_regclass(r.name),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  OR has_any_column_privilege('hod_admin_app',to_regclass(r.name),'INSERT,UPDATE,REFERENCES')
  THEN RAISE EXCEPTION 'Existing permission/policy differs; do not replay: %',r.name; END IF;
 END LOOP;
END $guard$;
CREATE TEMP TABLE admin_read08_before ON COMMIT DROP AS
SELECT s.name,
 (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policyname),'[]'::jsonb) FROM pg_policies p
  WHERE p.schemaname='public' AND p.tablename=split_part(s.name,'.',2)) AS policies,
 (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb)
  FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  WHERE a.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app')) AS other_acl,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'acl',
   (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
    FROM aclexplode(a.attacl) x WHERE x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))) ORDER BY a.attnum),'[]'::jsonb)
  FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS column_acl
FROM admin_read08_scope s JOIN pg_class c ON c.oid=to_regclass(s.name);
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.about_founders TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.about_founders FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.about_hero TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.about_hero FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.about_timeline TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.about_timeline FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT("description","icon_path","id","image_alt","image_path","sort_order","title") ON public.about_values TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.about_values FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.about_wide_banner TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.about_wide_banner FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT("admin_user_id","notification_key") ON public.admin_notification_reads TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.admin_notification_reads FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.bespoke_form_carat_options TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.bespoke_form_carat_options FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.bespoke_form_guarantees TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.bespoke_form_guarantees FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.bespoke_form_metal_options TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.bespoke_form_metal_options FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.bespoke_form_piece_types TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.bespoke_form_piece_types FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.bespoke_form_settings TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.bespoke_form_settings FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.bespoke_form_stone_options TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.bespoke_form_stone_options FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.bespoke_hero_content TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.bespoke_hero_content FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.bespoke_hero_slider_items TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.bespoke_hero_slider_items FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.bespoke_portfolio_categories TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.bespoke_portfolio_categories FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.bespoke_portfolio_items TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.bespoke_portfolio_items FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.bespoke_process_cards TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.bespoke_process_cards FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT("description","eyebrow","id","image_path","media_path","media_type","sort_order","step","title") ON public.bespoke_process_steps TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.bespoke_process_steps FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT("approx_carat","country","created_at","email","full_name","id","message","phone","piece_type","preferred_metal","status","stone_preference") ON public.bespoke_submissions TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.bespoke_submissions FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.blog_page_hero TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.blog_page_hero FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.blog_post_content_blocks TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.blog_post_content_blocks FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.blog_post_products TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.blog_post_products FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.blog_post_tags TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.blog_post_tags FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.blog_posts TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.blog_posts FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.certifications_items TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.certifications_items FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.certifications_section TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.certifications_section FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.checkout_result_page TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.checkout_result_page FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.checkout_result_states TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.checkout_result_states FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.cms_home_bestseller_products TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.cms_home_bestseller_products FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.cms_home_bestsellers TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.cms_home_bestsellers FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.cms_summary_pointers TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.cms_summary_pointers FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.cms_summary_sections TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.cms_summary_sections FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.collection_items TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.collection_items FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.collection_page_config TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.collection_page_config FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.contact_hero TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.contact_hero FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.contact_info TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.contact_info FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT("created_at","email","full_name","id","message","phone","status","topic") ON public.contact_submissions TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.contact_submissions FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT("banner_description","banner_enabled","banner_title","code","created_at","discount_type","discount_value","ends_at","featured_priority","gift_banner_image_url","gift_product_id","gift_variant_data","id","is_active","minimum_order_amount","reward_type","starts_at","title","usage_count","usage_limit") ON public.coupons TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.coupons FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_dev_migration";
GRANT SELECT("created_at","email","email_verified","id") ON public.customer_identities TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.customer_identities FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_dev_migration";
GRANT SELECT("first_name","identity_id","last_name") ON public.customer_profiles TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.customer_profiles FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.discover_shapes_items TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.discover_shapes_items FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.docs_blocks TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.docs_blocks FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.docs_pages TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.docs_pages FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.education_page_hero TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.education_page_hero FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.education_post_content_blocks TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.education_post_content_blocks FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.education_post_products TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.education_post_products FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.education_post_tags TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.education_post_tags FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.education_posts TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.education_posts FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.hiphop_showcase_section TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.hiphop_showcase_section FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.home_bespoke_showcase_section TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.home_bespoke_showcase_section FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.home_instagram_reels TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.home_instagram_reels FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.home_instagram_reels_section TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.home_instagram_reels_section FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.homepage_hero TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.homepage_hero FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.homepage_hero_slider_items TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.homepage_hero_slider_items FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.homepage_shop_by_category TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.homepage_shop_by_category FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.homepage_shop_by_category_items TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.homepage_shop_by_category_items FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.navbar_featured_cards TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.navbar_featured_cards FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.navbar_section_links TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.navbar_section_links FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.navbar_section_source_items TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.navbar_section_source_items FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.navbar_sections TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.navbar_sections FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT("created_at","email","id","source","status") ON public.newsletter_submissions TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.newsletter_submissions FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.order_items TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.order_items FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.order_love_letters TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.order_love_letters FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.orders TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.orders FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.promotion_popup TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.promotion_popup FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.promotion_popup_questions TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.promotion_popup_questions FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT("answers","coupon_revealed","created_at","email","id","promotion_id","revealed_at") ON public.promotion_popup_responses TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.promotion_popup_responses FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.service_banner_blocks TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.service_banner_blocks FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.service_banner_section TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.service_banner_section FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT("default_gst_slab_id","estimated_delivery_text","maintenance_mode_enabled","maintenance_mode_message","settings_key","whatsapp_number") ON public.site_settings TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.site_settings FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.support_announcement_bar TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.support_announcement_bar FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.support_announcement_bar_items TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.support_announcement_bar_items FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.support_faq_categories TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.support_faq_categories FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.support_faq_items TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.support_faq_items FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
SET LOCAL ROLE "hod_migration";
GRANT SELECT ON public.support_faq_section TO hod_admin_app;
CREATE POLICY hod_admin_feature_read_v1 ON public.support_faq_section FOR SELECT TO hod_admin_app USING(true);
RESET ROLE;
DO $verify$
DECLARE r record; b record; after_policies jsonb; after_acl jsonb; after_columns jsonb;
BEGIN
 FOR r IN SELECT * FROM admin_read08_scope LOOP
  SELECT * INTO b FROM admin_read08_before WHERE name=r.name;
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policyname),'[]'::jsonb) INTO after_policies
   FROM pg_policies p WHERE schemaname='public' AND tablename=split_part(r.name,'.',2) AND policyname<>'hod_admin_feature_read_v1';
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type),'[]'::jsonb) INTO after_acl
   FROM pg_class c,LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
   WHERE c.oid=to_regclass(r.name) AND a.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app');
  SELECT coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'acl',
    (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.grantor,x.grantee,x.privilege_type),'[]'::jsonb)
     FROM aclexplode(a.attacl) x WHERE x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='hod_admin_app'))) ORDER BY a.attnum),'[]'::jsonb)
   INTO after_columns FROM pg_attribute a WHERE a.attrelid=to_regclass(r.name) AND a.attnum>0 AND NOT a.attisdropped;
  IF b.policies IS DISTINCT FROM after_policies OR b.other_acl IS DISTINCT FROM after_acl
   OR b.column_acl IS DISTINCT FROM after_columns
   OR has_table_privilege('hod_admin_app',to_regclass(r.name),'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege('hod_admin_app',to_regclass(r.name),'INSERT,UPDATE,REFERENCES')
   OR (r."all" AND NOT has_table_privilege('hod_admin_app',to_regclass(r.name),'SELECT'))
   OR (NOT r."all" AND EXISTS(SELECT FROM jsonb_array_elements_text(r.columns) c
     WHERE NOT has_column_privilege('hod_admin_app',to_regclass(r.name),c.value,'SELECT')))
  THEN RAISE EXCEPTION 'Read-only/preservation postcondition failed: %',r.name; END IF;
 END LOOP;
END $verify$;
COMMIT;
SELECT jsonb_build_object('database',current_database(),'installed',true,'read_permission_tables',75,
 'writes_added',false,'providers_switched',false,'next','Run the real feature read checker; writes, media and login remain separate.') AS admin_feature_read_setup_result;
