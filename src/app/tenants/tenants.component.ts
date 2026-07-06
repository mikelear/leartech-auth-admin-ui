import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ModelsTenant } from '@mikelear/leartech-auth-service-angular';
import { TenantsApiAdapter } from './tenants-api.adapter';

/**
 * Tenants — platform-admin screen. Lists and creates tenants through the
 * generated auth-service SDK (via TenantsApiAdapter). Requires the PlatformAdmin
 * permission; a non-platform admin gets 403, surfaced here as an error.
 */
@Component({
  selector: 'app-tenants',
  imports: [FormsModule],
  template: `
    <section class="wrap" data-testid="tenants-page">
      <div class="head">
        <div>
          <h1>Tenants</h1>
          <p>Every organization on the platform. Only platform admins can view or create tenants.</p>
        </div>
      </div>

      @if (error()) {
        <p class="error-note" data-testid="tenants-error">{{ error() }}</p>
      }

      <div class="card">
        <div class="card-top">
          <span class="eyebrow">All tenants <span class="count" data-testid="tenants-count">{{ tenants().length }}</span></span>
        </div>

        @if (loading()) {
          <p class="muted" style="padding:16px 18px" data-testid="tenants-loading">Loading tenants…</p>
        } @else {
          <div class="tscroll">
            <table data-testid="tenants-table">
              <thead>
                <tr><th>Name</th><th>Tenant ID</th><th>Created</th></tr>
              </thead>
              <tbody>
                @for (t of tenants(); track t.id) {
                  <tr [attr.data-testid]="'tenant-row-' + t.name">
                    <td>
                      <div class="name">{{ t.displayName || t.name }}</div>
                      <div class="sub">{{ t.name }}</div>
                    </td>
                    <td class="id">{{ t.id }}</td>
                    <td class="when">{{ shortDate(t.createdAt) }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="3" class="muted" data-testid="tenants-empty">No tenants yet — create the first one below.</td></tr>
                }
              </tbody>
            </table>
          </div>
        }

        <form class="create" (ngSubmit)="create()">
          <span class="lab">New tenant</span>
          <input
            class="wide"
            data-testid="tenant-name-input"
            name="name"
            placeholder="tenant name (unique, lower-case)"
            [ngModel]="newName()"
            (ngModelChange)="newName.set($event)"
            [disabled]="creating()"
          />
          <input
            class="wide"
            data-testid="tenant-display-input"
            name="displayName"
            placeholder="display name (optional)"
            [ngModel]="newDisplayName()"
            (ngModelChange)="newDisplayName.set($event)"
            [disabled]="creating()"
          />
          <button
            type="submit"
            class="btn primary"
            data-testid="tenant-create-button"
            [disabled]="creating() || !newName().trim()"
          >
            {{ creating() ? 'Creating…' : 'Create tenant' }}
          </button>
        </form>
      </div>
    </section>
  `,
})
export class TenantsComponent implements OnInit {
  private readonly api = inject(TenantsApiAdapter);

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
      this.tenants.set(await firstValueFrom(this.api.listTenants()));
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
        this.api.createTenant({
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

  /** ISO timestamp → YYYY-MM-DD (no date pipe needed). */
  shortDate(iso?: string): string {
    return iso ? iso.slice(0, 10) : '—';
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
