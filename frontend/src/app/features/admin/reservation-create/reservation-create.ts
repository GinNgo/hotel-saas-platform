import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { OperationalQuote, Reservation, ReservationService } from '../../../core/services/reservation.service';
import { AdminInventoryService, AdminRoom } from '../../../core/services/admin-inventory.service';

@Component({
  selector: 'app-reservation-create',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePickerModule, SelectModule, ButtonModule, InputTextModule, TextareaModule, InputNumberModule],
  templateUrl: './reservation-create.html',
  styleUrl: './reservation-create.css'
})
export class ReservationCreate implements OnInit {
  reservation: Partial<Reservation> = { paymentMethod: 'CASH', guests: 1, adults: 1, children: 0, details: [] };
  rooms: AdminRoom[] = [];
  selectedRoomId?: string | number;
  minCheckInDate = this.startOfToday();
  minCheckOutDate?: Date;
  saving = false;
  loadingRooms = false;
  quote?: OperationalQuote;
  loadingQuote = false;
  quoteError = '';
  private createRequestKey = this.newRequestKey();
  private availabilityRequestVersion = 0;
  private quoteRequestVersion = 0;

  paymentMethods = [
    { label: 'Tiền mặt', value: 'CASH' },
    { label: 'Thẻ tín dụng', value: 'CREDIT_CARD' },
    { label: 'Chuyển khoản', value: 'BANK_TRANSFER' }
  ];

  private reservationService = inject(ReservationService);
  private inventoryService = inject(AdminInventoryService);
  private router = inject(Router);
  private messageService = inject(MessageService);

  ngOnInit() {
    this.inventoryService.getRooms().subscribe((data: AdminRoom[]) => {
      this.rooms = data.filter((room: AdminRoom) => room.status === 'AVAILABLE');
    });
  }

  onCheckInChange(value: Date | string | null | undefined) {
    if (!value) {
      this.reservation.checkOutDate = undefined;
      this.minCheckOutDate = undefined;
      return;
    }
    const nextDay = this.addDays(new Date(value), 1);
    this.minCheckOutDate = nextDay;
    if (!this.reservation.checkOutDate || new Date(this.reservation.checkOutDate) < nextDay) {
      this.reservation.checkOutDate = nextDay as unknown as string;
    }
    this.refreshAvailableRooms();
  }

  onCheckOutChange(): void { this.refreshAvailableRooms(); }
  onRoomOrGuestsChange(): void {
    this.reservation.guests = Math.max(1, this.reservation.adults || 1) + Math.max(0, this.reservation.children || 0);
    this.refreshQuote();
  }

  get formValid(): boolean {
    if (!this.reservation.guestFullName?.trim() || !this.reservation.guestPhoneNumber?.trim() || !this.selectedRoomId ||
        !this.reservation.checkInDate || !this.reservation.checkOutDate) return false;
    if ((this.reservation.adults || 0) < 1 || (this.reservation.children || 0) < 0) return false;
    return new Date(this.reservation.checkOutDate) > new Date(this.reservation.checkInDate);
  }

  save() {
    if (!this.formValid) {
      this.messageService.add({ severity: 'warn', summary: 'Cảnh báo', detail: 'Vui lòng điền đầy đủ thông tin bắt buộc.' });
      return;
    }

    const selectedRoom = this.rooms.find(room => room.id === this.selectedRoomId);
    if (!selectedRoom?.roomTypeId) {
      this.messageService.add({ severity: 'error', summary: 'Không thể đặt phòng', detail: 'Phòng chưa có loại phòng hợp lệ.' });
      return;
    }

    const request: Reservation = {
      ...(this.reservation as Reservation),
      userId: null,
      roomId: selectedRoom.id,
      roomTypeId: selectedRoom.roomTypeId,
      expectedTotal: this.quote!.finalTotal,
      quantity: 1,
      details: [{ roomId: selectedRoom.id }],
      checkInDate: this.toLocalDate(new Date(this.reservation.checkInDate!)),
      checkOutDate: this.toLocalDate(new Date(this.reservation.checkOutDate!))
    };

    this.saving = true;
    this.reservationService.createReservation(request, this.createRequestKey).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Tạo đặt phòng thành công.' });
        this.router.navigate([this.returnRoute]);
      },
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        if (error.error?.code === 'PRICE_CHANGED') this.refreshQuote();
        const detail = error.error?.message || error.error?.detail || 'Không thể tạo đặt phòng. Vui lòng kiểm tra lại thông tin.';
        this.messageService.add({ severity: 'error', summary: 'Tạo đặt phòng thất bại', detail });
      }
    });
  }

  cancel() {
    this.router.navigate([this.returnRoute]);
  }

  private refreshAvailableRooms(): void {
    const requestVersion = ++this.availabilityRequestVersion;
    if (!this.reservation.checkInDate || !this.reservation.checkOutDate ||
        new Date(this.reservation.checkOutDate) <= new Date(this.reservation.checkInDate)) {
      this.loadingRooms = false;
      this.refreshQuote();
      return;
    }
    const checkIn = this.toLocalDate(new Date(this.reservation.checkInDate));
    const checkOut = this.toLocalDate(new Date(this.reservation.checkOutDate));
    this.loadingRooms = true;
    this.inventoryService.getAvailableRooms(checkIn, checkOut).subscribe({
      next: (rooms) => {
        if (requestVersion !== this.availabilityRequestVersion) return;
        this.rooms = rooms;
        if (this.selectedRoomId && !rooms.some(room => room.id === this.selectedRoomId)) this.selectedRoomId = undefined;
        this.loadingRooms = false;
        this.refreshQuote();
      },
      error: () => {
        if (requestVersion !== this.availabilityRequestVersion) return;
        this.loadingRooms = false;
        this.messageService.add({ severity: 'error', summary: 'Không thể kiểm tra phòng', detail: 'Vui lòng thử tải lại danh sách phòng khả dụng.' });
      }
    });
  }

  private refreshQuote(): void {
    const requestVersion = ++this.quoteRequestVersion;
    this.quote = undefined;
    this.quoteError = '';
    if (!this.selectedRoomId || !this.reservation.checkInDate || !this.reservation.checkOutDate) {
      this.loadingQuote = false;
      return;
    }
    const checkIn = this.toLocalDate(new Date(this.reservation.checkInDate));
    const checkOut = this.toLocalDate(new Date(this.reservation.checkOutDate));
    if (checkOut <= checkIn) { this.loadingQuote = false; return; }
    this.loadingQuote = true;
    this.reservationService.getOperationalQuote(this.selectedRoomId, checkIn, checkOut,
      this.reservation.adults || 1, this.reservation.children || 0).subscribe({
      next: (quote) => {
        if (requestVersion !== this.quoteRequestVersion) return;
        this.quote = quote;
        this.loadingQuote = false;
      },
      error: (error: HttpErrorResponse) => {
        if (requestVersion !== this.quoteRequestVersion) return;
        this.loadingQuote = false;
        this.quoteError = error.error?.message || 'Không thể tính báo giá lúc này.';
      }
    });
  }

  private get returnRoute(): string { return this.router.url.startsWith('/management/') ? '/management/front-desk' : '/admin/reservations'; }

  private startOfToday(): Date {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  private addDays(value: Date, days: number): Date {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
  }

  private toLocalDate(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private newRequestKey(): string {
    return globalThis.crypto?.randomUUID?.() ?? `walk-in-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
