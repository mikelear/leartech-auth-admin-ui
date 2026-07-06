import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AdminService } from '@mikelear/leartech-auth-service-angular';
import { CreateTenantRequest, Tenant } from '../models';

/**
 * Thin adapter over the generated auth-service SDK's AdminService.
 *
 * Why a seam here (per leartech SDK conventions + the AI review): the SDK's
 * method names (`adminListTenants`, `adminCreateTenant`) and the list response
 * shape are auto-derived from the OpenAPI spec and can churn on backend tweaks.
 * Components depend on THIS stable surface (`listTenants` / `createTenant`
 * returning domain types), and tests mock the adapter rather than the raw SDK —
 * so a generated-name change touches one file, not every screen.
 *
 * The SDK's HttpClient calls still flow through leartech-common's
 * AuthInterceptor, so the admin bearer is injected automatically.
 */
@Injectable({ providedIn: 'root' })
export class TenantsApiAdapter {
  private readonly admin = inject(AdminService);

  /** List all tenants (platform-admin). Unwraps the `{ tenants: [...] }` body. */
  listTenants(): Observable<Tenant[]> {
    return this.admin
      .adminListTenants()
      .pipe(
        map(
          (res) => (res as { tenants?: Tenant[] })?.tenants ?? [],
        ),
      );
  }

  /** Create a tenant (platform-admin). */
  createTenant(req: CreateTenantRequest): Observable<Tenant> {
    return this.admin.adminCreateTenant(req);
  }

  /** Delete a tenant by id (platform-admin). The platform tenant is 409-guarded server-side. */
  deleteTenant(id: string): Observable<void> {
    return this.admin.adminDeleteTenant(id).pipe(map(() => undefined));
  }
}
