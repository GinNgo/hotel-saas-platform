import { PropertyResultsMapComponent } from './property-results-map.component';

describe('PropertyResultsMapComponent', () => {
  it('only maps properties with real coordinates', () => {
    const component = new PropertyResultsMapComponent();
    component.properties = [
      { id: 'near', name: 'Near', addressLine: 'A', starRating: 4, latitude: 16.0611, longitude: 108.2277 },
      { id: 'missing', name: 'Missing', addressLine: 'B', starRating: 3, latitude: 0, longitude: 0 },
      { id: 'invalid', name: 'Invalid', addressLine: 'C', starRating: 3, latitude: 100, longitude: 200 }
    ];

    expect(component.mappableProperties.map(item => item.id)).toEqual(['near']);
  });

  it('formats the selected property price without inventing a zero rate', () => {
    const component = new PropertyResultsMapComponent();

    expect(component.formatVnd(1_250_000)).toContain('1.250.000');
    expect(component.formatVnd(0)).toBe('Xem giá phòng');
  });
});
