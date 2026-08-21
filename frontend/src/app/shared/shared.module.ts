import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateDirective } from '@ngx-translate/core';

// PrimeNG
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { TabsModule } from 'primeng/tabs';
import { SliderModule } from 'primeng/slider';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { CheckboxModule } from 'primeng/checkbox';
import { PasswordModule } from 'primeng/password';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TextareaModule } from 'primeng/textarea';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    TranslateDirective,
    ButtonModule,
    InputTextModule,
    TableModule,
    DialogModule,
    TabsModule,
    SliderModule,
    SelectModule,
    MultiSelectModule,
    CheckboxModule,
    PasswordModule,
    CardModule,
    ToastModule,
    ConfirmDialogModule,
    TextareaModule
  ],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    TranslateDirective,
    ButtonModule,
    InputTextModule,
    TableModule,
    DialogModule,
    TabsModule,
    SliderModule,
    SelectModule,
    MultiSelectModule,
    CheckboxModule,
    PasswordModule,
    CardModule,
    ToastModule,
    ConfirmDialogModule,
    TextareaModule
  ]
})
export class SharedModule { }
