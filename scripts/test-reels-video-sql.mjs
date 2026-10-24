// Reels as uploaded videos: the real forward/rollback SQL and the real save routine, in an in-memory PostgreSQL (PGlite).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const read = (name) => fs.readFileSync(new URL(`../docs/sql-pending/${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const forward = read('16_reels_video.forward.sql')
const rollback = read('16_reels_video.rollback.sql')
// The routine as it is in the database today: the rollback file restores exactly that.
const routineStart = rollback.indexOf('create or replace function')
const routineOpen = rollback.indexOf('$function$', routineStart)
const routineEnd = rollback.indexOf('$function$', routineOpen + 1) + '$function$'.length
const originalRoutine = rollback.slice(routineStart, routineEnd) + ';'

test('the SQL copies in the repo match the ones handed to the database owner', () => {
  for (const name of ['forward', 'rollback']) {
    const external = new URL(`../../sql-to-apply/phase-9/16_reels_video.${name}.sql`, import.meta.url)
    if (fs.existsSync(external)) assert.equal(fs.readFileSync(external, 'utf8').replace(/\r\n/g, '\n'), name === 'forward' ? forward : rollback, name)
  }
})

const ACTOR = '00000000-0000-4000-8000-000000000001'
const ig = (slug) => `https://www.instagram.com/reel/${slug}/`
const video = (name, ext = 'mp4') => `https://media.houseofdiams.com/products/videos/${name}.${ext}`

async function database({ apply = true } = {}) {
  const pg = new PGlite()
  await pg.exec(`CREATE ROLE hod_migration NOLOGIN; CREATE ROLE hod_admin_app NOLOGIN; CREATE ROLE hod_app NOLOGIN;
    GRANT USAGE, CREATE ON SCHEMA public TO hod_migration; GRANT USAGE ON SCHEMA public TO hod_admin_app, hod_app;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, role text NOT NULL);
    CREATE TABLE public.cms_save_receipts (actor_id uuid NOT NULL, request_id uuid NOT NULL, operation text NOT NULL, payload_hash text NOT NULL, result jsonb NOT NULL, PRIMARY KEY (actor_id, request_id));
    CREATE TABLE public.home_instagram_reels_section (section_key text PRIMARY KEY, heading text NOT NULL, subtitle text NOT NULL DEFAULT '', is_enabled boolean NOT NULL DEFAULT true,
      marquee_duration_seconds integer NOT NULL DEFAULT 40, pause_on_hover boolean NOT NULL DEFAULT true);
    CREATE TABLE public.home_instagram_reels (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), section_key text NOT NULL DEFAULT 'home_instagram_reels', instagram_url text NOT NULL,
      title text NOT NULL DEFAULT '', display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0), is_enabled boolean NOT NULL DEFAULT true, created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), cover_image_url text CHECK (cover_image_url IS NULL OR length(cover_image_url) <= 1000),
      CONSTRAINT home_instagram_reels_url_length CHECK (char_length(instagram_url) <= 500),
      CONSTRAINT home_instagram_reels_valid_url CHECK (instagram_url ~* '^https://(www\\.)?instagram\\.com/(reel|reels|p|tv)/[a-z0-9_-]+/?(\\?.*)?$'));
    CREATE UNIQUE INDEX home_instagram_reels_url_unique ON public.home_instagram_reels (instagram_url);
    CREATE FUNCTION public.cms_reels_snapshot_v1() RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'pg_catalog', 'public' AS $f$
      with snapshot as (select (select to_jsonb(s) from public.home_instagram_reels_section s where s.section_key = 'home_instagram_reels') as section,
        coalesce((select jsonb_agg(to_jsonb(r) order by r.display_order, r.id) from public.home_instagram_reels r where r.section_key = 'home_instagram_reels'), '[]'::jsonb) as items)
      select jsonb_build_object('section', section, 'items', items, 'revision', md5(jsonb_build_object('section', section, 'items', items)::text)) from snapshot; $f$;
    INSERT INTO public.profiles VALUES ('${ACTOR}', 'admin');
    INSERT INTO public.home_instagram_reels_section (section_key, heading) VALUES ('home_instagram_reels', 'Reels');
    INSERT INTO public.home_instagram_reels (instagram_url, title, display_order) VALUES ('${ig('AAA')}', 'one', 0), ('${ig('BBB')}', 'two', 1);`)
  await pg.exec(originalRoutine)
  await pg.exec(`ALTER TABLE public.home_instagram_reels OWNER TO hod_migration; ALTER FUNCTION public.cms_save_reels_v1(uuid,uuid,text,jsonb,jsonb,uuid[]) OWNER TO hod_migration;
    GRANT SELECT ON public.home_instagram_reels TO hod_admin_app, hod_app; GRANT INSERT (section_key, instagram_url, title, display_order, is_enabled, created_by, cover_image_url),
      UPDATE (instagram_url, title, display_order, is_enabled, cover_image_url) ON public.home_instagram_reels TO hod_admin_app; GRANT DELETE ON public.home_instagram_reels TO hod_admin_app;
    GRANT SELECT, INSERT, UPDATE ON public.home_instagram_reels_section, public.cms_save_receipts TO hod_admin_app; GRANT SELECT ON public.profiles TO hod_admin_app;`)
  if (apply) { await pg.exec('SET ROLE hod_migration'); await pg.exec(forward); await pg.exec('RESET ROLE') }
  return pg
}

async function save(pg, items, { deleted = [], section = {} } = {}) {
  const snapshot = (await pg.query('SELECT public.cms_reels_snapshot_v1() AS s')).rows[0].s
  const sectionBody = { heading: 'Reels', subtitle: '', is_enabled: true, marquee_duration_seconds: 40, pause_on_hover: true, ...section }
  await pg.exec('BEGIN; SET LOCAL ROLE hod_admin_app')
  try {
    const result = await pg.query('SELECT public.cms_save_reels_v1($1::uuid, gen_random_uuid(), $2::text, $3::jsonb, $4::jsonb, $5::uuid[]) AS r',
      [ACTOR, snapshot.revision, JSON.stringify(sectionBody), JSON.stringify(items), `{${deleted.join(',')}}`])
    await pg.exec('COMMIT'); return result.rows[0].r
  } catch (error) { await pg.exec('ROLLBACK'); throw error }
}
const rows = async (pg) => (await pg.query('SELECT * FROM public.home_instagram_reels ORDER BY display_order')).rows
const keep = (r) => ({ id: r.id, instagram_url: r.instagram_url, title: r.title, is_enabled: true })

test('before the update, the existing routine refuses a video reel (the reason the update exists)', async () => {
  const pg = await database({ apply: false })
  const current = await rows(pg)
  await assert.rejects(save(pg, [...current.map(keep), { video_url: video('a'), title: 'v', is_enabled: true }]), /Invalid reel/)
})

test('after the update: Instagram reels keep working and a video reel can be added, reordered and removed', async () => {
  const pg = await database()
  let current = await rows(pg)
  const added = await save(pg, [{ video_url: video('first'), title: 'Video', is_enabled: true }, ...current.map(keep)])
  assert.equal(added.items.length, 3); assert.equal(added.items[0].video_url, video('first')); assert.equal(added.items[0].instagram_url, null)
  current = await rows(pg)
  assert.deepEqual(current.map((r) => r.title), ['Video', 'one', 'two'])
  const swapped = await save(pg, [{ id: current[1].id, instagram_url: current[1].instagram_url, title: 'one', is_enabled: true }, { id: current[0].id, video_url: current[0].video_url, title: 'Video', is_enabled: true }, keep(current[2])])
  assert.deepEqual(swapped.items.map((r) => r.title), ['one', 'Video', 'two'])
  const removed = await save(pg, [keep(current[1]), keep(current[2])], { deleted: [current[0].id] })
  assert.equal(removed.items.length, 2)
})

test('a reel is exactly one of: Instagram link or video', async () => {
  const pg = await database(); const current = await rows(pg)
  const base = current.map(keep)
  for (const bad of [{ title: 'none', is_enabled: true }, { instagram_url: ig('CCC'), video_url: video('x'), title: 'both', is_enabled: true }, { instagram_url: null, video_url: null, title: 'nulls', is_enabled: true }])
    await assert.rejects(save(pg, [...base, bad]), /needs either an Instagram URL or an uploaded video/, JSON.stringify(bad))
})

test('only uploaded MP4, MOV and WebM files on the website media addresses are accepted', async () => {
  const pg = await database(); const base = (await rows(pg)).map(keep)
  for (const url of ['https://evil.example/a.mp4', 'http://media.houseofdiams.com/a.mp4', 'https://media.houseofdiams.com/a.gif', 'https://media.houseofdiams.com/a.mp4?x=1', 'https://media.houseofdiams.com/../a.mp4', 'https://media.houseofdiams.com.evil.example/a.mp4', 'javascript:alert(1)'])
    await assert.rejects(save(pg, [...base, { video_url: url, title: 'bad', is_enabled: true }]), /Invalid video address/, url)
  for (const ext of ['mp4', 'mov', 'webm']) await save(pg, [...(await rows(pg)).map((r) => (r.video_url ? { id: r.id, video_url: r.video_url, title: r.title, is_enabled: true } : keep(r))), { video_url: video(`ok-${ext}`, ext), title: ext, is_enabled: true }])
  assert.equal((await rows(pg)).length, 5)
})

test('the same address cannot appear twice, in the routine or in the table', async () => {
  const pg = await database(); const base = (await rows(pg)).map(keep)
  await assert.rejects(save(pg, [...base, { video_url: video('dup'), title: 'a', is_enabled: true }, { video_url: video('dup'), title: 'b', is_enabled: true }]), /must be unique/)
  await assert.rejects(pg.exec(`INSERT INTO public.home_instagram_reels (instagram_url, video_url) VALUES (NULL, '${video('t')}'), (NULL, '${video('t')}')`), /home_instagram_reels_video_unique|duplicate/)
  await assert.rejects(pg.exec(`INSERT INTO public.home_instagram_reels (instagram_url, video_url) VALUES ('${ig('ZZZ')}', '${video('both')}')`), /home_instagram_reels_one_source/)
})

test('the website user can read the new column; the admin user can write it', async () => {
  const pg = await database()
  assert.equal((await pg.query(`SELECT has_column_privilege('hod_app', 'public.home_instagram_reels', 'video_url', 'SELECT') AS ok`)).rows[0].ok, true)
  assert.equal((await pg.query(`SELECT has_column_privilege('hod_admin_app', 'public.home_instagram_reels', 'video_url', 'INSERT') AND has_column_privilege('hod_admin_app', 'public.home_instagram_reels', 'video_url', 'UPDATE') AS ok`)).rows[0].ok, true)
  assert.equal((await pg.query(`SELECT has_column_privilege('hod_app', 'public.home_instagram_reels', 'video_url', 'UPDATE') AS ok`)).rows[0].ok, false)
})

test('the update refuses to run twice; rollback is blocked while video reels exist, then restores the original', async () => {
  const pg = await database()
  await pg.exec('SET ROLE hod_migration')
  await assert.rejects(pg.exec(forward), /Already applied/); await pg.exec('ROLLBACK'); await pg.exec('RESET ROLE')
  await save(pg, [...(await rows(pg)).map(keep), { video_url: video('blocker'), title: 'v', is_enabled: true }])
  await pg.exec('SET ROLE hod_migration')
  await assert.rejects(pg.exec(rollback), /Video reels exist/); await pg.exec('ROLLBACK'); await pg.exec('SET ROLE hod_migration')
  const blocker = (await rows(pg)).find((r) => r.video_url)
  await pg.query('DELETE FROM public.home_instagram_reels WHERE id = $1', [blocker.id])
  await pg.exec(rollback); await pg.exec('RESET ROLE')
  const columns = (await pg.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'home_instagram_reels'`)).rows.map((r) => r.column_name)
  assert.equal(columns.includes('video_url'), false)
  assert.equal((await pg.query(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'home_instagram_reels' AND column_name = 'instagram_url'`)).rows[0].is_nullable, 'NO')
})
