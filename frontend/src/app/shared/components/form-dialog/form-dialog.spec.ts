import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormDialog } from './form-dialog';

describe('FormDialog', () => {
  let component: FormDialog;
  let fixture: ComponentFixture<FormDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(FormDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
