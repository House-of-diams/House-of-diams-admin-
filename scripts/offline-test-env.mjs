// Test processes run the admin as it is deployed: Keycloak sign-in, RDS data and AWS media.
// Individual tests still override or delete these to exercise misconfiguration.
for (const [name, value] of Object.entries({
  ADMIN_AUTH_PROVIDER: 'keycloak',
  ADMIN_PRODUCT_DATA_PROVIDER: 'rds',
  ADMIN_CATALOG_DATA_PROVIDER: 'rds',
  ADMIN_CMS_DATA_PROVIDER: 'rds',
  ADMIN_OPERATIONS_DATA_PROVIDER: 'rds',
  ADMIN_IMAGE_PROVIDER: 'aws',
  ADMIN_VIDEO_PROVIDER: 'aws',
})) process.env[name] ??= value
