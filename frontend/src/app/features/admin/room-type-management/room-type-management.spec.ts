import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomTypeManagement } from './room-type-management';

describe('RoomTypeManagement', () => {
  let component: RoomTypeManagement;
  let fixture: ComponentFixture<RoomTypeManagement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomTypeManagement],
    }).compileComponents();

    fixture = TestBed.createComponent(RoomTypeManagement);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
