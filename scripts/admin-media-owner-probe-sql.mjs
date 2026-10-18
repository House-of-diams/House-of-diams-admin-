export const mediaOwnerProbeSql=`
CREATE TEMP TABLE admin_media14_probe ON COMMIT DROP AS SELECT gen_random_uuid() AS id,gen_random_uuid() AS operation_id;
SAVEPOINT admin_media14_acceptance;
DO $probe$ DECLARE r record;BEGIN
 SELECT * INTO r FROM admin_media14_probe;
 UPDATE admin_media.policy SET enabled=true WHERE singleton;
 INSERT INTO admin_media.admissions(admission_id,operation_id,actor_id,actor_issuer,actor_subject,bucket,object_key,canonical_url,sha256,byte_length,mime,policy,verifier,evidence)
 VALUES(r.id,r.operation_id,'133321f4-53bb-4ef1-a9d6-7d0031080b75','https://auth-uat.houseofdiams.com/realms/houseofdiams','1167a5b6-9fcb-45d1-b7d8-53e95cd49704',
 'house-of-diams','products/videos/'||r.id::text||'.mp4','https://media.houseofdiams.com/products/videos/'||r.id::text||'.mp4',
 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',12,'video/mp4','hod-uat-video-v1','hod-container-head-v1','new-upload-intent');
 UPDATE admin_media.admissions SET status='admitted',object_version='database-fixture-only',verified_at=clock_timestamp() WHERE admission_id=r.id;
 IF NOT EXISTS(SELECT FROM admin_media.admissions WHERE admission_id=r.id AND status='admitted')
 OR (SELECT count(*) FROM admin_media.audit WHERE relation_name='admissions' AND after_state->>'admission_id'=r.id::text)<>2
 THEN RAISE EXCEPTION 'Media database transition/audit probe failed'; END IF;
 BEGIN
  UPDATE admin_media.admissions SET canonical_url='https://invalid.example/changed' WHERE admission_id=r.id;
  RAISE EXCEPTION 'Media identity mutation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  DELETE FROM admin_media.admissions WHERE admission_id=r.id;
  RAISE EXCEPTION 'Media identity deletion accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $probe$;
ROLLBACK TO SAVEPOINT admin_media14_acceptance;
RELEASE SAVEPOINT admin_media14_acceptance;
DO $cleanup$ BEGIN
 IF EXISTS(SELECT FROM admin_media.admissions) OR (SELECT count(*) FROM admin_media.audit)<>1
 OR (SELECT count(*) FROM admin_media.policy)<>1 OR EXISTS(SELECT FROM admin_media.policy WHERE enabled)
 THEN RAISE EXCEPTION 'Media fixture cleanup or disabled policy check failed'; END IF;
END $cleanup$;
`
