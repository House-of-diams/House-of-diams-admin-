-- NOT AUTHORIZED TO RUN. Concrete review candidate, not installed/production-ready SQL.
\set ON_ERROR_STOP on
BEGIN;
WITH expected(signature,owner,definer,sha256) AS (VALUES
('public.admin_inventory_set_stock_v1(uuid, uuid, integer, integer, text)','hod_migration',true,'65287189b1ab656a04be6c1d00424c67033f5f98753dc50496aa11d00402b0fc'),
('public.admin_product_activate_drafts_v1(uuid, uuid, text, uuid[])','hod_migration',true,'1579ce2c46429b9224f2a209e6e08801dfe373c4a6c0aa51d9c9fae7c0647673'),
('public.admin_product_bulk_delete_v1(uuid, uuid, text, uuid[])','hod_migration',true,'8b8c15011bd1af575df76821df69074f19e948b316d9e891bbe9c716f77b6101'),
('public.admin_product_bulk_price_v1(uuid, uuid, text, text, numeric, uuid[], jsonb)','hod_migration',true,'3b0c0b3c22da36146561354b0c0cd45d7d590ac0d29568639c95f276de538411'),
('public.admin_product_save_v1(uuid, uuid, text, jsonb)','hod_migration',true,'49fd85e32734750a5e53855271bb7b5c39f080d58cce6fd3eb038712466e3239'),
('public.bespoke_form_save_v1(uuid, uuid, text, jsonb, jsonb, jsonb)','hod_migration',false,'c473d2820cf3ff1b22fe7b964ed2e2aa59007d86acab230738a46e2edd6d3c45'),
('public.bespoke_form_snapshot_v1()','hod_migration',false,'867a68c68f83e3f4cb6d4256f90ec6ef2730da9602448b10d7c2f49be8d082c1'),
('public.bespoke_hero_save_v1(uuid, uuid, text, jsonb, jsonb, uuid[])','hod_migration',false,'17acc657d5b576fba5efe1012163f2631668a2a632abf956b6a95cc9af4ee413'),
('public.bespoke_hero_snapshot_v1()','hod_migration',false,'e8d5298ede6d4244436f7b07c7a8dd7ae8dfe217acdabc19dc88760f045836f4'),
('public.catalog_delete_master_v1(uuid, uuid, text, text, uuid)','hod_migration',true,'b25201dd0605279eb2ee67c81f33d2c8d96cd152d96b906f1f388a32cbd2c29d'),
('public.catalog_hierarchy_delete_v1(uuid, uuid, text, text, uuid)','hod_migration',true,'82b5bd38f313e544f5b7e4dd957812ec430ac0e933fd390aac43548ce5878594'),
('public.catalog_hierarchy_list_v1(text)','hod_migration',true,'22d0fe73cd3496da1e6a90a5b3f8464a7fd8cba812edb1e9e384bf455caecd4e'),
('public.catalog_hierarchy_row_v1(text, uuid)','hod_migration',true,'3644df684414b7416362579fdbb5009a7a40ad1bc4136ba05705be89a3b7972d'),
('public.catalog_hierarchy_save_v1(uuid, uuid, text, text, uuid, jsonb)','hod_migration',true,'62897841c058cb3085685b8eaf1bd7e3596afc12621f23f13147a2ed720b51d5'),
('public.catalog_master_list_v1(text)','hod_migration',true,'128e5b82be92ebcbfd77487ac51444890e3c8027fd71542133a1eb6ece432f30'),
('public.catalog_master_row_v1(text, uuid)','hod_migration',true,'b6cdadc41209f346a87d009a32e2ce4db82c07768d6b202a3065fe95c18084c6'),
('public.catalog_metal_delete_v1(uuid, uuid, text, uuid)','hod_migration',true,'0f18510c7e91c6d1435415846ad08abd48abcc0645fc063b5cc760a55db69ed4'),
('public.catalog_metal_list_v1()','hod_migration',true,'f6f175c39221967f314b2b438c600b470dae4224bf58dc909469a6596d247658'),
('public.catalog_metal_row_v1(uuid)','hod_migration',true,'1134eeb16dcd4cd8032d7807c54f16dceb92fc33da91a4585799cf1ba37f0088'),
('public.catalog_metal_save_v1(uuid, uuid, text, uuid, jsonb, jsonb, bigint[])','hod_migration',true,'f656b939f762ef83057d83fc8191f90af2fe47031192feb0dbd6334424d1563f'),
('public.catalog_ring_save_v1(uuid, uuid, text, jsonb, jsonb, text[], text[])','hod_migration',true,'5a5b3bbd812621739ba0e7558a2c1ce43545387d4f471767073b25a724859bef'),
('public.catalog_ring_snapshot_v1()','hod_migration',true,'30a088a7e6e60837495693cde857ddbf9fb37f345b265639db7a59bba3ed6133'),
('public.catalog_save_master_v1(uuid, uuid, text, text, uuid, jsonb)','hod_migration',true,'c308cb378349ce7461d2d19b15890b764c347d39ac22a42ca925da13ef10b4bf'),
('public.cms_article_snapshot_v1(text, bigint)','hod_migration',false,'86b66882a5f14b7a46bcbf6d48a21ea430046cad859f40ca3124ffd8feb54608'),
('public.cms_content_list_snapshot_v1(text)','hod_migration',false,'d7ed424955a4f629fb2e56cbc068ab07616c8800f20fc7b1eda7c99a34f11a38'),
('public.cms_delete_article_v1(uuid, uuid, text, bigint, text)','hod_migration',false,'8a6d58ac9b5d05aaa840267a174a9b8dd6a2a203b21ddd2cf768dd40abe02447'),
('public.cms_delete_support_faq_category_v1(uuid, uuid, text, bigint)','hod_migration',false,'78535159fd2ba66d4ca9a48b55e94a9ea565fc19a31a7d449ee030df8cc08635'),
('public.cms_docs_snapshot_v1(text)','hod_migration',false,'06435336b9d0123d87c5abee63711168885e746898876d1f6b2ef84011962020'),
('public.cms_home_group1_snapshot_v1(text)','hod_migration',false,'afe05b2a80f37ae5491bc11a8800b6c9689172b68d5cf5a507ba015112a06478'),
('public.cms_reels_snapshot_v1()','hod_migration',false,'84ef9361cf13d25b103a13b8fc0198d6e2334ff59c6cd11270c956c1efa276e0'),
('public.cms_relational_snapshot_v1(text)','hod_migration',false,'b5edb1bd3805d4e18a549099e9ca627675b5b2cdd00f07ade4e86db7effbd698'),
('public.cms_save_article_v1(uuid, uuid, text, bigint, text, jsonb, jsonb, jsonb, jsonb, text[], text[], text[])','hod_migration',false,'eca8049b007138bf18c842f1b3a9bc09027d435909836b2380738706629c0318'),
('public.cms_save_content_list_v1(uuid, uuid, text, text, jsonb, text[])','hod_migration',false,'f768e090dd107683bc4a58679afb03a9f3f30f871854e41e44b13ffd747cc792'),
('public.cms_save_docs_page_v1(uuid, uuid, text, text, jsonb, jsonb, text[])','hod_migration',false,'7600db770744751c8073295fbba081b13179d49ecd182bccc86e000c90c0b390'),
('public.cms_save_home_group1_v1(uuid, uuid, text, text, jsonb, jsonb, text[])','hod_migration',false,'1fde6f272e8171fbc246300c9b3835a631a1bfdad1b618f8c09c49c1b46c96db'),
('public.cms_save_reels_v1(uuid, uuid, text, jsonb, jsonb, uuid[])','hod_migration',false,'62f68299e9eafa48e13d84ebe97244e0500790091d9a106d767438e20f40b05a'),
('public.cms_save_relational_v1(uuid, uuid, text, text, jsonb, jsonb, text[])','hod_migration',false,'921b4fdbbbe080c911778bb48118ce380fbe1049ecc454a4017f3b5b112a7f0f'),
('public.cms_save_singleton_v1(uuid, uuid, text, text, jsonb)','hod_migration',false,'dc5fb74b7716e787276b6b3a713080e4756df11c3845dd4afd5ddb17e4c9f9c6'),
('public.cms_save_support_faq_category_v1(uuid, uuid, text, bigint, jsonb)','hod_migration',false,'44bee51c4c431789e675ac31daf78afc5d5edea3e7178e1358644462428c1616'),
('public.cms_singleton_snapshot_v1(text)','hod_migration',false,'def762e70efaf5eef0c5dd644f933e70e3cbd3e8845838ebfdf473f99cbd5b7a'),
('public.cms_support_faq_categories_v1()','hod_migration',false,'03af8cae0a969d61f10a3191e2a7b46f34c64c2a5c618c1e66722ee54998510c'),
('public.duplicate_product(uuid, uuid, uuid)','hod_migration',true,'6399ed7f5ef20c613fa12f50f7c3bc3161c43d48a5a668ece29f19d3761ec337'),
('public.navbar_item_save_v1(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, uuid[], uuid[], bigint[], uuid[])','hod_migration',false,'185172fc0aa130ce46a852cae3a7efc73688cff03e7e739b9367ac4fac6d16d3'),
('public.navbar_item_snapshot_v1(uuid)','hod_migration',false,'3741631b2ab1c8fc33ddd276b5e7724d8c0acab817674f8f39bf687d141db2d1'),
('public.navbar_save_v1(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, uuid[], uuid[], bigint[], uuid[])','hod_migration',false,'acc6bf38fa02d349aad5d17843413a16ff5d8931ba723bb91fb0b751b60ce247'),
('public.navbar_snapshot_v1()','hod_migration',false,'5c19f241cb30ca03a085f2e000fb13ebb1ff347fe48e612353cbad8af769420c')
)
SELECT e.*,p.oid::regprocedure AS installed,p.proowner::regrole AS actual_owner,p.prosecdef,p.proconfig,p.proacl,
 CASE WHEN p.oid IS NULL THEN 'ABSENT' WHEN p.proowner::regrole::text<>e.owner OR p.prosecdef<>e.definer
 OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>e.sha256 THEN 'DRIFT' ELSE 'MATCH_DATED_EVIDENCE' END AS disposition
FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);
DO $guard$ BEGIN
 IF current_setting('d1c.feature_review',true) IS DISTINCT FROM 'APPROVED_CURRENT_ACL_RLS_DEFAULT_TRIGGER_MANIFEST'
 THEN RAISE EXCEPTION 'STOP: unresolved current per-feature RLS/default/trigger/locking dependencies'; END IF;
 IF EXISTS(WITH expected(signature,owner,definer,sha256) AS (VALUES ('public.admin_inventory_set_stock_v1(uuid, uuid, integer, integer, text)','hod_migration',true,'65287189b1ab656a04be6c1d00424c67033f5f98753dc50496aa11d00402b0fc'),
('public.admin_product_activate_drafts_v1(uuid, uuid, text, uuid[])','hod_migration',true,'1579ce2c46429b9224f2a209e6e08801dfe373c4a6c0aa51d9c9fae7c0647673'),
('public.admin_product_bulk_delete_v1(uuid, uuid, text, uuid[])','hod_migration',true,'8b8c15011bd1af575df76821df69074f19e948b316d9e891bbe9c716f77b6101'),
('public.admin_product_bulk_price_v1(uuid, uuid, text, text, numeric, uuid[], jsonb)','hod_migration',true,'3b0c0b3c22da36146561354b0c0cd45d7d590ac0d29568639c95f276de538411'),
('public.admin_product_save_v1(uuid, uuid, text, jsonb)','hod_migration',true,'49fd85e32734750a5e53855271bb7b5c39f080d58cce6fd3eb038712466e3239'),
('public.bespoke_form_save_v1(uuid, uuid, text, jsonb, jsonb, jsonb)','hod_migration',false,'c473d2820cf3ff1b22fe7b964ed2e2aa59007d86acab230738a46e2edd6d3c45'),
('public.bespoke_form_snapshot_v1()','hod_migration',false,'867a68c68f83e3f4cb6d4256f90ec6ef2730da9602448b10d7c2f49be8d082c1'),
('public.bespoke_hero_save_v1(uuid, uuid, text, jsonb, jsonb, uuid[])','hod_migration',false,'17acc657d5b576fba5efe1012163f2631668a2a632abf956b6a95cc9af4ee413'),
('public.bespoke_hero_snapshot_v1()','hod_migration',false,'e8d5298ede6d4244436f7b07c7a8dd7ae8dfe217acdabc19dc88760f045836f4'),
('public.catalog_delete_master_v1(uuid, uuid, text, text, uuid)','hod_migration',true,'b25201dd0605279eb2ee67c81f33d2c8d96cd152d96b906f1f388a32cbd2c29d'),
('public.catalog_hierarchy_delete_v1(uuid, uuid, text, text, uuid)','hod_migration',true,'82b5bd38f313e544f5b7e4dd957812ec430ac0e933fd390aac43548ce5878594'),
('public.catalog_hierarchy_list_v1(text)','hod_migration',true,'22d0fe73cd3496da1e6a90a5b3f8464a7fd8cba812edb1e9e384bf455caecd4e'),
('public.catalog_hierarchy_row_v1(text, uuid)','hod_migration',true,'3644df684414b7416362579fdbb5009a7a40ad1bc4136ba05705be89a3b7972d'),
('public.catalog_hierarchy_save_v1(uuid, uuid, text, text, uuid, jsonb)','hod_migration',true,'62897841c058cb3085685b8eaf1bd7e3596afc12621f23f13147a2ed720b51d5'),
('public.catalog_master_list_v1(text)','hod_migration',true,'128e5b82be92ebcbfd77487ac51444890e3c8027fd71542133a1eb6ece432f30'),
('public.catalog_master_row_v1(text, uuid)','hod_migration',true,'b6cdadc41209f346a87d009a32e2ce4db82c07768d6b202a3065fe95c18084c6'),
('public.catalog_metal_delete_v1(uuid, uuid, text, uuid)','hod_migration',true,'0f18510c7e91c6d1435415846ad08abd48abcc0645fc063b5cc760a55db69ed4'),
('public.catalog_metal_list_v1()','hod_migration',true,'f6f175c39221967f314b2b438c600b470dae4224bf58dc909469a6596d247658'),
('public.catalog_metal_row_v1(uuid)','hod_migration',true,'1134eeb16dcd4cd8032d7807c54f16dceb92fc33da91a4585799cf1ba37f0088'),
('public.catalog_metal_save_v1(uuid, uuid, text, uuid, jsonb, jsonb, bigint[])','hod_migration',true,'f656b939f762ef83057d83fc8191f90af2fe47031192feb0dbd6334424d1563f'),
('public.catalog_ring_save_v1(uuid, uuid, text, jsonb, jsonb, text[], text[])','hod_migration',true,'5a5b3bbd812621739ba0e7558a2c1ce43545387d4f471767073b25a724859bef'),
('public.catalog_ring_snapshot_v1()','hod_migration',true,'30a088a7e6e60837495693cde857ddbf9fb37f345b265639db7a59bba3ed6133'),
('public.catalog_save_master_v1(uuid, uuid, text, text, uuid, jsonb)','hod_migration',true,'c308cb378349ce7461d2d19b15890b764c347d39ac22a42ca925da13ef10b4bf'),
('public.cms_article_snapshot_v1(text, bigint)','hod_migration',false,'86b66882a5f14b7a46bcbf6d48a21ea430046cad859f40ca3124ffd8feb54608'),
('public.cms_content_list_snapshot_v1(text)','hod_migration',false,'d7ed424955a4f629fb2e56cbc068ab07616c8800f20fc7b1eda7c99a34f11a38'),
('public.cms_delete_article_v1(uuid, uuid, text, bigint, text)','hod_migration',false,'8a6d58ac9b5d05aaa840267a174a9b8dd6a2a203b21ddd2cf768dd40abe02447'),
('public.cms_delete_support_faq_category_v1(uuid, uuid, text, bigint)','hod_migration',false,'78535159fd2ba66d4ca9a48b55e94a9ea565fc19a31a7d449ee030df8cc08635'),
('public.cms_docs_snapshot_v1(text)','hod_migration',false,'06435336b9d0123d87c5abee63711168885e746898876d1f6b2ef84011962020'),
('public.cms_home_group1_snapshot_v1(text)','hod_migration',false,'afe05b2a80f37ae5491bc11a8800b6c9689172b68d5cf5a507ba015112a06478'),
('public.cms_reels_snapshot_v1()','hod_migration',false,'84ef9361cf13d25b103a13b8fc0198d6e2334ff59c6cd11270c956c1efa276e0'),
('public.cms_relational_snapshot_v1(text)','hod_migration',false,'b5edb1bd3805d4e18a549099e9ca627675b5b2cdd00f07ade4e86db7effbd698'),
('public.cms_save_article_v1(uuid, uuid, text, bigint, text, jsonb, jsonb, jsonb, jsonb, text[], text[], text[])','hod_migration',false,'eca8049b007138bf18c842f1b3a9bc09027d435909836b2380738706629c0318'),
('public.cms_save_content_list_v1(uuid, uuid, text, text, jsonb, text[])','hod_migration',false,'f768e090dd107683bc4a58679afb03a9f3f30f871854e41e44b13ffd747cc792'),
('public.cms_save_docs_page_v1(uuid, uuid, text, text, jsonb, jsonb, text[])','hod_migration',false,'7600db770744751c8073295fbba081b13179d49ecd182bccc86e000c90c0b390'),
('public.cms_save_home_group1_v1(uuid, uuid, text, text, jsonb, jsonb, text[])','hod_migration',false,'1fde6f272e8171fbc246300c9b3835a631a1bfdad1b618f8c09c49c1b46c96db'),
('public.cms_save_reels_v1(uuid, uuid, text, jsonb, jsonb, uuid[])','hod_migration',false,'62f68299e9eafa48e13d84ebe97244e0500790091d9a106d767438e20f40b05a'),
('public.cms_save_relational_v1(uuid, uuid, text, text, jsonb, jsonb, text[])','hod_migration',false,'921b4fdbbbe080c911778bb48118ce380fbe1049ecc454a4017f3b5b112a7f0f'),
('public.cms_save_singleton_v1(uuid, uuid, text, text, jsonb)','hod_migration',false,'dc5fb74b7716e787276b6b3a713080e4756df11c3845dd4afd5ddb17e4c9f9c6'),
('public.cms_save_support_faq_category_v1(uuid, uuid, text, bigint, jsonb)','hod_migration',false,'44bee51c4c431789e675ac31daf78afc5d5edea3e7178e1358644462428c1616'),
('public.cms_singleton_snapshot_v1(text)','hod_migration',false,'def762e70efaf5eef0c5dd644f933e70e3cbd3e8845838ebfdf473f99cbd5b7a'),
('public.cms_support_faq_categories_v1()','hod_migration',false,'03af8cae0a969d61f10a3191e2a7b46f34c64c2a5c618c1e66722ee54998510c'),
('public.duplicate_product(uuid, uuid, uuid)','hod_migration',true,'6399ed7f5ef20c613fa12f50f7c3bc3161c43d48a5a668ece29f19d3761ec337'),
('public.navbar_item_save_v1(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, uuid[], uuid[], bigint[], uuid[])','hod_migration',false,'185172fc0aa130ce46a852cae3a7efc73688cff03e7e739b9367ac4fac6d16d3'),
('public.navbar_item_snapshot_v1(uuid)','hod_migration',false,'3741631b2ab1c8fc33ddd276b5e7724d8c0acab817674f8f39bf687d141db2d1'),
('public.navbar_save_v1(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, uuid[], uuid[], bigint[], uuid[])','hod_migration',false,'acc6bf38fa02d349aad5d17843413a16ff5d8931ba723bb91fb0b751b60ce247'),
('public.navbar_snapshot_v1()','hod_migration',false,'5c19f241cb30ca03a085f2e000fb13ebb1ff347fe48e612353cbad8af769420c'))
 SELECT FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 WHERE p.oid IS NULL OR p.proowner::regrole::text<>e.owner OR p.prosecdef<>e.definer
 OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>e.sha256)
 THEN RAISE EXCEPTION 'Routine signature/owner/mode/definition drift'; END IF;
END $guard$;
-- Exact routine EXECUTE candidates; PUBLIC/legacy ACL unchanged. Invoker dependencies are separately gated.
GRANT EXECUTE ON FUNCTION public.admin_inventory_set_stock_v1(uuid, uuid, integer, integer, text) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.admin_product_activate_drafts_v1(uuid, uuid, text, uuid[]) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.admin_product_bulk_delete_v1(uuid, uuid, text, uuid[]) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.admin_product_bulk_price_v1(uuid, uuid, text, text, numeric, uuid[], jsonb) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.admin_product_save_v1(uuid, uuid, text, jsonb) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.bespoke_form_save_v1(uuid, uuid, text, jsonb, jsonb, jsonb) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.bespoke_form_snapshot_v1() TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.bespoke_hero_save_v1(uuid, uuid, text, jsonb, jsonb, uuid[]) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.bespoke_hero_snapshot_v1() TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_delete_master_v1(uuid, uuid, text, text, uuid) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_hierarchy_delete_v1(uuid, uuid, text, text, uuid) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_hierarchy_list_v1(text) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_hierarchy_row_v1(text, uuid) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_hierarchy_save_v1(uuid, uuid, text, text, uuid, jsonb) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_master_list_v1(text) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_master_row_v1(text, uuid) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_metal_delete_v1(uuid, uuid, text, uuid) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_metal_list_v1() TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_metal_row_v1(uuid) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_metal_save_v1(uuid, uuid, text, uuid, jsonb, jsonb, bigint[]) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_ring_save_v1(uuid, uuid, text, jsonb, jsonb, text[], text[]) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_ring_snapshot_v1() TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.catalog_save_master_v1(uuid, uuid, text, text, uuid, jsonb) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_article_snapshot_v1(text, bigint) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_content_list_snapshot_v1(text) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_delete_article_v1(uuid, uuid, text, bigint, text) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_delete_support_faq_category_v1(uuid, uuid, text, bigint) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_docs_snapshot_v1(text) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_home_group1_snapshot_v1(text) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_reels_snapshot_v1() TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_relational_snapshot_v1(text) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_save_article_v1(uuid, uuid, text, bigint, text, jsonb, jsonb, jsonb, jsonb, text[], text[], text[]) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_save_content_list_v1(uuid, uuid, text, text, jsonb, text[]) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_save_docs_page_v1(uuid, uuid, text, text, jsonb, jsonb, text[]) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_save_home_group1_v1(uuid, uuid, text, text, jsonb, jsonb, text[]) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_save_reels_v1(uuid, uuid, text, jsonb, jsonb, uuid[]) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_save_relational_v1(uuid, uuid, text, text, jsonb, jsonb, text[]) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_save_singleton_v1(uuid, uuid, text, text, jsonb) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_save_support_faq_category_v1(uuid, uuid, text, bigint, jsonb) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_singleton_snapshot_v1(text) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.cms_support_faq_categories_v1() TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.duplicate_product(uuid, uuid, uuid) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.navbar_item_save_v1(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, uuid[], uuid[], bigint[], uuid[]) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.navbar_item_snapshot_v1(uuid) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.navbar_save_v1(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, uuid[], uuid[], bigint[], uuid[]) TO hod_admin_app;
GRANT EXECUTE ON FUNCTION public.navbar_snapshot_v1() TO hod_admin_app;
GRANT SELECT ON public.products TO hod_admin_app;
GRANT SELECT ON public.product_metal_selections TO hod_admin_app;
GRANT SELECT ON public.product_material_value_selections TO hod_admin_app;
GRANT SELECT ON public.product_stone_shapes TO hod_admin_app;
GRANT SELECT ON public.product_subcategory_links TO hod_admin_app;
GRANT SELECT ON public.product_option_links TO hod_admin_app;
GRANT SELECT ON public.product_purity_prices TO hod_admin_app;
GRANT SELECT ON public.product_metal_media TO hod_admin_app;
GRANT SELECT ON public.product_metal_variants TO hod_admin_app;
GRANT SELECT ON public.product_variant_media_items TO hod_admin_app;
GRANT SELECT ON public.product_faq_items TO hod_admin_app;
GRANT SELECT ON public.product_custom_dropdowns TO hod_admin_app;
GRANT SELECT ON public.product_custom_dropdown_options TO hod_admin_app;
GRANT SELECT ON public.catalog_categories TO hod_admin_app;
GRANT SELECT ON public.catalog_subcategories TO hod_admin_app;
GRANT SELECT ON public.catalog_options TO hod_admin_app;
GRANT SELECT ON public.catalog_metals TO hod_admin_app;
GRANT SELECT ON public.catalog_material_values TO hod_admin_app;
GRANT SELECT ON public.catalog_stone_shapes TO hod_admin_app;
GRANT SELECT ON public.catalog_certificates TO hod_admin_app;
GRANT SELECT ON public.catalog_ring_categories TO hod_admin_app;
GRANT SELECT ON public.catalog_ring_sizes TO hod_admin_app;
GRANT SELECT ON public.catalog_styles TO hod_admin_app;
GRANT SELECT ON public.catalog_gst_slabs TO hod_admin_app;
GRANT SELECT ON public.product_content_rules TO hod_admin_app;
GRANT SELECT ON public.navbar_items TO hod_admin_app;
GRANT SELECT ON public.seo_redirects TO hod_admin_app;
GRANT SELECT ON public.orders TO hod_admin_app;
GRANT SELECT ON public.order_items TO hod_admin_app;
GRANT SELECT ON public.order_love_letters TO hod_admin_app;
GRANT SELECT ON public.bespoke_portfolio_categories TO hod_admin_app;
GRANT SELECT ON public.bespoke_portfolio_items TO hod_admin_app;
GRANT UPDATE(status,stock_quantity) ON public.products TO hod_admin_app;
GRANT DELETE ON public.products TO hod_admin_app;
GRANT UPDATE(status,courier_name,courier_awb_number,shipped_at) ON public.orders TO hod_admin_app;
GRANT INSERT(product_id,order_id,adjustment_type,quantity_change,previous_stock,new_stock,notes) ON public.inventory_adjustments TO hod_admin_app;
GRANT SELECT(id,email,email_verified,created_at) ON public.customer_identities TO hod_admin_app;
GRANT SELECT(identity_id,first_name,last_name) ON public.customer_profiles TO hod_admin_app;
GRANT SELECT(admin_user_id,notification_key) ON public.admin_notification_reads TO hod_admin_app;
GRANT INSERT(admin_user_id,notification_key,read_at) ON public.admin_notification_reads TO hod_admin_app;
GRANT SELECT(settings_key,whatsapp_number,default_gst_slab_id,maintenance_mode_enabled,maintenance_mode_message,estimated_delivery_text) ON public.site_settings TO hod_admin_app;
GRANT INSERT(settings_key,whatsapp_number,default_gst_slab_id,maintenance_mode_enabled,maintenance_mode_message,estimated_delivery_text) ON public.site_settings TO hod_admin_app;
GRANT UPDATE(whatsapp_number,default_gst_slab_id,maintenance_mode_enabled,maintenance_mode_message,estimated_delivery_text) ON public.site_settings TO hod_admin_app;
GRANT INSERT(name,slug,image_path,display_order,status),UPDATE(name,slug,image_path,display_order,status,updated_at),DELETE ON public.bespoke_portfolio_categories TO hod_admin_app;
GRANT INSERT(title,tag,category_id,media_type,media_path,thumbnail_path,gem_style,gem_color,dark_theme,short_description,display_order,status),UPDATE(title,tag,category_id,media_type,media_path,thumbnail_path,gem_style,gem_color,dark_theme,short_description,display_order,status,updated_at),DELETE ON public.bespoke_portfolio_items TO hod_admin_app;
GRANT SELECT(id,code,title,discount_type,discount_value,reward_type,minimum_order_amount,gift_product_id,gift_variant_data,gift_banner_image_url,banner_enabled,banner_title,banner_description,starts_at,ends_at,featured_priority,usage_limit,is_active,usage_count,created_at),INSERT(code,title,discount_type,discount_value,reward_type,minimum_order_amount,gift_product_id,gift_variant_data,gift_banner_image_url,banner_enabled,banner_title,banner_description,starts_at,ends_at,featured_priority,usage_limit,is_active),UPDATE(code,title,discount_type,discount_value,reward_type,minimum_order_amount,gift_product_id,gift_variant_data,gift_banner_image_url,banner_enabled,banner_title,banner_description,starts_at,ends_at,featured_priority,usage_limit,is_active),DELETE ON public.coupons TO hod_admin_app;
-- SELECT FOR UPDATE on product historical-save path also requires a column UPDATE privilege (status supplied above).
-- Exact sequence candidates from saved defaults; current identity/default/nested-trigger evidence must match.
GRANT USAGE ON SEQUENCE public.coupons_id_seq,public.site_settings_id_seq TO hod_admin_app;
-- NOT COMPLETE: CMS/navbar invoker per-column writes/default/sequence and operational submissions projections
-- must be reconciled with current metadata; no broad grants are substituted. See D1c-SQL-dependency-disposition.json.
ROLLBACK;
