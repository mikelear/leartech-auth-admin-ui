import { Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ClientsApiAdapter, ClientSummary } from './clients-api.adapter';

/**
 * OAuth clients — a platform admin's read-only view of every OAuth2 client
 * registered in Hydra (first-party apps, service-to-service, and DCR/MCP
 * clients). Reads GET /admin/clients (auth-service #127) via the SDK; the
 * client_secret is never returned. Tenant-independent (platform-wide).
 */
@Component({
  selector: 'app-clients',
  imports: [],
  template: `
    <section class="wrap" data-testid="clients-page">
      <div class="head">
        <div>
          <h1>OAuth clients</h1>
          <p>Registered OAuth2 clients — first-party apps, service-to-service, and dynamically-registered (DCR/MCP). Read-only; secrets are never shown.</p>
        </div>
      </div>

      @if (error()) {
        <p class="error-note" data-testid="clients-error">{{ error() }}</p>
      }

      <div class="card">
        <div class="card-top">
          <span class="eyebrow">Clients <span class="count" data-testid="clients-count">{{ clients().length }}</span></span>
        </div>

        @if (loading()) {
          <p class="muted" style="padding:16px 18px" data-testid="clients-loading">Loading clients…</p>
        } @else {
          <div class="tscroll">
            <table data-testid="clients-table">
              <thead>
                <tr><th>Client ID</th><th>Name</th><th>Grant types</th><th>Scope</th><th>Redirect URIs</th><th>Created</th></tr>
              </thead>
              <tbody>
                @for (c of clients(); track c.clientId) {
                  <tr [attr.data-testid]="'client-row-' + c.clientId">
                    <td class="mono">{{ c.clientId }}</td>
                    <td>{{ c.clientName || '—' }}</td>
                    <td>
                      <div class="pills">
                        @for (g of c.grantTypes ?? []; track g) { <span class="pill member">{{ g }}</span> }
                        @if (!(c.grantTypes ?? []).length) { <span class="sub">—</span> }
                      </div>
                    </td>
                    <td class="sub scope">{{ c.scope || '—' }}</td>
                    <td class="sub uris">{{ (c.redirectUris ?? []).join(', ') || '—' }}</td>
                    <td class="sub nowrap mono" [title]="c.createdAt || ''">{{ when(c.createdAt) }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="muted" data-testid="clients-empty">No OAuth clients.</td></tr>
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
      .pills { display: flex; gap: 6px; flex-wrap: wrap; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
      .nowrap { white-space: nowrap; }
      .scope, .uris { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `,
  ],
})
export class ClientsComponent implements OnInit {
  private readonly api = inject(ClientsApiAdapter);

  readonly clients = signal<ClientSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.clients.set(await firstValueFrom(this.api.listClients()));
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.loading.set(false);
    }
  }

  when(iso?: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  }

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
      return apiError ? `Error ${status}: ${apiError}` : `Request failed (HTTP ${status ?? '?'}).`;
    }
    return e instanceof Error ? e.message : String(e);
  }
}
