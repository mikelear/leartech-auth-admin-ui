import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ModelsUser } from '@mikelear/leartech-auth-service-angular';
import { UsersComponent } from './users.component';
import { UsersApiAdapter } from './users-api.adapter';

/**
 * Unit coverage for the Users screen — the adapter (UsersApiAdapter) is the mock
 * seam, so these exercise the component's own logic + every error branch without
 * a real SDK/HttpClient:
 *   1. lists users on init
 *   2. change role → reloads the list
 *   3. activate/deactivate → reloads the list
 *   4. 403 → platform-admin error surfaced
 *   5. empty list → no rows, no error
 */
describe('UsersComponent', () => {
  let api: jasmine.SpyObj<UsersApiAdapter>;

  // firstValueFrom resolves on a microtask; flush lets reload()/actions settle
  // regardless of zone vs zoneless change detection.
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));

  async function setup(): Promise<UsersComponent> {
    const fixture = TestBed.createComponent(UsersComponent);
    fixture.detectChanges(); // ngOnInit → reload()
    await flush();
    return fixture.componentInstance;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<UsersApiAdapter>('UsersApiAdapter', [
      'listUsers',
      'setRole',
      'setActive',
    ]);
    api.listUsers.and.returnValue(
      of([
        {
          id: 'u1',
          email: 'test@leartech.com',
          role: 'member',
          active: true,
          permissions: ['read'],
          tenantId: 't1',
        },
      ] as ModelsUser[]),
    );
    TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [{ provide: UsersApiAdapter, useValue: api }],
    });
  });

  it('lists users on init', async () => {
    const c = await setup();
    expect(api.listUsers).toHaveBeenCalled();
    expect(c.users().length).toBe(1);
    expect(c.users()[0].email).toBe('test@leartech.com');
    expect(c.loading()).toBeFalse();
    expect(c.error()).toBeNull();
  });

  it('changes a role then reloads the list', async () => {
    api.setRole.and.returnValue(
      of({ id: 'u1', role: 'tenant_admin' } as ModelsUser),
    );
    const c = await setup();
    await c.changeRole(c.users()[0], 'tenant_admin');
    expect(api.setRole).toHaveBeenCalledWith('u1', 'tenant_admin');
    expect(api.listUsers).toHaveBeenCalledTimes(2); // init + after set role
    expect(c.busyId()).toBeNull();
  });

  it('does not change a role when it is unchanged', async () => {
    const c = await setup();
    await c.changeRole(c.users()[0], 'member');
    expect(api.setRole).not.toHaveBeenCalled();
  });

  it('activates/deactivates a user then reloads the list', async () => {
    api.setActive.and.returnValue(
      of({ id: 'u1', active: false } as ModelsUser),
    );
    const c = await setup();
    await c.toggleActive(c.users()[0]);
    expect(api.setActive).toHaveBeenCalledWith('u1', false); // was active → deactivate
    expect(api.listUsers).toHaveBeenCalledTimes(2); // init + after toggle
    expect(c.busyId()).toBeNull();
  });

  it('surfaces a 403 as a platform-admin error', async () => {
    api.listUsers.and.returnValue(throwError(() => ({ status: 403 })));
    const c = await setup();
    expect(c.error()).toContain('platform-admin');
    expect(c.loading()).toBeFalse();
  });

  it('renders empty (no rows, no error) when there are no users', async () => {
    api.listUsers.and.returnValue(of([] as ModelsUser[]));
    const c = await setup();
    expect(c.users().length).toBe(0);
    expect(c.error()).toBeNull();
  });
});
