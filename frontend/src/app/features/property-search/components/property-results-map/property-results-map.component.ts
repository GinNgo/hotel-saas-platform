import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import * as L from 'leaflet';

import { Hotel } from '../../../../core/services/client-api.service';

@Component({
  selector: 'app-property-results-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="map-shell" aria-label="Bản đồ cơ sở lưu trú">
      <div #mapContainer class="map-canvas"></div>
      <div *ngIf="!mappableProperties.length" class="map-empty"><i class="pi pi-map-marker"></i><strong>Chưa có vị trí trên bản đồ</strong><span>Các cơ sở cần được cập nhật tọa độ để hiển thị tại đây.</span></div>
      <article *ngIf="selectedProperty as property" class="map-card">
        <img [src]="property.thumbnailUrl || property.mainImageUrl || property.mainImage || '/assets/fallbacks/hotel-default.webp'" [alt]="property.name">
        <div><span>{{ property.propertyType || 'HOTEL' }}</span><h2>{{ property.name }}</h2><p><i class="pi pi-map-marker"></i>{{ property.distanceText || property.addressLine }}</p><strong>{{ formatVnd(property.startingPrice || property.pricing?.discountedNightlyPrice || 0) }}</strong></div>
        <button type="button" (click)="viewDetails.emit(property.id)" [attr.aria-label]="'Xem ' + property.name"><i class="pi pi-arrow-right"></i></button>
      </article>
    </section>
  `,
  styles: [`
    :host{display:block}.map-shell{position:relative;height:clamp(460px,68vh,760px);overflow:hidden;background:#e8ece8;border:1px solid #d6d3d1;border-radius:16px;box-shadow:0 12px 32px rgb(28 25 23 / .08)}.map-canvas{width:100%;height:100%;z-index:1}.map-empty{position:absolute;z-index:2;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#57534e;background:radial-gradient(circle at 50% 35%,#fff,#e7ece7)}.map-empty i{font-size:34px;color:#0f766e}.map-empty span{font-size:13px}.map-card{position:absolute;z-index:500;left:18px;right:18px;bottom:18px;display:grid;grid-template-columns:112px minmax(0,1fr) 46px;gap:14px;align-items:center;max-width:560px;padding:10px;background:rgb(255 255 255 / .97);border:1px solid #d6d3d1;border-radius:14px;box-shadow:0 14px 32px rgb(28 25 23 / .2)}.map-card img{width:112px;height:92px;object-fit:cover;border-radius:10px}.map-card span{font-size:10px;font-weight:850;color:#0f766e}.map-card h2{margin:2px 0 5px;font-size:17px}.map-card p{margin:0 0 5px;color:#78716c;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.map-card p i{margin-right:5px}.map-card strong{color:#b45309;font-size:14px}.map-card button{width:44px;height:44px;border:0;border-radius:50%;background:#0f766e;color:#fff;cursor:pointer}:host ::ng-deep .hotel-price-marker{width:auto!important;height:auto!important;border:0!important;background:transparent!important}:host ::ng-deep .hotel-price-marker span{display:block;padding:7px 10px;color:#1c1917;background:#fff;border:2px solid #0f766e;border-radius:999px;box-shadow:0 5px 14px rgb(28 25 23 / .22);font:800 11px 'Be Vietnam Pro',sans-serif;white-space:nowrap}:host ::ng-deep .hotel-price-marker.selected span{color:#fff;background:#0f766e;transform:scale(1.08)}@media(max-width:600px){.map-shell{height:calc(100dvh - 250px);min-height:480px;border-radius:12px}.map-card{left:10px;right:10px;bottom:10px;grid-template-columns:82px minmax(0,1fr) 44px}.map-card img{width:82px;height:78px}.map-card h2{font-size:14px}}
  `]
})
export class PropertyResultsMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLElement>;
  @Input() properties: Hotel[] = [];
  @Output() viewDetails = new EventEmitter<string | number>();
  selectedProperty: Hotel | null = null;
  private map?: L.Map;
  private markerLayer?: L.LayerGroup;

  get mappableProperties(): Hotel[] { return this.properties.filter(item => this.validCoordinate(item.latitude, item.longitude)); }

  ngAfterViewInit(): void {
    this.map = L.map(this.mapContainer.nativeElement, { zoomControl: true, attributionControl: true }).setView([16.2, 106.8], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(this.map);
    this.renderMarkers();
  }

  ngOnChanges(changes: SimpleChanges): void { if (changes['properties'] && this.map) this.renderMarkers(); }
  ngOnDestroy(): void { this.map?.remove(); }

  private renderMarkers(): void {
    if (!this.map) return;
    this.markerLayer?.remove();
    this.markerLayer = L.layerGroup().addTo(this.map);
    if (!this.selectedProperty || !this.mappableProperties.some(item => item.id === this.selectedProperty?.id)) this.selectedProperty = this.mappableProperties[0] || null;
    const points = this.mappableProperties.map(property => {
      const marker = L.marker([property.latitude, property.longitude], { icon: this.markerIcon(property, false), keyboard: true, title: property.name });
      marker.on('click', () => {
        this.selectedProperty = property;
        this.renderMarkers();
        this.map?.panTo([property.latitude, property.longitude]);
      });
      marker.addTo(this.markerLayer!);
      return L.latLng(property.latitude, property.longitude);
    });
    if (points.length === 1) this.map.setView(points[0], 14);
    else if (points.length > 1) this.map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  private markerIcon(property: Hotel, selected: boolean): L.DivIcon {
    const isSelected = selected || property.id === this.selectedProperty?.id;
    return L.divIcon({ className: `hotel-price-marker${isSelected ? ' selected' : ''}`, html: `<span>${this.shortPrice(property.startingPrice || property.pricing?.discountedNightlyPrice || 0)}</span>`, iconAnchor: [34, 18] });
  }
  private validCoordinate(latitude: number, longitude: number): boolean { return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && !(latitude === 0 && longitude === 0); }
  private shortPrice(value: number): string { return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}tr` : value >= 1_000 ? `${Math.round(value / 1_000)}k` : `${value || 0}`; }
  formatVnd(value: number): string { return value ? `Từ ${new Intl.NumberFormat('vi-VN').format(value)} ₫ / đêm` : 'Xem giá phòng'; }
}
