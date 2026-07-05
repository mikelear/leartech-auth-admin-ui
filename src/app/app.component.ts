import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';

interface TokenClaims {
  sub?: string;
  email?: string;
  aud?: string | string[];
  exp?: number;
  ext?: { email?: string; Permissions?: string[] };
  [key: string]: unknown;
}

/**
 * App shell with OIDC auth state. Mirrors leartech-auth-ui's HomeComponent
 * pattern — shows authenticated user info + token claims so the
 * login-flow Playwright spec can verify the round-trip succeeded.
 */
@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterLink, RouterOutlet],
  template: `
    <main class="shell">
      <header>
        <h1>{{ title }}</h1>
        <p class="sub">Golden Angular SPA service template.</p>
        <nav>
          <a routerLink="/fleet-status">Fleet status</a>
          @if (isAuthenticated()) {
            <a routerLink="/tenants" data-testid="nav-tenants">Tenants</a>
          }
          @if (isAuthenticated()) {
            <button type="button" (click)="logout()" class="link-button">Sign out</button>
          } @else {
            <button type="button" (click)="login()" class="link-button">Sign in</button>
          }
        </nav>
      </header>

      @if (isAuthenticated()) {
        <section class="auth-card" data-testid="authenticated-page">
          <h2>Authenticated</h2>
          <p>Signed in as <strong data-testid="user-email">{{ tokenPayload()?.ext?.email ?? tokenPayload()?.email ?? 'unknown' }}</strong></p>
          <p>User ID: <code data-testid="user-id">{{ tokenPayload()?.sub ?? 'unknown' }}</code></p>
          <h3>Token info</h3>
          <pre class="token-display" data-testid="token-payload">{{ tokenPayload() | json }}</pre>
        </section>
      } @else {
        <section>
          <p>
            Clone this repo, rename <code>leartech-auth-admin-ui</code>
            everywhere, and start building. See <code>CLAUDE.md</code> for the
            per-service wiring checklist.
          </p>
          <p>
            Click <strong>Sign in</strong> to drive the OAuth flow against the
            configured Hydra and validate the SPA's audience-bound token chain.
          </p>
        </section>
      }
      <router-outlet />
    </main>
  `,
  styles: [`
    nav { margin-top: 0.5rem; display: flex; gap: 1rem; align-items: center; }
    nav a, .link-button { color: #06c; text-decoration: none; background: none; border: 0; padding: 0; font: inherit; cursor: pointer; }
    nav a:hover, .link-button:hover { text-decoration: underline; }
    .auth-card { padding: 1rem; border: 1px solid #ddd; border-radius: 4px; margin-top: 1rem; max-width: 60ch; }
    .token-display { background: #f6f6f6; padding: 0.75rem; border-radius: 3px; font-size: 0.8em; overflow-x: auto; }
  `],
})
export class AppComponent implements OnInit {
  private readonly oidc = inject(OidcSecurityService);
  title = 'leartech-auth-admin-ui';

  isAuthenticated = signal(false);
  tokenPayload = signal<TokenClaims | null>(null);

  ngOnInit(): void {
    this.oidc.isAuthenticated$.subscribe(({ isAuthenticated }) => {
      this.isAuthenticated.set(isAuthenticated);
      if (!isAuthenticated) {
        this.tokenPayload.set(null);
        return;
      }
      this.oidc.getAccessToken().subscribe((token) => {
        if (!token) {
          this.tokenPayload.set(null);
          return;
        }
        try {
          const payload = token.split('.')[1];
          const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
          this.tokenPayload.set(JSON.parse(atob(normalized)) as TokenClaims);
        } catch {
          this.tokenPayload.set(null);
        }
      });
    });
  }

  login(): void {
    this.oidc.authorize();
  }

  logout(): void {
    this.oidc.logoff().subscribe();
  }
}
