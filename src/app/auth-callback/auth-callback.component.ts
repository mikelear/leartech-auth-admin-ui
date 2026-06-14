import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { OidcSecurityService } from 'angular-auth-oidc-client';

/**
 * OIDC redirect target. provideLeartechAuth sets
 * redirectUrl = window.location.origin + '/auth/callback', so this
 * route must exist and call checkAuth() to complete the code exchange.
 */
@Component({
  selector: 'app-auth-callback',
  template: '<p>Completing sign in…</p>',
})
export class AuthCallbackComponent implements OnInit {
  private readonly oidc = inject(OidcSecurityService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.oidc.checkAuth().subscribe({
      next: ({ isAuthenticated }) => {
        if (isAuthenticated) {
          const returnUrl = sessionStorage.getItem('returnUrl') ?? '/';
          sessionStorage.removeItem('returnUrl');
          this.router.navigateByUrl(returnUrl);
        } else {
          this.router.navigateByUrl('/');
        }
      },
      error: () => this.router.navigateByUrl('/'),
    });
  }
}
