import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./auth-callback/auth-callback.component').then(
        (m) => m.AuthCallbackComponent,
      ),
  },
  {
    path: 'tenants',
    loadComponent: () =>
      import('./tenants/tenants.component').then((m) => m.TenantsComponent),
  },
  {
    path: 'users',
    loadComponent: () =>
      import('./users/users.component').then((m) => m.UsersComponent),
  },
  // Default landing for the authenticated console: Users is the home screen
  // (it carries the stat tiles). Empty path previously rendered a bare shell.
  { path: '', redirectTo: 'users', pathMatch: 'full' },
  // Unknown paths fall back to the home screen rather than a blank outlet.
  { path: '**', redirectTo: 'users' },
];
