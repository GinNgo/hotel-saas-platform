import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';

interface TextPart { text: string; matched: boolean; }

@Component({
  selector: 'app-safe-highlight',
  standalone: true,
  imports: [CommonModule],
  template: `<ng-container *ngFor="let part of parts"><mark *ngIf="part.matched">{{ part.text }}</mark><ng-container *ngIf="!part.matched">{{ part.text }}</ng-container></ng-container>`,
  styles: [`mark { color: inherit; background: #fef3c7; border-radius: 2px; padding: 0; font-weight: 700; }`]
})
export class SafeHighlightComponent implements OnChanges {
  @Input() text = '';
  @Input() keyword = '';
  parts: TextPart[] = [];

  ngOnChanges(): void {
    this.parts = this.splitText(this.text, this.keyword);
  }

  private splitText(text: string, keyword: string): TextPart[] {
    const term = this.normalize(keyword.trim());
    if (!term) return [{ text, matched: false }];

    const normalized: string[] = [];
    const sourceIndexes: number[] = [];
    Array.from(text).forEach((character, index) => {
      const folded = this.normalize(character);
      Array.from(folded).forEach(value => {
        normalized.push(value);
        sourceIndexes.push(index);
      });
    });
    const matchIndex = normalized.join('').indexOf(term);
    if (matchIndex < 0) return [{ text, matched: false }];
    const start = sourceIndexes[matchIndex];
    const end = sourceIndexes[Math.min(matchIndex + term.length - 1, sourceIndexes.length - 1)] + 1;
    return [
      { text: text.slice(0, start), matched: false },
      { text: text.slice(start, end), matched: true },
      { text: text.slice(end), matched: false }
    ].filter(part => part.text.length > 0);
  }

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
  }
}
