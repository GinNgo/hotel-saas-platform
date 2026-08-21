import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule, CardModule],
  templateUrl: './stat-card.html',
  styleUrl: './stat-card.css'
})
export class StatCard {
  @Input() title: string = '';
  @Input() value: string | number = '';
  @Input() icon: string = 'pi pi-chart-line';
  @Input() iconColor: string = 'var(--hotel-primary)';
  @Input() iconBgColor: string = 'var(--hotel-primary-light)';
  @Input() trend: 'up' | 'down' | 'neutral' = 'neutral';
  @Input() percentage: number | null = null;
  @Input() borderColor: string = '';
}
