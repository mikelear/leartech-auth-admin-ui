import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { EnvironmentService } from '@mikelear/leartech-common';
import { FleetStatusComponent } from './fleet-status.component';

/**
 * Unit coverage for the fleet-status page:
 *   1. Renders the table + a row per configured peer
 *   2. HTTP 200 from a peer → status `pass`
 *   3. HTTP 401 from a peer → status `pass` (auth wiring proven)
 *   4. HTTP 0 (network/CORS failure) → status `fail` with diagnostic
 *   5. No peers configured → overall status stays `pending` (no rows)
 *
 * Each test stubs the environment config so we don't depend on a real
 * /api.conf.json or specific cluster — the component reads the peers
 * map at OnInit via EnvironmentService.
 */

class StubEnvironmentService {
  private env: any = { peers: {} };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setEnv(env: any) { this.env = env; }
  async load() { return this.env; }
   
  getEnvironment() { return this.env; }
  get api() { return this.env.api ?? ''; }
  get auth() { return this.env.auth; }
  get featureFlags() { return this.env.featureFlags ?? {}; }
}

describe('FleetStatusComponent', () => {
  let env: StubEnvironmentService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    env = new StubEnvironmentService();
    TestBed.configureTestingModule({
      imports: [FleetStatusComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: EnvironmentService, useValue: env },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('renders one row per configured peer', () => {
    env.setEnv({ peers: {
      'leartech-rust-service-template': 'https://rust.test',
      'leartech-go-service-template': 'https://go.test',
    }});
    const fixture = TestBed.createComponent(FleetStatusComponent);
    fixture.detectChanges();
    httpTesting.expectOne('https://rust.test/api/v1/example').flush({}, { status: 200, statusText: 'OK' });
    httpTesting.expectOne('https://go.test/api/v1/example').flush({}, { status: 200, statusText: 'OK' });
    expect(fixture.componentInstance.calls().length).toBe(2);
  });

  it('marks peer pass when HTTP 200 returned', async () => {
    env.setEnv({ peers: { 'leartech-rust-service-template': 'https://rust.test' } });
    const fixture = TestBed.createComponent(FleetStatusComponent);
    fixture.detectChanges();
    const req = httpTesting.expectOne('https://rust.test/api/v1/example');
    req.flush({ user_id: 'u1', message: 'ok' }, { status: 200, statusText: 'OK' });
    await fixture.whenStable();
    const call = fixture.componentInstance.calls()[0];
    expect(call.status).toBe('pass');
    expect(call.httpCode).toBe(200);
  });

  it('marks peer pass when HTTP 401 returned (auth wiring proven)', async () => {
    env.setEnv({ peers: { 'leartech-rust-service-template': 'https://rust.test' } });
    const fixture = TestBed.createComponent(FleetStatusComponent);
    fixture.detectChanges();
    httpTesting.expectOne('https://rust.test/api/v1/example')
      .flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    const call = fixture.componentInstance.calls()[0];
    expect(call.status).toBe('pass');
    expect(call.httpCode).toBe(401);
  });

  it('marks peer fail when network/CORS blocks the call', async () => {
    env.setEnv({ peers: { 'leartech-rust-service-template': 'https://invalid.test' } });
    const fixture = TestBed.createComponent(FleetStatusComponent);
    fixture.detectChanges();
    httpTesting.expectOne('https://invalid.test/api/v1/example')
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await fixture.whenStable();
    const call = fixture.componentInstance.calls()[0];
    expect(call.status).toBe('fail');
    expect(call.httpCode).toBe(0);
    expect(call.message).toContain('CORS');
  });

  it('marks peer fail when peer returns a 500', async () => {
    env.setEnv({ peers: { 'leartech-rust-service-template': 'https://rust.test' } });
    const fixture = TestBed.createComponent(FleetStatusComponent);
    fixture.detectChanges();
    httpTesting.expectOne('https://rust.test/api/v1/example')
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    const call = fixture.componentInstance.calls()[0];
    expect(call.status).toBe('fail');
    expect(call.httpCode).toBe(500);
  });

  it('shows overall pending when no peers configured', () => {
    env.setEnv({ peers: {} });
    const fixture = TestBed.createComponent(FleetStatusComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.calls().length).toBe(0);
    expect(fixture.componentInstance.overallStatus()).toBe('pending');
  });
});
