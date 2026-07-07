/**
 * Domain type aliases over the generated auth-service SDK models.
 *
 * The app imports the clean domain names below rather than the SDK's raw model
 * names, so any future SDK type-name churn touches ONLY this file. (The SDK now
 * emits clean names — `Tenant`, `User`, `AdminCreateTenantRequest` — after
 * auth-service #113 added swag `--useStructName`; this seam stays as the single
 * decoupling point, and gives `CreateTenantRequest` a tidier name than the
 * SDK's `AdminCreateTenantRequest`.)
 */
export type {
  Tenant,
  // The admin user carries derived auth-factor status (has2FA/hasPasskey) — the
  // enriched AdminUserResponse IS the domain user for this app. It's a superset
  // of the raw SDK `User` (all fields optional), so mutation responses that
  // return the raw user remain assignable.
  AdminUserResponse as User,
  AdminCreateTenantRequest as CreateTenantRequest,
} from '@mikelear/leartech-auth-service-angular';
