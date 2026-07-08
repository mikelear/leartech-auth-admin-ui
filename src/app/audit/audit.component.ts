import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuditApiAdapter, AuditEntry } from './audit-api.adapter';

// Actions the backend records (models.AdminAction*). '' = all.
const ACTIONS = [
  '',
  'create_user',
  'update_user',
  'delete_user',
  'set_role',
  'set_permissions',
  'activate_user',
  'deactivate_user',
  'reset_two_factor',
  'reset_passkeys',
] as const;
const PAGE = 50;

/**
 * Audit log — a platform admin's record of every admin action in their tenant
 * (who did what to whom, and whether it was allowed). Reads the already-captured
 * admin_audit_log via GET /admin/audit (auth-service #125), newest-first, with an
 * action filter and load-more paging. Tenant-fenced server-side.
 */
@Component({
  selector: 'app-audit',
  imports: [FormsModule],
  template: `
    <section class="wrap" data-testid="audit-page">
      <div class="head">
        <div>
          <h1>Audit log</h1>
          <p>Every administrative action in your tenant — who did what, to whom, and the outcome. Newest first.</p>
        </div>
        <label class="filter">
          <span>Action</span>
          <select
            [ngModel]="action()"
            (ngModelChange)="onFilter($event)"
            data-testid="audit-filter-action"
          >
            @for (a of actions; track a) {
              <option [value]="a">{{ a ? humanize(a) : 'All actions' }}</option>
            }
          </select>
        </label>
      </div>

      @if (error()) {
        <p class="error-note" data-testid="audit-error">{{ error() }}</p>
      }

      <div class="card">
        <div class="card-top">
          <span class="eyebrow">Events <span class="count" data-testid="audit-count">{{ entries().length }}</span></span>
        </div>

        @if (loading() && entries().length === 0) {
          <p class="muted" style="padding:16px 18px" data-testid="audit-loading">Loading audit log…</p>
        } @else {
          <div class="tscroll">
            <table data-testid="audit-table">
              <thead>
                <tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Result</th><th>Detail</th></tr>
              </thead>
              <tbody>
                @for (e of entries(); track $index) {
                  <tr [attr.data-testid]="'audit-row-' + $index">
                    <td class="mono nowrap" [title]="e.createdAt">{{ when(e.createdAt) }}</td>
                    <td class="mono">{{ short(e.actorId) }}</td>
                    <td><span class="pill member">{{ humanize(e.action) }}</span></td>
                    <td class="mono">{{ e.targetId ? short(e.targetId) : '—' }}</td>
                    <td>
                      @if (isOk(e.result)) {
                        <span class="badge active"><span class="d"></span>{{ e.result }}</span>
                      } @else {
                        <span class="badge off"><span class="d"></span>{{ e.result || 'denied' }}</span>
                      }
                    </td>
                    <td class="sub">{{ e.reason || e.detail || '' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="muted" data-testid="audit-empty">No audit events{{ action() ? ' for this action' : '' }}.</td></tr>
                }
              </tbody>
            </table>
          </div>

          @if (hasMore()) {
            <div class="morebar">
              <button type="button" class="rowbtn" (click)="more()" [disabled]="loading()" data-testid="audit-more">
                {{ loading() ? 'Loading…' : 'Load more' }}
              </button>
            </div>
          }
        }
      </div>
    </section>
  `,
  styles: [
    `
      .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
      .filter { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #57606a; }
      .filter select { font: inherit; padding: 7px 10px; border: 1px solid #d0d7de; border-radius: 8px; background: #fff; }
      .mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
      .nowrap { white-space: nowrap; }
      .morebar { display: flex; justify-content: center; padding: 12px; border-top: 1px solid #eef1f4; }
    `,
  ],
})
export class AuditComponent implements OnInit {
  private readonly api = inject(AuditApiAdapter);

  readonly actions = ACTIONS;
  readonly entries = signal<AuditEntry[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly action = signal('');
  readonly hasMore = signal(false);
  private offset = 0;

  ngOnInit(): void {
    void this.reload();
  }

  async onFilter(action: string): Promise<void> {
    this.action.set(action);
    await this.reload();
  }

  async reload(): Promise<void> {
    this.offset = 0;
    this.entries.set([]);
    await this.load(false);
  }

  async more(): Promise<void> {
    this.offset += PAGE;
    await this.load(true);
  }

  private async load(append: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const batch = await firstValueFrom(
        this.api.listAudit({
          action: this.action() || undefined,
          limit: PAGE,
          offset: this.offset,
        }),
      );
      this.hasMore.set(batch.length === PAGE);
      this.entries.set(append ? [...this.entries(), ...batch] : batch);
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** snake_case action → human label, e.g. reset_two_factor → "Reset two factor". */
  humanize(action: string): string {
    const s = action.replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  isOk(result: string): boolean {
    return result === 'success' || result === 'ok' || result === 'allowed';
  }

  short(id: string): string {
    return id && id.length > 12 ? id.slice(0, 8) + '…' : id || '—';
  }

  when(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
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
