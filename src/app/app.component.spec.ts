import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { of, throwError } from 'rxjs';
import { AppComponent } from './app.component';

/** Build a fake JWT the component can decode (header.payload.sig). */
function jwt(payload: object): string {
  return `h.${btoa(JSON.stringify(payload))}.s`;
}

const anon: Partial<OidcSecurityService> = {
  isAuthenticated$: of({ isAuthenticated: false, allConfigsAuthenticated: [] }) as never,
  getAccessToken: () => of('') as never,
  authorize: () => undefined,
  logoff: () => of(null) as never,
  logoffLocal: () => of(null) as never,
};

async function setup(oidc: Partial<OidcSecurityService>) {
  await TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [provideRouter([]), { provide: OidcSecurityService, useValue: oidc }],
  }).compileComponents();
  const fixture = TestBed.createComponent(AppComponent);
  fixture.detectChanges(); // ngOnInit → sets auth signals
  fixture.detectChanges(); // render the resulting view
  return fixture;
}

describe('AppComponent', () => {
  it('shows the branded landing (not the shell) when signed out', async () => {
    const el = (await setup(anon)).nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="landing-page"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="sign-in-button"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="authenticated-page"]')).toBeNull();
  });

  it('shows the shell + identity when signed in', async () => {
    const f = await setup({
      ...anon,
      isAuthenticated$: of({ isAuthenticated: true, allConfigsAuthenticated: [] }) as never,
      getAccessToken: () =>
        of(
          jwt({
            sub: 'user-test-platform',
            ext: { email: 'platform@leartech.com', Permissions: ['User', 'Admin', 'PlatformAdmin'] },
          }),
        ) as never,
    });
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="authenticated-page"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="app-sidebar"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="nav-tenants"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="nav-users"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="user-email"]')?.textContent).toContain('platform@leartech.com');
    expect(f.componentInstance.roleLabel()).toBe('Platform admin');
    expect(f.componentInstance.userInitial()).toBe('P');
  });

  it('signs out via logoff', async () => {
    const logoff = jasmine.createSpy('logoff').and.returnValue(of(null));
    const f = await setup({ ...anon, logoff: logoff as never });
    f.componentInstance.logout();
    expect(logoff).toHaveBeenCalled();
  });

  it('falls back to local logout when Hydra rejects the post-logout redirect', async () => {
    const logoffLocal = jasmine.createSpy('logoffLocal').and.returnValue(of(null));
    const f = await setup({
      ...anon,
      logoff: (() => throwError(() => new Error('redirect_uri not registered'))) as never,
      logoffLocal: logoffLocal as never,
    });
    f.componentInstance.logout();
    expect(logoffLocal).toHaveBeenCalled();
  });
});
