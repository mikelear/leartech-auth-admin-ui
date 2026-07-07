import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AdminService } from '@mikelear/leartech-auth-service-angular';
import { User } from '../models';

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
  listUsers(): Observable<User[]> {
    return this.admin
      .adminListUsers()
      .pipe(map((res) => (res as { users?: User[] })?.users ?? []));
  }

  /** Set a user's role (platform-admin). Wraps the plain role as `{ role }`. */
  setRole(id: string, role: string): Observable<User> {
    return this.admin.adminSetUserRole(id, { role });
  }

  /** Replace a user's permissions (platform-admin). Wraps as `{ permissions }`. */
  setPermissions(id: string, permissions: string[]): Observable<User> {
    return this.admin.adminSetUserPermissions(id, { permissions });
  }

  /** Activate or deactivate a user (platform-admin). */
  setActive(id: string, active: boolean): Observable<User> {
    return active
      ? this.admin.adminActivateUser(id)
      : this.admin.adminDeactivateUser(id);
  }

  /** Fetch one user (with derived 2FA/passkey status). */
  getUser(id: string): Observable<User> {
    return this.admin.adminGetUser(id);
  }

  /** Create a user (invite-pending — no credential yet). */
  createUser(req: {
    email: string;
    displayName?: string;
    role?: string;
    permissions?: string[];
  }): Observable<User> {
    return this.admin.adminCreateUser(req);
  }

  /** Update a user's editable profile (display name). */
  updateUser(id: string, displayName: string): Observable<User> {
    return this.admin.adminUpdateUser(id, { displayName });
  }

  /** Delete a user (hard delete; cascades to their 2FA/passkeys). */
  deleteUser(id: string): Observable<unknown> {
    return this.admin.adminDeleteUser(id);
  }

  /** Reset a user's 2FA enrolment (they re-enrol). */
  resetTwoFactor(id: string): Observable<unknown> {
    return this.admin.adminResetTwoFactor(id);
  }

  /** Reset all of a user's passkeys (they re-register). */
  resetPasskeys(id: string): Observable<unknown> {
    return this.admin.adminResetPasskeys(id);
  }
}
