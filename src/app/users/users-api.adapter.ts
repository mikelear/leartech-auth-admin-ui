import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AdminService, ModelsUser } from '@mikelear/leartech-auth-service-angular';

/**
 * Thin adapter over the generated auth-service SDK's AdminService.
 *
 * Why a seam here (per leartech SDK conventions + the AI review): the SDK's
 * method names (`adminListUsers`, `adminSetUserRole`, `adminActivateUser`) and
 * the list response shape are auto-derived from the OpenAPI spec and can churn
 * on backend tweaks. Components depend on THIS stable surface (`listUsers` /
 * `setRole` / `setActive` returning domain types), and tests mock the adapter
 * rather than the raw SDK — so a generated-name change touches one file, not
 * every screen.
 *
 * The SDK's HttpClient calls still flow through leartech-common's
 * AuthInterceptor, so the admin bearer is injected automatically.
 */
@Injectable({ providedIn: 'root' })
export class UsersApiAdapter {
  private readonly admin = inject(AdminService);

  /** List all users (platform-admin). Unwraps the `{ users: [...] }` body. */
  listUsers(): Observable<ModelsUser[]> {
    return this.admin
      .adminListUsers()
      .pipe(map((res) => (res as { users?: ModelsUser[] })?.users ?? []));
  }

  /** Set a user's role (platform-admin). Wraps the plain role as `{ role }`. */
  setRole(id: string, role: string): Observable<ModelsUser> {
    return this.admin.adminSetUserRole(id, { role });
  }

  /** Activate or deactivate a user (platform-admin). */
  setActive(id: string, active: boolean): Observable<ModelsUser> {
    return active
      ? this.admin.adminActivateUser(id)
      : this.admin.adminDeactivateUser(id);
  }
}
