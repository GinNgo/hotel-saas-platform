import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChartModule } from 'primeng/chart';

@Component({
  selector: 'app-pie-chart',
  standalone: true,
  imports: [CommonModule, ChartModule],
  templateUrl: './pie-chart.html',
  styleUrl: './pie-chart.css'
})
export class PieChart implements OnInit {
  @Input() title: string = 'Tỷ lệ Loại phòng';
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

    this.options = {
      plugins: {
        legend: {
          labels: {
            usePointStyle: true,
            color: textColor
          }
        }
      }
    };
  }
}
