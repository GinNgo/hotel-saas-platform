import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppSelect } from './app-select';

describe('AppSelect', () => {
  let component: AppSelect;
  let fixture: ComponentFixture<AppSelect>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppSelect],
    }).compileComponents();

    fixture = TestBed.createComponent(AppSelect);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
