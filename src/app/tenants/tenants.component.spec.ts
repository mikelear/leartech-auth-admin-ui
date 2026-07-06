import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Tenant } from '../models';
import { TenantsComponent } from './tenants.component';
import { TenantsApiAdapter } from './tenants-api.adapter';

/**
 * Unit coverage for the Tenants screen — the adapter (TenantsApiAdapter) is the
 * mock seam, so these exercise the component's own logic + every error branch
 * without a real SDK/HttpClient:
 *   1. lists tenants on init
 *   2. create → reloads the list
 *   3. blank name → no create call
 *   4. 403 → platform-admin error surfaced
 *   5. 409 on create → duplicate error surfaced
 *   6. generic HTTP error → api message surfaced
 *   7. empty list → no rows, no error
 */
describe('TenantsComponent', () => {
  let api: jasmine.SpyObj<TenantsApiAdapter>;

  // firstValueFrom resolves on a microtask; flush lets reload()/create() settle
  // regardless of zone vs zoneless change detection.
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));

  async function setup(): Promise<TenantsComponent> {
    const fixture = TestBed.createComponent(TenantsComponent);
    fixture.detectChanges(); // ngOnInit → reload()
    await flush();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<TenantsApiAdapter>('TenantsApiAdapter', [
      'listTenants',
      'createTenant',
      'deleteTenant',
    ]);
    api.listTenants.and.returnValue(
      of([{ id: 't1', name: 'acme', displayName: 'Acme' }] as Tenant[]),
    );
    TestBed.configureTestingModule({
      imports: [TenantsComponent],
      providers: [{ provide: TenantsApiAdapter, useValue: api }],
    });
  });

  it('lists tenants on init', async () => {
    const c = await setup();
    expect(api.listTenants).toHaveBeenCalled();
    expect(c.tenants().length).toBe(1);
    expect(c.tenants()[0].name).toBe('acme');
    expect(c.loading()).toBeFalse();
    expect(c.error()).toBeNull();
  });

  it('creates a tenant then reloads the list', async () => {
    api.createTenant.and.returnValue(
      of({ id: 't2', name: 'globex' } as Tenant),
    );
    const c = await setup();
    c.newName.set('globex');
    await c.create();
    expect(api.createTenant).toHaveBeenCalledWith({
      name: 'globex',
      displayName: undefined,
    });
    expect(api.listTenants).toHaveBeenCalledTimes(2); // init + after create
    expect(c.newName()).toBe(''); // form cleared
  });

  it('does not create with a blank name', async () => {
    const c = await setup();
    c.newName.set('   ');
    await c.create();
    expect(api.createTenant).not.toHaveBeenCalled();
  });

  it('surfaces a 403 as a platform-admin error', async () => {
    api.listTenants.and.returnValue(throwError(() => ({ status: 403 })));
    const c = await setup();
    expect(c.error()).toContain('platform-admin');
    expect(c.loading()).toBeFalse();
  });

  it('surfaces a 409 on create as a duplicate error', async () => {
    api.createTenant.and.returnValue(throwError(() => ({ status: 409 })));
    const c = await setup();
    c.newName.set('dupe');
    await c.create();
    expect(c.error()).toContain('already exists');
  });

  it('surfaces a generic HTTP error with the api message', async () => {
    api.listTenants.and.returnValue(
      throwError(() => ({ status: 500, error: { error: 'boom' } })),
    );
    const c = await setup();
    expect(c.error()).toContain('boom');
  });

  it('renders empty (no rows, no error) when there are no tenants', async () => {
    api.listTenants.and.returnValue(of([] as Tenant[]));
    const c = await setup();
    expect(c.tenants().length).toBe(0);
    expect(c.error()).toBeNull();
  });

  it('deletes a tenant then reloads + clears the confirm state', async () => {
    api.deleteTenant.and.returnValue(of(undefined));
    const c = await setup();
    c.confirmingId.set('t1');
    await c.remove({ id: 't1', name: 'acme' } as Tenant);
    expect(api.deleteTenant).toHaveBeenCalledWith('t1');
    expect(api.listTenants).toHaveBeenCalledTimes(2); // init + after delete
    expect(c.confirmingId()).toBeNull();
    expect(c.error()).toBeNull();
  });

  it('surfaces a delete error and clears the busy state', async () => {
    // The platform-tenant 409 is unreachable from the UI (its Delete button is
    // hidden), so exercise a reachable failure (500) — the message surfaces and
    // deletingId resets so the row isn't stuck.
    api.deleteTenant.and.returnValue(throwError(() => ({ status: 500, error: { error: 'boom' } })));
    const c = await setup();
    await c.remove({ id: 't1', name: 'acme' } as Tenant);
    expect(c.error()).toContain('boom');
    expect(c.deletingId()).toBeNull();
  });
});
