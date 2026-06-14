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
    path: 'fleet-status',
    loadComponent: () =>
      import('./fleet-status/fleet-status.component').then(
        (m) => m.FleetStatusComponent,
      ),
  },
];
