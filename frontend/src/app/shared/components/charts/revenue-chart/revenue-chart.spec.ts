import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RevenueChart } from './revenue-chart';

describe('RevenueChart', () => {
  let component: RevenueChart;
  let fixture: ComponentFixture<RevenueChart>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RevenueChart],
    }).compileComponents();

    fixture = TestBed.createComponent(RevenueChart);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
