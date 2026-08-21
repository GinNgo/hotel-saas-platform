import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';

@Component({
  selector: 'app-revenue-chart',
  standalone: true,
  imports: [CommonModule, ChartModule],
  templateUrl: './revenue-chart.html',
  styleUrl: './revenue-chart.css'
})
export class RevenueChart implements OnInit {
  @Input() labels: string[] = [];
  @Input() datasets: any[] = [];
  
  data: any;
  options: any;

  ngOnInit() {
    this.data = {
      labels: this.labels,
      datasets: this.datasets
    };

    const documentStyle = getComputedStyle(document.documentElement);
    const textColor = documentStyle.getPropertyValue('--text-color');
    const textColorSecondary = documentStyle.getPropertyValue('--text-color-secondary');
    const surfaceBorder = documentStyle.getPropertyValue('--surface-border');

    this.options = {
      maintainAspectRatio: false,
      aspectRatio: 0.6,
      plugins: {
        legend: {
          labels: {
            color: textColor
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: textColorSecondary
          },
          grid: {
            color: surfaceBorder,
            drawBorder: false
          }
        },
        y: {
          ticks: {
            color: textColorSecondary
          },
          grid: {
            color: surfaceBorder,
            drawBorder: false
          }
        }
      }
    };
  }
}
