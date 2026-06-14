import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, firstValueFrom, of } from 'rxjs';
import { EnvironmentService } from '@mikelear/leartech-common';

/**
 * Fleet-status page — runtime cross-service proof.
 *
 * Calls each peer golden-template service's `/api/v1/example` via
 * Angular `HttpClient` (interceptors auto-inject the bearer from
 * `provideLeartechAuth`'s `AuthInterceptor`). With audience-bound
 * tokens (api.conf.json → audiences[]), each peer's AuthLayer
 * validates its own service name in the JWT's `aud` array and
 * accepts the same bearer.
 *
 * Peer URLs are read from `EnvironmentService` (runtime config from
 * `/api.conf.json`) — never hard-coded in source. The chart's
 * values.yaml `config.peers` map is the source of truth per-cluster.
 *
 * Real services cloning this Angular template adjust their
 * `api.conf.json` peers list to the services THEIR UI actually
 * consumes — this scaffold demonstrates the consumer pattern.
 *
 * Expected response codes:
 *   - With CORS allowed + valid bearer: 200 (full SDK + auth proof)
 *   - With CORS allowed + no bearer:   401 (auth wiring proof)
 *   - CORS not allowed:                fetch errors (renders as fail
 *                                       with the error message)
 */

interface FleetCall {
  service: string;
  expected: string;
  status: 'pending' | 'pass' | 'fail';
  httpCode?: number;
  message?: string;
  durationMs?: number;
}

interface ExampleResponse {
  user_id?: string;
  message?: string;
}

@Component({
  selector: 'app-fleet-status',
  imports: [CommonModule],
  template: `
    <div class="fleet-status">
      <h2>Fleet status</h2>
      <p class="lead">
        Each row is a real <code>HttpClient</code> call to a peer's
        <code>/api/v1/example</code>. With an authenticated session,
        the bearer is auto-injected by the leartech auth interceptor
        and each peer validates its own audience.
      </p>

      <table data-testid="fleet-status-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Expected</th>
            <th>Result</th>
            <th>HTTP</th>
            <th>Duration</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          @for (call of calls(); track call.service) {
            <tr [attr.data-testid]="'fleet-row-' + call.service"
                [class.pass]="call.status === 'pass'"
                [class.fail]="call.status === 'fail'"
                [class.pending]="call.status === 'pending'">
              <td>{{ call.service }}</td>
              <td>{{ call.expected }}</td>
              <td>
                <span [attr.data-testid]="'status-' + call.service">
                  @switch (call.status) {
                    @case ('pass')    { ✓ pass }
                    @case ('fail')    { ✗ fail }
                    @case ('pending') { … pending }
                  }
                </span>
              </td>
              <td [attr.data-testid]="'http-' + call.service">{{ call.httpCode ?? '—' }}</td>
              <td>{{ call.durationMs ? call.durationMs + 'ms' : '—' }}</td>
              <td class="msg">{{ call.message ?? '' }}</td>
            </tr>
          }
        </tbody>
      </table>

      <p class="overall" [attr.data-testid]="'overall-' + overallStatus()">
        @switch (overallStatus()) {
          @case ('pass')    { ✓ Fleet healthy — all peers responded as expected }
          @case ('fail')    { ✗ Fleet degraded — see rows above }
          @case ('pending') { … Running fleet checks }
        }
      </p>
    </div>
  `,
  styles: [`
    .fleet-status { padding: 1rem; font-family: system-ui, sans-serif; }
    table { border-collapse: collapse; width: 100%; max-width: 80ch; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #ddd; }
    tr.pass td { background: rgba(0,180,0,0.08); }
    tr.fail td { background: rgba(180,0,0,0.08); }
    tr.pending td { background: rgba(180,180,0,0.08); }
    .msg { font-family: monospace; font-size: 0.85em; color: #666; }
    .overall { margin-top: 1rem; font-weight: bold; }
    .lead { color: #555; max-width: 60ch; }
  `],
})
export class FleetStatusComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly env = inject(EnvironmentService);

  calls = signal<FleetCall[]>([]);

  ngOnInit(): void {
    const peers = this.peersFromConfig();
    this.calls.set(peers.map(([service]) => ({
      service,
      expected: 'HTTP 200 (with bearer) / 401 (without)',
      status: 'pending',
    })));

    // Fire-and-forget but wrapped in catch — the per-peer try/catch
    // inside runFleetCheck handles individual failures; this outer
    // .catch guards against any synchronous throw before the loop
    // starts (e.g. EnvironmentService.peers missing). Without it,
    // an exception here would propagate as an unhandled promise
    // rejection (flagged by the AI code reviewer; valid concern).
    this.runFleetCheck(peers).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
       
      console.error('[fleet-status] check failed to start:', msg);
      this.calls.update((existing) =>
        existing.map((c) => ({ ...c, status: 'fail', message: msg })),
      );
    });
  }

  /**
   * Read peers from runtime config. Returns [serviceName, baseUrl][]
   * pairs. Empty if config.peers is missing.
   */
  private peersFromConfig(): [string, string][] {
    const cfg = this.env.getEnvironment() as { peers?: Record<string, string> };
    const peers = cfg?.peers ?? {};
    return Object.entries(peers).filter(([, url]) => Boolean(url));
  }

  /**
   * Calls each peer's /api/v1/example via HttpClient. The auth
   * interceptor injected by provideLeartechAuth adds the Bearer
   * header automatically when the URL is on `secureRoutes` and the
   * user is authenticated.
   *
   * Each call returns a FleetCall summarising the verdict — never
   * throws to its caller; HttpErrorResponse is caught and rendered
   * as a row with status: fail + the diagnostic.
   */
  private async runFleetCheck(peers: [string, string][]): Promise<void> {
    const next = await Promise.all(
      peers.map(([service, base]) => this.checkPeer(service, base)),
    );
    this.calls.set(next);
  }

  private async checkPeer(service: string, baseUrl: string): Promise<FleetCall> {
    const url = `${baseUrl}/api/v1/example`;
    const start = performance.now();
    const result = await firstValueFrom(
      this.http.get<ExampleResponse>(url, { observe: 'response' }).pipe(
        catchError((err: HttpErrorResponse) => of({ status: err.status, error: err })),
      ),
    );
    const durationMs = Math.round(performance.now() - start);
    const httpCode = result.status;
    // Either 200 (authed) or 401 (unauthed reach + auth wiring proven)
    // count as evidence the cross-service hop works. Other codes are
    // unexpected (5xx, network errors → status 0).
    const ok = httpCode === 200 || httpCode === 401;
    let message: string;
    if (httpCode === 200) {
      message = 'authed call succeeded — peer validated our audience';
    } else if (httpCode === 401) {
      message = 'auth wiring on; called without a valid bearer';
    } else if (httpCode === 0) {
      message = `unreachable / CORS blocked (peer URL ${baseUrl} did not respond)`;
    } else {
      message = `unexpected status ${httpCode}`;
    }
    return {
      service,
      expected: 'HTTP 200 (with bearer) / 401 (without)',
      status: ok ? 'pass' : 'fail',
      httpCode,
      durationMs,
      message,
    };
  }

  overallStatus(): 'pending' | 'pass' | 'fail' {
    const c = this.calls();
    if (c.length === 0 || c.some((x) => x.status === 'pending')) return 'pending';
    if (c.some((x) => x.status === 'fail')) return 'fail';
    return 'pass';
  }
}
