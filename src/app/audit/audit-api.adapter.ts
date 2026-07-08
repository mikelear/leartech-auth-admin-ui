import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AdminService } from '@mikelear/leartech-auth-service-angular';

/**
 * An admin audit-log entry. Defined locally (not re-exported from the SDK)
 * because the read endpoint's response is an untyped object in the OpenAPI spec
 * (`map[string]interface{}`), so the generator emits no typed model. Shape
 * mirrors auth-service's models.AdminAuditLogEntry.
 */
export interface AuditEntry {
  tenantId: string;
  actorId: string;
  targetId: string;
  action: string;
  detail?: string;
  result: string;
  reason?: string;
  remoteIp: string;
  createdAt: string;
}

/**
 * Thin adapter over the generated SDK's AdminService for the audit log. Same
 * decoupling rationale as UsersApiAdapter: the component depends on this stable
 * surface (`listAudit` → AuditEntry[]), so a generated-name/param change touches
 * one file. Unwraps the `{ entries: [...] }` envelope.
 */
@Injectable({ providedIn: 'root' })
export class AuditApiAdapter {
  private readonly admin = inject(AdminService);

  listAudit(
    opts: { action?: string; limit?: number; offset?: number } = {},
  ): Observable<AuditEntry[]> {
    return this.admin
      .adminListAudit(opts.limit, opts.offset, opts.action || undefined)
      .pipe(map((res) => (res as { entries?: AuditEntry[] })?.entries ?? []));
  }
}
