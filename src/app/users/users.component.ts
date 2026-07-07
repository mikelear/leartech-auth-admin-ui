import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { User } from '../models';
import { UsersApiAdapter } from './users-api.adapter';

const ROLES = ['member', 'tenant_admin', 'platform_admin'] as const;

/**
 * Users — platform-admin screen. Lists users and lets a platform admin change a
 * user's role and suspend/restore access, through the generated auth-service SDK
 * (via UsersApiAdapter). Requires PlatformAdmin; a non-platform admin gets 403,
 * surfaced as an error. Permissions are read-only in v1.
 */
@Component({
  selector: 'app-users',
  imports: [FormsModule],
  template: `
    <section class="wrap" data-testid="users-page">
      <div class="head">
        <div>
          <h1>Users</h1>
          <p>People with access to the platform. Change a role or suspend access — changes take effect on the user's next token.</p>
        </div>
      </div>

      @if (error()) {
        <p class="error-note" data-testid="users-error">{{ error() }}</p>
      }

      <div class="stats">
        <div class="stat"><div class="k">Users</div><div class="v" data-testid="stat-users">{{ users().length }}</div></div>
        <div class="stat"><div class="k">Platform admins</div><div class="v" data-testid="stat-platform">{{ platformAdmins() }}</div></div>
        <div class="stat"><div class="k">Tenant admins</div><div class="v" data-testid="stat-tenant">{{ tenantAdmins() }}</div></div>
        <div class="stat"><div class="k">Suspended</div><div class="v" data-testid="stat-suspended">{{ suspended() }}</div></div>
      </div>

      <div class="card">
        <div class="card-top">
          <span class="eyebrow">All users <span class="count" data-testid="users-count">{{ users().length }}</span></span>
        </div>

        @if (loading()) {
          <p class="muted" style="padding:16px 18px" data-testid="users-loading">Loading users…</p>
        } @else {
          <div class="tscroll">
            <table data-testid="users-table">
              <thead>
                <tr><th>User</th><th>Role</th><th>Permissions</th><th>Security</th><th>Tenant</th><th>Status</th><th class="r">Actions</th></tr>
              </thead>
              <tbody>
                @for (u of users(); track u.id) {
                  <tr [attr.data-testid]="'user-row-' + u.email">
                    <td>
                      <div class="name">{{ u.email }}</div>
                      <div class="sub id">{{ u.id }}</div>
                    </td>
                    <td>
                      <select
                        class="role"
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
                    <td>
                      <div class="perms">
                        @for (p of knownPerms; track p) {
                          <button
                            type="button"
                            class="chip toggle"
                            [class.on]="hasPerm(u, p)"
                            [attr.data-testid]="'user-perm-' + p + '-' + u.email"
                            [attr.data-on]="hasPerm(u, p)"
                            (click)="togglePermission(u, p)"
                            [disabled]="busyId() === u.id"
                            [title]="(hasPerm(u, p) ? 'Remove ' : 'Grant ') + p"
                          >{{ p }}</button>
                        }
                        @for (p of extraPerms(u); track p) { <span class="chip">{{ p }}</span> }
                      </div>
                    </td>
                    <td>
                      <div class="factors">
                        <span
                          class="fbadge"
                          [class.on]="!!u.has2FA"
                          [attr.data-testid]="'user-2fa-' + u.email"
                          [attr.data-enabled]="!!u.has2FA"
                          [title]="u.has2FA ? '2FA enabled' : 'No 2FA'"
                        >2FA</span>
                        <span
                          class="fbadge"
                          [class.on]="!!u.hasPasskey"
                          [attr.data-testid]="'user-passkey-' + u.email"
                          [attr.data-enabled]="!!u.hasPasskey"
                          [title]="u.hasPasskey ? 'Passkey registered' : 'No passkey'"
                        >Passkey</span>
                      </div>
                    </td>
                    <td><span class="pill member">{{ shortTenant(u.tenantId) }}</span></td>
                    <td>
                      @if (u.active !== false) {
                        <span class="badge active"><span class="d"></span>Active</span>
                      } @else {
                        <span class="badge off"><span class="d"></span>Suspended</span>
                      }
                    </td>
                    <td class="r">
                      <div class="acts">
                        <button
                          type="button"
                          class="rowbtn"
                          [class.warn]="u.active !== false"
                          [attr.data-testid]="'user-active-toggle-' + u.email"
                          (click)="toggleActive(u)"
                          [disabled]="busyId() === u.id"
                        >
                          {{ u.active !== false ? 'Suspend' : 'Restore' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="muted" data-testid="users-empty">No users.</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .factors { display: flex; gap: 6px; flex-wrap: wrap; }
      .fbadge {
        font-size: 11px; font-weight: 600; line-height: 1;
        padding: 3px 8px; border-radius: 999px;
        border: 1px solid #d0d7de; color: #8b949e;
        background: transparent; letter-spacing: 0.02em; opacity: 0.6;
      }
      .fbadge.on {
        color: #0f7b3f; border-color: #9ae6b4; background: #eafff1; opacity: 1;
      }
      .perms { display: flex; gap: 6px; flex-wrap: wrap; }
      .chip.toggle {
        cursor: pointer; font: inherit; font-size: 11px; font-weight: 600;
        line-height: 1; padding: 3px 8px; border-radius: 999px;
        border: 1px solid #d0d7de; background: transparent; color: #8b949e;
        opacity: 0.55; transition: opacity 0.1s ease;
      }
      .chip.toggle:hover:not(:disabled) { opacity: 0.85; }
      .chip.toggle.on {
        color: #0f7b3f; border-color: #9ae6b4; background: #eafff1; opacity: 1;
      }
      .chip.toggle:disabled { cursor: default; }
    `,
  ],
})
export class UsersComponent implements OnInit {
  private readonly api = inject(UsersApiAdapter);

  readonly roles = ROLES;
  readonly knownPerms = ['User', 'Admin', 'PlatformAdmin'];
  readonly users = signal<User[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);

  readonly platformAdmins = computed(
    () => this.users().filter((u) => u.role === 'platform_admin').length,
  );
  readonly tenantAdmins = computed(
    () => this.users().filter((u) => u.role === 'tenant_admin').length,
  );
  readonly suspended = computed(
    () => this.users().filter((u) => u.active === false).length,
  );

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

  async changeRole(user: User, role: string): Promise<void> {
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

  hasPerm(user: User, perm: string): boolean {
    return (user.permissions ?? []).includes(perm);
  }

  /** Permissions the user holds that aren't in the known toggle set (shown read-only). */
  extraPerms(user: User): string[] {
    return (user.permissions ?? []).filter((p) => !this.knownPerms.includes(p));
  }

  /** Grant or revoke a single permission, preserving the rest. Backend enforces
   * self-lockout + privilege-escalation guards (a 403 surfaces as an error). */
  async togglePermission(user: User, perm: string): Promise<void> {
    const id = user.id;
    if (!id || this.busyId()) {
      return;
    }
    const current = user.permissions ?? [];
    const next = current.includes(perm)
      ? current.filter((p) => p !== perm)
      : [...current, perm];
    this.busyId.set(id);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.setPermissions(id, next));
      await this.reload();
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busyId.set(null);
    }
  }

  async toggleActive(user: User): Promise<void> {
    const id = user.id;
    if (!id || this.busyId()) {
      return;
    }
    this.busyId.set(id);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.setActive(id, user.active === false));
      await this.reload();
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busyId.set(null);
    }
  }

  /** UUID → short form for the tenant pill. */
  shortTenant(id?: string): string {
    return id ? id.slice(0, 8) : '—';
  }

  /** Turn an HttpErrorResponse into an operator-friendly message. */
  private describe(e: unknown): string {
    if (e && typeof e === 'object' && 'status' in e) {
      const status = (e as { status?: number }).status;
      if (status === 403) {
        return 'Forbidden — platform-admin permission required.';
      }
      if (status === 0) {
        return 'Could not reach the auth service (network or CORS).';
      }
      const apiError = (e as { error?: { error?: string } }).error?.error;
      return apiError
        ? `Error ${status}: ${apiError}`
        : `Request failed (HTTP ${status ?? '?'}).`;
    }
    return e instanceof Error ? e.message : String(e);
  }
}
