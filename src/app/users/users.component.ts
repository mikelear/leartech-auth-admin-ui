import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ModelsUser } from '@mikelear/leartech-auth-service-angular';
import { UsersApiAdapter } from './users-api.adapter';

const ROLES = ['member', 'tenant_admin', 'platform_admin'] as const;

/**
 * Users — platform-admin screen. Lists users and lets a platform admin change a
 * user's role and activate/deactivate them, all through the generated
 * auth-service SDK (`AdminService`), which routes via Angular HttpClient so
 * leartech-common's AuthInterceptor injects the platform-admin bearer
 * automatically — no per-call token handling. Requires the PlatformAdmin
 * permission; a tenant-admin (or any non-platform admin) gets 403, surfaced here
 * as an error rather than a blank screen. Permissions are shown read-only in v1.
 */
@Component({
  selector: 'app-users',
  imports: [CommonModule, FormsModule],
  template: `
    <section class="users" data-testid="users-page">
      <h2>Users</h2>
      <p class="lead">
        Platform-admin only. Every action calls leartech-auth-service
        <code>/api/auth/admin/users</code> via the generated SDK.
      </p>

      @if (error()) {
        <p class="error" data-testid="users-error">{{ error() }}</p>
      }

      @if (loading()) {
        <p data-testid="users-loading">Loading…</p>
      } @else {
        <table data-testid="users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Permissions</th>
              <th>Active</th>
              <th>Tenant ID</th>
            </tr>
          </thead>
          <tbody>
            @for (u of users(); track u.id) {
              <tr [attr.data-testid]="'user-row-' + u.email">
                <td>{{ u.email }}</td>
                <td>
                  <select
                    [attr.data-testid]="'user-role-select-' + u.email"
                    [ngModel]="u.role"
                    (ngModelChange)="changeRole(u, $event)"
                    [disabled]="busyId() === u.id"
                  >
                    @for (r of roles; track r) {
                      <option [value]="r">{{ r }}</option>
                    }
                  </select>
                </td>
                <td>{{ (u.permissions ?? []).join(', ') }}</td>
                <td>{{ u.active ? 'yes' : 'no' }}</td>
                <td><code>{{ u.tenantId }}</code></td>
                <td>
                  <button
                    type="button"
                    [attr.data-testid]="'user-active-toggle-' + u.email"
                    (click)="toggleActive(u)"
                    [disabled]="busyId() === u.id"
                  >
                    {{ u.active ? 'Deactivate' : 'Activate' }}
                  </button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="6" data-testid="users-empty">No users.</td></tr>
            }
          </tbody>
        </table>
        <p class="count" data-testid="users-count">{{ users().length }} user(s)</p>
      }
    </section>
  `,
  styles: [
    `
      .users { max-width: 1100px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #ddd; }
      .error { color: #b00020; }
      .count { color: #666; font-size: 0.9rem; }
    `,
  ],
})
export class UsersComponent implements OnInit {
  private readonly api = inject(UsersApiAdapter);

  readonly roles = ROLES;
  readonly users = signal<ModelsUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.users.set(await firstValueFrom(this.api.listUsers()));
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.loading.set(false);
    }
  }

  async changeRole(user: ModelsUser, role: string): Promise<void> {
    const id = user.id;
    if (!id || role === user.role || this.busyId()) {
      return;
    }
    this.busyId.set(id);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.setRole(id, role));
      await this.reload();
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busyId.set(null);
    }
  }

  async toggleActive(user: ModelsUser): Promise<void> {
    const id = user.id;
    if (!id || this.busyId()) {
      return;
    }
    this.busyId.set(id);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.setActive(id, !user.active));
      await this.reload();
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busyId.set(null);
    }
  }

  /** Turn an HttpErrorResponse into an operator-friendly message. */
  private describe(e: unknown): string {
    if (e && typeof e === 'object' && 'status' in e) {
      const status = (e as { status?: number }).status;
      if (status === 403) {
        return 'Forbidden — platform-admin permission required.';
      }
      if (status === 409) {
        return 'A tenant with that name already exists.';
      }
      const apiError = (e as { error?: { error?: string } }).error?.error;
      return apiError
        ? `Error ${status}: ${apiError}`
        : `Request failed (HTTP ${status ?? '?'}).`;
    }
    return e instanceof Error ? e.message : String(e);
  }
}
