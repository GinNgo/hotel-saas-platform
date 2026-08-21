import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { FilterRequest } from '../../models/pagination.model';
import { DatePicker } from '../date-picker/date-picker';
import { AppSelect } from '../app-select/app-select';

export interface FilterConfig {
  field: string;
  label: string;
  type: 'text' | 'select' | 'multiselect' | 'date' | 'daterange';
  options?: any[]; // For select/multiselect
  placeholder?: string;
}

@Component({
  selector: 'app-filter-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    ButtonModule,
    DatePicker,
    AppSelect
  ],
  templateUrl: './filter-panel.html',
  styleUrl: './filter-panel.css'
})
export class FilterPanel {
  @Input() filters: FilterConfig[] = [];
  @Output() filterChange = new EventEmitter<FilterRequest>();

  isExpanded = signal<boolean>(true);
  filterValues: { [key: string]: any } = {};

  toggleExpand() {
    this.isExpanded.update(v => !v);
  }

  onSearch() {
    const request: FilterRequest = { ...this.filterValues };
    this.filterChange.emit(request);
  }

  onReset() {
    this.filterValues = {};
    this.filterChange.emit({});
  }
}
