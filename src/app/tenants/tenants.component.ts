import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminService, ModelsTenant } from '@mikelear/leartech-auth-service-angular';

/**
 * Tenants — platform-admin screen. Lists and creates tenants through the
 * generated auth-service SDK (`AdminService`), which routes via Angular
 * HttpClient so leartech-common's AuthInterceptor injects the platform-admin
 * bearer automatically — no per-call token handling. Requires the PlatformAdmin
 * permission; a tenant-admin (or any non-platform admin) gets 403, surfaced here
 * as an error rather than a blank screen.
 */
@Component({
  selector: 'app-tenants',
  imports: [CommonModule, FormsModule],
  template: `
    <section class="tenants" data-testid="tenants-page">
      <h2>Tenants</h2>
      <p class="lead">
        Platform-admin only. Every action calls leartech-auth-service
        <code>/api/auth/admin/tenants</code> via the generated SDK.
      </p>

      <form class="create" (ngSubmit)="create()">
        <input
          data-testid="tenant-name-input"
          name="name"
          placeholder="tenant name (unique, lower-case)"
          [ngModel]="newName()"
          (ngModelChange)="newName.set($event)"
          [disabled]="creating()"
        />
        <input
          data-testid="tenant-display-input"
          name="displayName"
          placeholder="display name (optional)"
          [ngModel]="newDisplayName()"
          (ngModelChange)="newDisplayName.set($event)"
          [disabled]="creating()"
        />
        <button
          type="submit"
          data-testid="tenant-create-button"
          [disabled]="creating() || !newName().trim()"
        >
          {{ creating() ? 'Creating…' : 'Create tenant' }}
        </button>
      </form>

      @if (error()) {
        <p class="error" data-testid="tenants-error">{{ error() }}</p>
      }

      @if (loading()) {
        <p data-testid="tenants-loading">Loading…</p>
      } @else {
        <table data-testid="tenants-table">
          <thead>
            <tr><th>Name</th><th>Display name</th><th>ID</th></tr>
          </thead>
          <tbody>
            @for (t of tenants(); track t.id) {
              <tr [attr.data-testid]="'tenant-row-' + t.name">
                <td>{{ t.name }}</td>
                <td>{{ t.displayName }}</td>
                <td><code>{{ t.id }}</code></td>
              </tr>
            } @empty {
              <tr><td colspan="3" data-testid="tenants-empty">No tenants.</td></tr>
            }
          </tbody>
        </table>
        <p class="count" data-testid="tenants-count">{{ tenants().length }} tenant(s)</p>
      }
    </section>
  `,
  styles: [
    `
      .tenants { max-width: 900px; }
      .create { display: flex; gap: 0.5rem; margin: 1rem 0; flex-wrap: wrap; }
      .create input { flex: 1; min-width: 12rem; padding: 0.4rem; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #ddd; }
      .error { color: #b00020; }
      .count { color: #666; font-size: 0.9rem; }
    `,
  ],
})
export class TenantsComponent implements OnInit {
  private readonly admin = inject(AdminService);

  readonly tenants = signal<ModelsTenant[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly newName = signal('');
  readonly newDisplayName = signal('');
  readonly creating = signal(false);

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = (await firstValueFrom(this.admin.adminListTenants())) as {
        tenants?: ModelsTenant[];
      };
      this.tenants.set(res?.tenants ?? []);
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.loading.set(false);
    }
  }

  async create(): Promise<void> {
    const name = this.newName().trim();
    if (!name || this.creating()) {
      return;
    }
    this.creating.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.admin.adminCreateTenant({
          name,
          displayName: this.newDisplayName().trim() || undefined,
        }),
      );
      this.newName.set('');
      this.newDisplayName.set('');
      await this.reload();
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.creating.set(false);
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
