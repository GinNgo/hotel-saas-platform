import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { FavoriteService } from '../../../core/services/favorite.service';
import { AuthService } from '../../../core/services/auth';
import { PublicI18nService } from '../../../core/i18n/public-i18n.service';

@Component({
  selector: 'app-favorite-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      class="favorite-button"
      [class.active]="isActive"
      [class.hero]="variant === 'hero'"
      [disabled]="busy"
      [attr.aria-pressed]="isActive"
      [attr.aria-busy]="busy"
      [attr.aria-label]="isActive ? i18n.text('PUBLIC.FAVORITES.REMOVE_ARIA') : i18n.text('PUBLIC.FAVORITES.SAVE_ARIA')"
      [title]="isActive ? i18n.text('PUBLIC.FAVORITES.REMOVE_ARIA') : i18n.text('PUBLIC.FAVORITES.SAVE_ARIA')"
      (click)="toggle($event)">
      <i class="pi" [ngClass]="isActive ? 'pi-heart-fill' : 'pi-heart'" aria-hidden="true"></i>
      <span *ngIf="showLabel">{{ isActive ? i18n.text('PUBLIC.FAVORITES.SAVED') : i18n.text('PUBLIC.FAVORITES.SAVE') }}</span>
    </button>
  `,
  styles: [`
    .favorite-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:38px;height:38px;padding:0 10px;border:1px solid #cbd5e1;border-radius:999px;background:#fff;color:#475569;cursor:pointer;font:inherit;font-weight:800;transition:.18s}.favorite-button:hover{border-color:#e11d48;color:#be123c;background:#fff1f2}.favorite-button.active{border-color:#fb7185;color:#be123c;background:#fff1f2}.favorite-button:disabled{opacity:.6;cursor:wait}.favorite-button.hero{border-color:rgba(255,255,255,.8);background:rgba(15,23,42,.62);color:#fff}.favorite-button.hero:hover,.favorite-button.hero.active{border-color:#fecdd3;background:rgba(136,19,55,.8);color:#fff}.favorite-button:focus-visible{outline:3px solid rgba(37,99,235,.35);outline-offset:2px}
  `],
})
export class FavoriteButtonComponent {
  @Input({ required: true }) hotelId!: string | number;
  @Input() variant: 'default' | 'hero' = 'default';
  @Input() showLabel = false;

  private readonly favoriteService = inject(FavoriteService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly i18n = inject(PublicI18nService);
  busy = false;

  get isActive(): boolean { return this.favoriteService.isFavorite(this.hotelId); }

  ngOnInit(): void {
    if (this.auth.isLoggedIn()) {
      this.favoriteService.ensureLoaded().subscribe({ error: () => undefined });
    }
  }

  toggle(event: Event): void {
    event.stopPropagation();
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.busy = true;
    const request: Observable<unknown> = this.isActive
      ? this.favoriteService.remove(this.hotelId)
      : this.favoriteService.add(this.hotelId);
    request.subscribe({
      next: () => { this.busy = false; },
      error: () => { this.busy = false; },
    });
  }
}
