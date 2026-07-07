import {
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { User } from '../models';
import { UsersApiAdapter } from './users-api.adapter';

const ROLES = ['member', 'tenant_admin', 'platform_admin'] as const;
const KNOWN_PERMS = ['User', 'Admin', 'PlatformAdmin'];

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(b);
  return a.every((x) => s.has(x));
}

/**
 * UserDrawer — the slide-over panel that is the whole user lifecycle: opens
 * empty in CREATE mode ("New user") or over a row in EDIT/detail mode. Profile,
 * role, permissions and active are edited inline and saved as a diff (only the
 * changed fields hit their endpoints); factor resets and delete are immediate.
 * Email is the login identity — editable on create, locked on edit.
 */
@Component({
  selector: 'app-user-drawer',
  imports: [FormsModule],
  template: `
    <div class="scrim" (click)="close()"></div>
    <aside class="drawer" role="dialog" [attr.aria-label]="mode() === 'create' ? 'Create user' : 'Edit user'" data-testid="user-drawer">
      <div class="dhead">
        <div class="av">{{ initial() }}</div>
        <div class="h-main">
          <div class="eyebrow">{{ mode() === 'create' ? 'New user' : 'Edit user' }}</div>
          <h2>{{ mode() === 'create' ? (email() || 'New user') : email() }}</h2>
          @if (mode() === 'edit') { <div class="sub">{{ original?.id }}</div> }
        </div>
        <button class="xbtn" (click)="close()" aria-label="Close" data-testid="drawer-close">✕</button>
      </div>

      @if (error()) { <p class="derror" data-testid="drawer-error">{{ error() }}</p> }

      <div class="dbody">
        <div class="group">
          <div class="glabel">Profile</div>
          <div class="field">
            <label for="d-name">Display name</label>
            <input id="d-name" class="input" data-testid="drawer-displayname" [ngModel]="displayName()" (ngModelChange)="displayName.set($event)" [disabled]="busy()" />
          </div>
          <div class="field">
            <label for="d-email">Email</label>
            @if (mode() === 'create') {
              <input id="d-email" class="input" type="email" data-testid="drawer-email" [ngModel]="email()" (ngModelChange)="email.set($event)" [disabled]="busy()" placeholder="name@leartech.com" />
            } @else {
              <input id="d-email" class="input locked" [value]="email()" readonly />
              <div class="hint">Email is the login identity and can't be changed here.</div>
            }
          </div>
        </div>

        <div class="group">
          <div class="glabel">Access &amp; role</div>
          <div class="field">
            <label>Role</label>
            <div class="seg" data-testid="drawer-role">
              @for (r of roles; track r) {
                <button type="button" [class.sel]="role() === r" (click)="role.set(r)" [disabled]="busy()" [attr.data-testid]="'drawer-role-' + r">{{ r }}</button>
              }
            </div>
          </div>
          <div class="field switchrow">
            <div><div class="sname">Account active</div><div class="hint">Suspending blocks sign-in on the next token.</div></div>
            <button type="button" class="switch" [class.on]="active()" [attr.aria-pressed]="active()" (click)="active.set(!active())" [disabled]="busy()" data-testid="drawer-active"></button>
          </div>
        </div>

        <div class="group">
          <div class="glabel">Permissions</div>
          <div class="permset">
            @for (p of knownPerms; track p) {
              <button type="button" class="ptoggle" [class.on]="hasPerm(p)" (click)="togglePerm(p)" [disabled]="busy()" [attr.data-testid]="'drawer-perm-' + p">{{ p }}</button>
            }
            @for (p of extraPerms(); track p) { <span class="ptoggle static">{{ p }}</span> }
          </div>
          <div class="hint" style="margin-top:10px">Granting <b>PlatformAdmin</b> requires you to be a platform admin.</div>
        </div>

        @if (mode() === 'edit') {
          <div class="group">
            <div class="glabel">Security</div>
            <div class="secrow">
              <div><div class="sname">Two-factor (TOTP)</div><div class="sstate">{{ original?.has2FA ? 'Enrolled' : 'Not enrolled' }}</div></div>
              <div class="sr-actions">
                <span class="badge2" [class.yes]="original?.has2FA">{{ original?.has2FA ? 'On' : 'Off' }}</span>
                <button type="button" class="linkbtn" (click)="resetTwoFactor()" [disabled]="busy() || !original?.has2FA" data-testid="drawer-reset-2fa">Reset</button>
              </div>
            </div>
            <div class="secrow">
              <div><div class="sname">Passkey</div><div class="sstate">{{ original?.hasPasskey ? 'Registered' : 'None' }}</div></div>
              <div class="sr-actions">
                <span class="badge2" [class.yes]="original?.hasPasskey">{{ original?.hasPasskey ? 'On' : 'Off' }}</span>
                <button type="button" class="linkbtn" (click)="resetPasskeys()" [disabled]="busy() || !original?.hasPasskey" data-testid="drawer-reset-passkey">Reset</button>
              </div>
            </div>
          </div>
        }
      </div>

      <div class="dfoot">
        @if (mode() === 'edit') {
          @if (confirmDelete()) {
            <span class="confirm">
              <button type="button" class="btn-danger" (click)="remove()" [disabled]="busy()" data-testid="drawer-delete-confirm">Confirm delete</button>
              <button type="button" class="btn-ghost sm" (click)="confirmDelete.set(false)">Cancel</button>
            </span>
          } @else {
            <button type="button" class="btn-danger" (click)="confirmDelete.set(true)" [disabled]="busy()" data-testid="drawer-delete">Delete user</button>
          }
        } @else { <span></span> }
        <div class="foot-r">
          <button type="button" class="btn-ghost" (click)="close()" [disabled]="busy()">Cancel</button>
          <button type="button" class="btn-save" (click)="save()" [disabled]="busy() || !canSave()" data-testid="drawer-save">
            {{ busy() ? 'Saving…' : (mode() === 'create' ? 'Create user' : 'Save changes') }}
          </button>
        </div>
      </div>
    </aside>
  `,
  styles: [
    `
      .scrim { position: fixed; inset: 0; background: rgba(24,28,36,0.32); z-index: 40; }
      .drawer { position: fixed; top: 0; right: 0; height: 100vh; width: 452px; max-width: 100vw; background: #fff; border-left: 1px solid #e7eaef; box-shadow: -18px 0 48px rgba(24,28,36,0.14); display: flex; flex-direction: column; z-index: 41; }
      .dhead { padding: 20px 22px 18px; border-bottom: 1px solid #e7eaef; display: flex; gap: 14px; align-items: flex-start; }
      .av { width: 44px; height: 44px; border-radius: 11px; background: #eceafc; color: #4d4ad6; display: grid; place-items: center; font-weight: 700; font-size: 18px; flex: none; }
      .h-main { min-width: 0; flex: 1; }
      .eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #4d4ad6; }
      .dhead h2 { margin: 3px 0 4px; font-size: 17px; letter-spacing: -0.01em; overflow-wrap: anywhere; }
      .sub { font-size: 11.5px; color: #aab1bd; font-family: ui-monospace, monospace; }
      .xbtn { border: 1px solid #e7eaef; background: #fff; width: 30px; height: 30px; border-radius: 8px; color: #868e9c; cursor: pointer; font-size: 15px; flex: none; }
      .derror { margin: 0; padding: 10px 22px; background: #fdeeec; color: #c23b30; font-size: 12.5px; border-bottom: 1px solid #f6d9d5; }
      .dbody { flex: 1; overflow-y: auto; padding: 6px 22px 22px; }
      .group { padding: 18px 0; border-bottom: 1px solid #eef0f3; }
      .group:last-child { border-bottom: 0; }
      .glabel { font-size: 10.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #aab1bd; margin-bottom: 13px; }
      .field { margin-bottom: 13px; }
      .field:last-child { margin-bottom: 0; }
      .field label { display: block; font-size: 12px; font-weight: 600; color: #4a515d; margin-bottom: 6px; }
      .input { width: 100%; border: 1px solid #d7dbe2; border-radius: 9px; padding: 9px 11px; font-size: 13px; color: #1a1d24; background: #fff; }
      .input:focus { outline: 2px solid #c8c7f6; border-color: #5a57e6; }
      .input.locked { background: #f6f7f9; color: #868e9c; }
      .hint { font-size: 11px; color: #aab1bd; margin-top: 5px; }
      .seg { display: inline-flex; background: #f1f2f5; border-radius: 9px; padding: 3px; gap: 2px; flex-wrap: wrap; }
      .seg button { border: 0; background: transparent; font: inherit; font-size: 12.5px; font-weight: 600; color: #6a7280; padding: 6px 13px; border-radius: 7px; cursor: pointer; }
      .seg button.sel { background: #fff; color: #1a1d24; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
      .switchrow { display: flex; align-items: center; justify-content: space-between; }
      .sname { font-size: 13px; font-weight: 600; }
      .sstate { font-size: 11.5px; color: #868e9c; }
      .switch { width: 38px; height: 22px; border-radius: 999px; background: #cfd4dc; position: relative; border: 0; cursor: pointer; flex: none; transition: background 0.12s; }
      .switch.on { background: #0f7b3f; }
      .switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.25); transition: left 0.12s; }
      .switch.on::after { left: 18px; }
      .permset { display: flex; gap: 7px; flex-wrap: wrap; }
      .ptoggle { font: inherit; font-size: 12px; font-weight: 600; padding: 5px 11px; border-radius: 999px; border: 1px solid #d7dbe2; background: #fff; color: #aab1bd; cursor: pointer; }
      .ptoggle.on { color: #0f7b3f; border-color: #a7e8c0; background: #e9fbf0; }
      .ptoggle.static { cursor: default; }
      .secrow { display: flex; align-items: center; justify-content: space-between; padding: 11px 0; border-bottom: 1px dashed #eef0f3; }
      .secrow:last-child { border-bottom: 0; }
      .sr-actions { display: flex; align-items: center; gap: 12px; }
      .badge2 { font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.03em; background: #f1f2f5; color: #aab1bd; }
      .badge2.yes { background: #e9fbf0; color: #0f7b3f; }
      .linkbtn { border: 0; background: none; color: #4d4ad6; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
      .linkbtn:disabled { color: #c3c8d0; cursor: default; }
      .dfoot { border-top: 1px solid #e7eaef; padding: 14px 22px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .btn-danger { border: 1px solid #fdeeec; background: #fdeeec; color: #c23b30; font: inherit; font-size: 12.5px; font-weight: 600; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
      .confirm { display: flex; align-items: center; gap: 8px; }
      .foot-r { display: flex; gap: 9px; }
      .btn-ghost { border: 1px solid #d7dbe2; background: #fff; color: #4a515d; font: inherit; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 8px; cursor: pointer; }
      .btn-ghost.sm { padding: 6px 10px; font-size: 12px; }
      .btn-save { border: 0; background: #5a57e6; color: #fff; font: inherit; font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: 8px; cursor: pointer; }
      .btn-save:disabled { opacity: 0.55; cursor: default; }
      @media (max-width: 560px) { .drawer { width: 100vw; } }
    `,
  ],
})
export class UserDrawerComponent {
  private readonly api = inject(UsersApiAdapter);
  readonly roles = ROLES;
  readonly knownPerms = KNOWN_PERMS;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  original: User | null = null;
  readonly mode = signal<'create' | 'edit'>('create');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly confirmDelete = signal(false);

  readonly email = signal('');
  readonly displayName = signal('');
  readonly role = signal<string>('member');
  readonly permissions = signal<string[]>([]);
  readonly active = signal(true);

  @Input() set user(u: User | null) {
    this.original = u ?? null;
    this.error.set(null);
    this.confirmDelete.set(false);
    if (u) {
      this.mode.set('edit');
      this.email.set(u.email ?? '');
      this.displayName.set(u.displayName ?? '');
      this.role.set(u.role ?? 'member');
      this.permissions.set([...(u.permissions ?? [])]);
      this.active.set(u.active !== false);
    } else {
      this.mode.set('create');
      this.email.set('');
      this.displayName.set('');
      this.role.set('member');
      this.permissions.set([]);
      this.active.set(true);
    }
  }

  readonly extraPerms = computed(() =>
    this.permissions().filter((p) => !this.knownPerms.includes(p)),
  );

  initial(): string {
    return (this.email() || 'N').charAt(0).toUpperCase();
  }
  hasPerm(p: string): boolean {
    return this.permissions().includes(p);
  }
  togglePerm(p: string): void {
    const cur = this.permissions();
    this.permissions.set(cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);
  }
  canSave(): boolean {
    return this.mode() === 'edit' || this.email().trim().length > 0;
  }
  close(): void {
    if (!this.busy()) this.closed.emit();
  }

  async save(): Promise<void> {
    if (this.busy() || !this.canSave()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.mode() === 'create') {
        await firstValueFrom(
          this.api.createUser({
            email: this.email().trim(),
            displayName: this.displayName().trim(),
            role: this.role(),
            permissions: this.permissions(),
          }),
        );
      } else {
        const o = this.original!;
        const id = o.id!;
        // Diff-save: only changed fields hit their endpoints.
        if (this.displayName().trim() !== (o.displayName ?? '')) {
          await firstValueFrom(this.api.updateUser(id, this.displayName().trim()));
        }
        if (this.role() !== o.role) {
          await firstValueFrom(this.api.setRole(id, this.role()));
        }
        if (!sameSet(this.permissions(), o.permissions ?? [])) {
          await firstValueFrom(this.api.setPermissions(id, this.permissions()));
        }
        if (this.active() !== (o.active !== false)) {
          await firstValueFrom(this.api.setActive(id, this.active()));
        }
      }
      this.saved.emit();
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set(false);
    }
  }

  async remove(): Promise<void> {
    const id = this.original?.id;
    if (!id || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.deleteUser(id));
      this.saved.emit();
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set(false);
    }
  }

  async resetTwoFactor(): Promise<void> {
    await this.runReset(() => this.api.resetTwoFactor(this.original!.id!));
  }
  async resetPasskeys(): Promise<void> {
    await this.runReset(() => this.api.resetPasskeys(this.original!.id!));
  }
  private async runReset(call: () => import('rxjs').Observable<unknown>): Promise<void> {
    const id = this.original?.id;
    if (!id || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(call());
      this.saved.emit(); // parent reloads → fresh factor status
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set(false);
    }
  }

  private describe(e: unknown): string {
    if (e && typeof e === 'object' && 'status' in e) {
      const status = (e as { status?: number }).status;
      if (status === 403) return 'Forbidden — platform-admin permission required.';
      if (status === 409) return 'A user with that email already exists.';
      if (status === 0) return 'Could not reach the auth service (network or CORS).';
      const apiError = (e as { error?: { error?: string } }).error?.error;
      return apiError ? `Error ${status}: ${apiError}` : `Request failed (HTTP ${status ?? '?'}).`;
    }
    return e instanceof Error ? e.message : String(e);
  }
}
