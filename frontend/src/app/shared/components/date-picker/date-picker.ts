import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePickerModule],
  templateUrl: './date-picker.html',
  styleUrl: './date-picker.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatePicker),
      multi: true
    }
  ]
})
export class DatePicker implements ControlValueAccessor {
  @Input() placeholder: string = 'Chọn ngày...';
  @Input() selectionMode: 'single' | 'multiple' | 'range' = 'single';
  @Input() showTime: boolean = false;
  @Input() showIcon: boolean = true;
  @Input() disabled: boolean = false;
  @Input() dateFormat: string = 'dd/mm/yy';
  
  value: any;
  
  onChange: any = () => {};
  onTouched: any = () => {};

  writeValue(val: any): void {
    if (val) {
      if (this.selectionMode === 'range' && Array.isArray(val)) {
        this.value = val.map(d => new Date(d));
      } else {
        this.value = new Date(val);
      }
    } else {
      this.value = null;
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onModelChange(val: any) {
    this.value = val;
    this.onChange(val);
    this.onTouched();
  }
}
