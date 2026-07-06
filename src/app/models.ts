/**
 * Domain type aliases over the generated auth-service SDK models.
 *
 * The SDK (openapi-generator, fed by swag v1.16.6) names model types by their
 * full Go package path — `GithubComMikelearLeartechAuthServiceInternalModels*` —
 * which is noisy and churns with generator/schema changes. The rest of the app
 * imports the clean names below, so an SDK type-name change touches ONLY this
 * file. (Follow-up: fix auth-service's SDK-gen to emit short model names.)
 */
export type {
  GithubComMikelearLeartechAuthServiceInternalModelsTenant as Tenant,
  GithubComMikelearLeartechAuthServiceInternalModelsUser as User,
  GithubComMikelearLeartechAuthServiceInternalModelsAdminCreateTenantRequest as CreateTenantRequest,
} from '@mikelear/leartech-auth-service-angular';
