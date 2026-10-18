// New isolated namespace only. No shared business object or existing role changes.
export const mediaSources=[
 ...['products/videos/','hiphop/videos/','bespoke/videos/','about/hero/video/'].map(prefix=>({bucket:'house-of-diams',baseUrl:'https://media.houseofdiams.com',prefix})),
 {bucket:'house-of-diams-hod',baseUrl:'https://content.houseofdiams.com',prefix:'about/hero/video/'}]
export const mediaPolicy='hod-uat-video-v1'
export const mediaIdentityBody=`
BEGIN
 IF p_actor IS NULL OR p_issuer IS NULL OR p_subject IS NULL THEN RETURN false; END IF;
 PERFORM 1 FROM public.admin_identities m JOIN public.profiles p ON p.id=m.profile_id
 WHERE m.profile_id=p_actor AND m.issuer=p_issuer AND m.subject=p_subject AND m.enabled
 AND m.revoked_at IS NULL AND p.role::text='admin' FOR SHARE OF m,p;
 RETURN FOUND;
END;
`
export const mediaGuardBody=`
DECLARE permitted boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retain media identity and audit' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['status','object_version','verified_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','object_version','verified_at'])
  THEN RAISE EXCEPTION 'Immutable media identity' USING ERRCODE='42501'; END IF;
  IF OLD.status='pending' AND NEW.status IN ('admitted','rejected') THEN NULL;
  ELSIF OLD.status='admitted' AND NEW.status='retired' AND current_user='hod_migration'
   AND NEW.object_version IS NOT DISTINCT FROM OLD.object_version AND NEW.verified_at IS NOT DISTINCT FROM OLD.verified_at THEN NULL;
  ELSE RAISE EXCEPTION 'Invalid media transition' USING ERRCODE='42501'; END IF;
 ELSE
  IF NEW.status<>'pending' OR NEW.object_version IS NOT NULL OR NEW.verified_at IS NOT NULL THEN
   RAISE EXCEPTION 'Media must start pending' USING ERRCODE='42501'; END IF;
 END IF;
 IF NEW.evidence='historical-current-object' AND current_user<>'hod_migration' THEN
  RAISE EXCEPTION 'Separate historical importer required' USING ERRCODE='42501'; END IF;
 IF NEW.status IN ('pending','admitted') THEN
  IF NOT admin_media.enrolled_actor(NEW.actor_id,NEW.actor_issuer,NEW.actor_subject) THEN
   RAISE EXCEPTION 'Enabled enrolled administrator required' USING ERRCODE='42501'; END IF;
  SELECT EXISTS(SELECT FROM admin_media.policy p,LATERAL jsonb_array_elements(p.sources) s
   WHERE p.singleton AND p.enabled AND p.policy=NEW.policy AND s->>'bucket'=NEW.bucket
   AND NEW.object_key ~ '^[a-zA-Z0-9/_-]+[.](mp4|mov|webm)$' AND NEW.object_key NOT LIKE '%//%'
   AND left(NEW.object_key,length(s->>'prefix'))=s->>'prefix'
   AND NEW.canonical_url=(s->>'baseUrl')||'/'||NEW.object_key
   AND NEW.verifier='hod-container-head-v1'
   AND ((NEW.mime='video/mp4' AND right(NEW.object_key,4)='.mp4')
    OR (NEW.mime='video/quicktime' AND right(NEW.object_key,4)='.mov')
    OR (NEW.mime='video/webm' AND right(NEW.object_key,5)='.webm'))) INTO permitted;
  IF NOT permitted THEN RAISE EXCEPTION 'Inactive or unmatched media policy/source' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END;
`
export const mediaAuditBody=`
BEGIN
 INSERT INTO admin_media.audit(login_role,capability,relation_name,operation,before_state,after_state)
 VALUES(session_user,current_setting('role'),TG_TABLE_NAME,TG_OP,
 CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 RETURN NULL;
END;
`
export const mediaCoreSql=`CREATE SCHEMA admin_media AUTHORIZATION hod_migration;
REVOKE ALL ON SCHEMA admin_media FROM PUBLIC;
CREATE TABLE admin_media.policy(
 singleton boolean PRIMARY KEY DEFAULT true CONSTRAINT policy_singleton CHECK(singleton),
 policy text NOT NULL,enabled boolean NOT NULL DEFAULT false,review_reference text NOT NULL,
 sources jsonb NOT NULL CONSTRAINT policy_sources_array CHECK(jsonb_typeof(sources)='array'),
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE admin_media.admissions(
 admission_id uuid PRIMARY KEY,operation_id uuid NOT NULL UNIQUE,actor_id uuid NOT NULL REFERENCES public.profiles(id),
 actor_issuer text NOT NULL CONSTRAINT admission_issuer_length CHECK(length(actor_issuer) BETWEEN 1 AND 2048),
 actor_subject text NOT NULL CONSTRAINT admission_subject_length CHECK(length(actor_subject) BETWEEN 1 AND 512),
 bucket text NOT NULL,object_key text NOT NULL CONSTRAINT admission_key_length CHECK(length(object_key) BETWEEN 1 AND 1024),canonical_url text NOT NULL UNIQUE,
 sha256 text NOT NULL CONSTRAINT admission_checksum CHECK(sha256 ~ '^[A-Za-z0-9+/]{43}=$' AND octet_length(decode(sha256,'base64'))=32 AND encode(decode(sha256,'base64'),'base64')=sha256),
 byte_length integer NOT NULL CONSTRAINT admission_size CHECK(byte_length BETWEEN 1 AND 104857600),
 mime text NOT NULL CONSTRAINT admission_mime CHECK(mime IN('video/mp4','video/quicktime','video/webm')),
 object_version text,policy text NOT NULL,verifier text NOT NULL,
 evidence text NOT NULL CONSTRAINT admission_evidence CHECK(evidence IN('new-upload-intent','historical-current-object')),
 status text NOT NULL DEFAULT 'pending' CONSTRAINT admission_status CHECK(status IN('pending','admitted','rejected','retired')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),verified_at timestamptz,
 UNIQUE(bucket,object_key),CONSTRAINT admission_verified CHECK(status NOT IN('admitted','retired') OR verified_at IS NOT NULL));
CREATE TABLE admin_media.audit(
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 login_role name NOT NULL,capability text NOT NULL,relation_name text NOT NULL,operation text NOT NULL,before_state jsonb,after_state jsonb);
CREATE FUNCTION admin_media.enrolled_actor(p_actor uuid,p_issuer text,p_subject text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $identity14$${mediaIdentityBody}$identity14$;
CREATE FUNCTION admin_media.guard_admission() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog,pg_temp AS $guard14$${mediaGuardBody}$guard14$;
CREATE FUNCTION admin_media.audit_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,pg_temp AS $audit14$${mediaAuditBody}$audit14$;
REVOKE ALL ON FUNCTION admin_media.enrolled_actor(uuid,text,text),admin_media.guard_admission(),admin_media.audit_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_media.enrolled_actor(uuid,text,text) TO hod_admin_app;
CREATE TRIGGER admission_guard BEFORE INSERT OR UPDATE OR DELETE ON admin_media.admissions FOR EACH ROW EXECUTE FUNCTION admin_media.guard_admission();
CREATE TRIGGER admission_audit AFTER INSERT OR UPDATE OR DELETE ON admin_media.admissions FOR EACH ROW EXECUTE FUNCTION admin_media.audit_change();
CREATE TRIGGER policy_audit AFTER INSERT OR UPDATE OR DELETE ON admin_media.policy FOR EACH ROW EXECUTE FUNCTION admin_media.audit_change();
REVOKE ALL ON admin_media.policy,admin_media.admissions,admin_media.audit FROM PUBLIC;
ALTER TABLE admin_media.policy ENABLE ROW LEVEL SECURITY;ALTER TABLE admin_media.policy FORCE ROW LEVEL SECURITY;
ALTER TABLE admin_media.admissions ENABLE ROW LEVEL SECURITY;ALTER TABLE admin_media.admissions FORCE ROW LEVEL SECURITY;
ALTER TABLE admin_media.audit ENABLE ROW LEVEL SECURITY;ALTER TABLE admin_media.audit FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_policy ON admin_media.policy TO hod_migration USING(true) WITH CHECK(true);
CREATE POLICY owner_admissions ON admin_media.admissions TO hod_migration USING(true) WITH CHECK(true);
CREATE POLICY owner_audit ON admin_media.audit TO hod_migration USING(true) WITH CHECK(true);
CREATE POLICY runtime_policy_read ON admin_media.policy FOR SELECT TO hod_admin_app USING(true);
CREATE POLICY runtime_policy_lock ON admin_media.policy FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false);
CREATE POLICY runtime_policy_guard ON admin_media.policy AS RESTRICTIVE FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(false);
CREATE POLICY runtime_admission_read ON admin_media.admissions FOR SELECT TO hod_admin_app USING(true);
CREATE POLICY runtime_admission_insert ON admin_media.admissions FOR INSERT TO hod_admin_app WITH CHECK(status='pending' AND evidence='new-upload-intent');
CREATE POLICY runtime_admission_insert_guard ON admin_media.admissions AS RESTRICTIVE FOR INSERT TO hod_admin_app WITH CHECK(status='pending' AND evidence='new-upload-intent');
CREATE POLICY runtime_admission_transition ON admin_media.admissions FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(status IN('admitted','rejected'));
CREATE POLICY runtime_admission_transition_guard ON admin_media.admissions AS RESTRICTIVE FOR UPDATE TO hod_admin_app USING(true) WITH CHECK(status IN('admitted','rejected'));
GRANT USAGE ON SCHEMA admin_media TO hod_admin_app;
GRANT SELECT ON admin_media.policy,admin_media.admissions TO hod_admin_app;
GRANT UPDATE(singleton) ON admin_media.policy TO hod_admin_app;
GRANT INSERT(admission_id,operation_id,actor_id,actor_issuer,actor_subject,bucket,object_key,canonical_url,sha256,byte_length,mime,policy,verifier,evidence,status) ON admin_media.admissions TO hod_admin_app;
GRANT UPDATE(status,object_version,verified_at) ON admin_media.admissions TO hod_admin_app;
INSERT INTO admin_media.policy(singleton,policy,enabled,review_reference,sources)
VALUES(true,'${mediaPolicy}',false,'ADMIN-RDS-14-foundation-only','${JSON.stringify(mediaSources)}'::jsonb);
`
