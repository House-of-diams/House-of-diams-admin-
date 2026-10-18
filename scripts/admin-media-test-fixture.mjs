import {PGlite} from '@electric-sql/pglite'
import {mediaCoreSql} from './admin-media-schema-sql.mjs'
export const mediaFixtureActor={profileId:'133321f4-53bb-4ef1-a9d6-7d0031080b75',issuer:'https://auth-uat.houseofdiams.com/realms/houseofdiams',subject:'1167a5b6-9fcb-45d1-b7d8-53e95cd49704'}
export async function createMediaFixture({schema=true}={}){
 const db=new PGlite()
 try{
  await db.exec(`CREATE ROLE hod_migration LOGIN INHERIT;CREATE ROLE hod_dev_migration LOGIN NOINHERIT;
   CREATE ROLE hod_admin_app NOLOGIN NOINHERIT;CREATE ROLE hod_admin_login_uat LOGIN NOINHERIT;CREATE ROLE hod_app NOLOGIN;
   GRANT hod_migration TO hod_dev_migration WITH INHERIT FALSE,SET TRUE;
   GRANT hod_admin_app TO hod_admin_login_uat WITH INHERIT FALSE,SET TRUE;
   GRANT CREATE ON DATABASE postgres TO hod_migration;GRANT USAGE,CREATE ON SCHEMA public TO hod_migration;
   GRANT USAGE ON SCHEMA public TO hod_admin_app;
   CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text);
   CREATE TABLE public.admin_identities(issuer text NOT NULL,subject text NOT NULL,profile_id uuid NOT NULL REFERENCES public.profiles(id),enabled boolean NOT NULL DEFAULT false,revoked_at timestamptz,PRIMARY KEY(issuer,subject));
   ALTER TABLE public.profiles OWNER TO hod_migration;ALTER TABLE public.admin_identities OWNER TO hod_migration;
   ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;ALTER TABLE public.admin_identities ENABLE ROW LEVEL SECURITY;
   INSERT INTO public.profiles VALUES('${mediaFixtureActor.profileId}','admin');
   INSERT INTO public.admin_identities(issuer,subject,profile_id,enabled) VALUES('${mediaFixtureActor.issuer}','${mediaFixtureActor.subject}','${mediaFixtureActor.profileId}',true);`)
  if(schema)await db.exec('SET ROLE hod_migration;'+mediaCoreSql+'RESET ROLE;')
  return db
 }catch(error){await db.close();throw error}
}
