import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AdminService } from '@mikelear/leartech-auth-service-angular';

/**
 * A registered OAuth2 client (secret-free). Defined locally because the proxy's
 * response is an untyped object in the OpenAPI spec, so the generator emits no
 * model. Shape mirrors auth-service's models.OAuth2ClientSummary (#127).
 */
export interface ClientSummary {
  clientId: string;
  clientName?: string;
  grantTypes?: string[];
  scope?: string;
  redirectUris?: string[];
  createdAt?: string;
}

/** Thin adapter over the SDK's AdminService.adminListClients (GET /admin/clients). */
@Injectable({ providedIn: 'root' })
export class ClientsApiAdapter {
  private readonly admin = inject(AdminService);

  listClients(limit = 100): Observable<ClientSummary[]> {
    return this.admin
      .adminListClients(limit)
      .pipe(map((res) => (res as { clients?: ClientSummary[] })?.clients ?? []));
  }
}
