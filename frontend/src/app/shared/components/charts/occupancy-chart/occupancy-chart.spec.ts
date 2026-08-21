import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OccupancyChart } from './occupancy-chart';

describe('OccupancyChart', () => {
  let component: OccupancyChart;
  let fixture: ComponentFixture<OccupancyChart>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OccupancyChart],
    }).compileComponents();

    fixture = TestBed.createComponent(OccupancyChart);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
