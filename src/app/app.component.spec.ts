import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { of } from 'rxjs';
import { AppComponent } from './app.component';

/**
 * AppComponent depends on:
 *   - RouterLink (needs ActivatedRoute → provideRouter)
 *   - OidcSecurityService (drives the authenticated-state UI). The real
 *     service pulls in HttpClient + a fully wired OIDC config chain, so
 *     we stub it here with a minimal isAuthenticated$ stream and
 *     getAccessToken() — that's all AppComponent reads.
 */
describe('AppComponent', () => {
  const oidcStub: Partial<OidcSecurityService> = {
    isAuthenticated$: of({ isAuthenticated: false, allConfigsAuthenticated: [] }) as never,
    getAccessToken: () => of('') as never,
    authorize: () => undefined,
    logoff: () => of(null) as never,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: OidcSecurityService, useValue: oidcStub },
      ],
    }).compileComponents();
  });

  it('renders the title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const h1 = (fixture.nativeElement as HTMLElement).querySelector('h1');
    expect(h1?.textContent).toContain('leartech-auth-admin-ui');
  });

  it('sets the title property', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.title).toBe('leartech-auth-admin-ui');
  });

  it('renders the anonymous landing copy when not authenticated', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="authenticated-page"]')).toBeNull();
    expect(root.textContent).toContain('Sign in');
  });
});
