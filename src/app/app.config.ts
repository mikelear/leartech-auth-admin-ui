import { APP_INITIALIZER, ApplicationConfig, inject, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { EnvironmentService, provideLeartechAuth } from '@mikelear/leartech-common';

import { routes } from './app.routes';

/**
 * Application configuration wires:
 *   - Router + zone change detection (standard Angular)
 *   - HttpClient with interceptor support (auth bearer is auto-injected
 *     onto secureRoutes by `provideLeartechAuth`'s AuthInterceptor)
 *   - leartech auth: OIDC against the configured Hydra `authority`,
 *     audience-bound tokens per the `audiences[]` field in api.conf.json
 *   - APP_INITIALIZER to load the runtime config (`/api.conf.json`)
 *     before any other code reads from `EnvironmentService`
 *
 * Real services cloning this template extend providers with their own
 * feature-area modules. The auth wiring above is identical across every
 * leartech Angular SPA — keep it in sync with the auth-ui template.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const env = inject(EnvironmentService);
        return () => env.load();
      },
      multi: true,
    },
    ...provideLeartechAuth(),
  ],
};
