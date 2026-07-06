import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';

interface TokenClaims {
  sub?: string;
  email?: string;
  aud?: string | string[];
  exp?: number;
  ext?: { email?: string; Permissions?: string[]; user_role?: string };
  [key: string]: unknown;
}

/**
 * App shell. Signed out → a branded sign-in landing; signed in → the admin
 * console shell (sidebar nav + topbar identity) with the active screen in the
 * router-outlet. Identity is decoded from the access token.
 */
@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    @if (!isAuthenticated()) {
      <div class="landing" data-testid="landing-page">
        <div class="auth">
          <div class="mark">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.5l7.5 3v5.2c0 4.6-3.1 8.1-7.5 9.3-4.4-1.2-7.5-4.7-7.5-9.3V5.5L12 2.5z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l2.2 2.2L15.4 10" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <h2>Leartech Admin</h2>
          <p>Manage tenants, users, and access across the Leartech authentication platform.</p>
          <div class="card2">
            <button type="button" class="btn primary big" (click)="login()" data-testid="sign-in-button">
              Sign in with Leartech
            </button>
            <div class="meta"><span class="dot"></span> Platform-admin access required</div>
          </div>
          <div class="authfoot">leartech-auth-service</div>
        </div>
      </div>
    } @else {
      <div class="app" data-testid="authenticated-page">
        <aside class="side" data-testid="app-sidebar">
          <div class="brand">
            <span class="glyph"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.5l7.5 3v5.2c0 4.6-3.1 8.1-7.5 9.3-4.4-1.2-7.5-4.7-7.5-9.3V5.5L12 2.5z" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/></svg></span>
            <span><b>Leartech</b><small>Admin</small></span>
          </div>
          <nav>
            <div class="navlab">Manage</div>
            <a class="nav" routerLink="/tenants" routerLinkActive="on" data-testid="nav-tenants">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="4.5" width="7" height="7" rx="1.4" stroke="currentColor" stroke-width="1.6"/><rect x="13.5" y="4.5" width="7" height="7" rx="1.4" stroke="currentColor" stroke-width="1.6"/><rect x="3.5" y="14" width="7" height="6" rx="1.4" stroke="currentColor" stroke-width="1.6"/><rect x="13.5" y="14" width="7" height="6" rx="1.4" stroke="currentColor" stroke-width="1.6"/></svg>
              Tenants
            </a>
            <a class="nav" routerLink="/users" routerLinkActive="on" data-testid="nav-users">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16 6.2A2.8 2.8 0 0118.5 11M17 14.4c2.3.5 3.9 2.3 3.9 4.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
              Users
            </a>
            <div class="navlab">Access</div>
            <span class="nav soon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 10V7.5a4 4 0 018 0V10" stroke="currentColor" stroke-width="1.6"/><rect x="5" y="10" width="14" height="9" rx="1.6" stroke="currentColor" stroke-width="1.6"/></svg>OAuth clients<span class="tag">soon</span></span>
            <span class="nav soon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4.5h14M5 12h14M5 19.5h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>Audit log<span class="tag">soon</span></span>
          </nav>
          <div class="side-foot"><span class="dot"></span> staging</div>
        </aside>

        <div class="main">
          <div class="top">
            <div class="crumb">Leartech Admin</div>
            <div class="who">
              <div class="id">
                <b>{{ roleLabel() }}</b>
                <span data-testid="user-email">{{ userEmail() }}</span>
              </div>
              <span class="avatar">{{ userInitial() }}</span>
              <button type="button" class="btn" (click)="logout()" data-testid="sign-out-button">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 5.5V4.2A1.7 1.7 0 0012.3 2.5H5.7A1.7 1.7 0 004 4.2v15.6a1.7 1.7 0 001.7 1.7h6.6a1.7 1.7 0 001.7-1.7V18.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M9 12h11m0 0l-3-3m3 3l-3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Sign out
              </button>
            </div>
          </div>
          <router-outlet />
        </div>
      </div>
    }
  `,
})
export class AppComponent implements OnInit {
  private readonly oidc = inject(OidcSecurityService);

  readonly isAuthenticated = signal(false);
  readonly tokenPayload = signal<TokenClaims | null>(null);

  readonly userEmail = computed(
    () =>
      this.tokenPayload()?.email ??
      this.tokenPayload()?.ext?.email ??
      this.tokenPayload()?.sub ??
      'unknown',
  );
  readonly userInitial = computed(() => (this.userEmail()[0] ?? '?').toUpperCase());
  readonly roleLabel = computed(() => {
    const perms = this.tokenPayload()?.ext?.Permissions ?? [];
    if (perms.includes('PlatformAdmin')) return 'Platform admin';
    if (perms.includes('Admin')) return 'Admin';
    return 'Member';
  });

  ngOnInit(): void {
    this.oidc.isAuthenticated$.subscribe(({ isAuthenticated }) => {
      this.isAuthenticated.set(isAuthenticated);
    });
    // Identity comes from userData (the id_token) — it carries `email` plus the
    // nested `ext` claims. The access token intentionally omits email (flat
    // custom claims only), so decoding it showed "unknown" in staging.
    this.oidc.userData$.subscribe(({ userData }) => {
      this.tokenPayload.set((userData as TokenClaims | null) ?? null);
    });
  }

  login(): void {
    this.oidc.authorize();
  }

  /**
   * Sign out. logoff() redirects to Hydra's end-session; if Hydra rejects the
   * post-logout redirect (e.g. not yet registered), still end the local session
   * so the user lands back on the sign-in page instead of a dead error.
   */
  logout(): void {
    this.oidc.logoff().subscribe({
      error: () => this.oidc.logoffLocal(),
    });
  }
}
