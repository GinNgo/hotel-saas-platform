import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LayoutStateService {
  readonly hideMainHeader = signal<boolean>(false);
}
