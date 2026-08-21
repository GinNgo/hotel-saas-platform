import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, MultiSelectModule],
  templateUrl: './app-select.html',
  styleUrl: './app-select.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppSelect),
      multi: true
    }
  ]
})
export class AppSelect implements ControlValueAccessor {
  @Input() options: any[] = [];
  @Input() placeholder: string = 'Chọn...';
  @Input() multiple: boolean = false;
  @Input() optionLabel: string = 'label';
  @Input() optionValue: string = 'value';
  @Input() disabled: boolean = false;
  
  value: any;
  
  onChange: any = () => {};
  onTouched: any = () => {};

  writeValue(val: any): void {
    this.value = val;
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
