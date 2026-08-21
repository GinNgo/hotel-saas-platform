import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionCode, FunctionCode, PermissionService } from '../../../core/services/permission.service';
import { ClaimId, ClaimStatus, PropertyClaimReview, PropertyClaimReviewService } from '../../../core/services/property-claim-review.service';

@Component({
  selector: 'app-property-claims', standalone: true, imports: [CommonModule, FormsModule],
  template: `
    <main class="page">
      <header><div><span class="eyebrow">TRUST & SAFETY</span><h1>Xác minh chủ sở hữu</h1><p>Duyệt minh chứng trước khi trao quyền vận hành cơ sở lưu trú.</p></div><span class="count">{{ claims.length }} hồ sơ</span></header>
      <nav class="filters" aria-label="Lọc trạng thái"><button *ngFor="let item of filters" type="button" [class.active]="filter === item.value" (click)="setFilter(item.value)">{{ item.label }}</button></nav>
      <section *ngIf="loading" class="state" aria-live="polite"><span class="spinner"></span><b>Đang tải hồ sơ...</b></section>
      <section *ngIf="!loading && error" class="state" role="alert"><b>Chưa thể tải danh sách</b><p>{{ error }}</p><button type="button" (click)="loadClaims()">Thử lại</button></section>
      <section *ngIf="!loading && !error && !claims.length" class="state"><span class="empty">✓</span><b>Không có hồ sơ phù hợp</b><p>Các yêu cầu mới sẽ xuất hiện tại đây.</p></section>
      <section *ngIf="!loading && !error && claims.length" class="list">
        <article *ngFor="let claim of claims" class="card">
          <div class="identity"><div class="mark">{{ initials(claim.property?.name) }}</div><div><h2>{{ claim.property?.name || 'Cơ sở chưa đặt tên' }}</h2><p>{{ claim.property?.code || claim.property?.tenantId || claim.property?.id }}</p></div><span class="status" [attr.data-status]="claim.status">{{ statusLabel(claim.status) }}</span></div>
          <div class="details"><div><small>Người yêu cầu</small><strong>{{ claim.requesterUser?.fullName || claim.requesterUser?.username }}</strong><span>{{ claim.requesterUser?.email }}</span></div><div><small>Phương thức xác minh</small><strong>{{ methodLabel(claim.verificationMethod) }}</strong><span>{{ claim.verificationData }}</span></div><div><small>Ngày gửi</small><strong>{{ claim.createdAt ? (claim.createdAt | date:'dd/MM/yyyy, HH:mm') : 'Chưa ghi nhận' }}</strong><span *ngIf="claim.note">{{ claim.note }}</span></div></div>
          <p *ngIf="claim.rejectionReason" class="reason"><b>Lý do từ chối:</b> {{ claim.rejectionReason }}</p>
          <div *ngIf="claim.status === 'PENDING' && canApprove" class="actions">
            <ng-container *ngIf="activeId !== claim.id"><button class="reject" type="button" (click)="openReject(claim.id)">Từ chối</button><button class="approve" type="button" (click)="openApprove(claim.id)">Duyệt & trao quyền</button></ng-container>
            <div *ngIf="activeId === claim.id && mode === 'approve'" class="decision"><div><b>Xác nhận trao quyền Owner?</b><p>Người dùng phải đăng nhập lại để nhận quyền mới.</p></div><button type="button" (click)="cancelDecision()">Hủy</button><button class="approve" type="button" [disabled]="busy" (click)="confirmApprove(claim.id)">{{ busy ? 'Đang xử lý...' : 'Xác nhận duyệt' }}</button></div>
            <div *ngIf="activeId === claim.id && mode === 'reject'" class="decision reject-form"><label for="reason-{{claim.id}}"><b>Lý do từ chối</b><span>Cho đối tác biết thông tin cần bổ sung.</span></label><textarea id="reason-{{claim.id}}" [(ngModel)]="rejectionReason" maxlength="1000" rows="3" placeholder="Nhập ít nhất 3 ký tự"></textarea><small [class.invalid]="rejectionReason.trim().length > 0 && rejectionReason.trim().length < 3">{{ rejectionReason.length }}/1000 ký tự</small><div><button type="button" (click)="cancelDecision()">Hủy</button><button class="reject" type="button" [disabled]="busy || rejectionReason.trim().length < 3" (click)="confirmReject(claim.id)">{{ busy ? 'Đang xử lý...' : 'Xác nhận từ chối' }}</button></div></div>
          </div>
        </article>
      </section>
    </main>`,
  styles: [`
    :host{display:block;color:#17352d}.page{max-width:1180px;margin:auto;padding:32px 24px 64px}header{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:24px}.eyebrow{color:#d45b35;font-weight:800;letter-spacing:.16em;font-size:12px}h1{font-family:Georgia,serif;font-size:clamp(32px,5vw,52px);margin:7px 0 8px}header p{margin:0;color:#65756f}.count{background:#e8f1ed;border-radius:999px;padding:10px 16px;font-weight:700}.filters{display:flex;gap:8px;overflow:auto;padding-bottom:14px}.filters button,.actions button,.state button,.decision button{min-height:44px;border:1px solid #cad8d2;background:white;border-radius:12px;padding:0 16px;font-weight:700;color:inherit}.filters button.active{background:#17352d;color:white}.list{display:grid;gap:16px}.card{background:linear-gradient(135deg,#fff 70%,#f3f7f4);border:1px solid #dce6e1;border-radius:20px;padding:22px;box-shadow:0 10px 35px rgba(23,53,45,.06)}.identity{display:flex;align-items:center;gap:14px}.mark{width:48px;height:48px;display:grid;place-items:center;border-radius:14px;background:#f3c8a9;font:800 20px Georgia,serif}.identity h2{margin:0;font:700 21px Georgia,serif}.identity p{margin:4px 0 0;color:#75837e}.status{margin-left:auto;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:800}.status[data-status=PENDING]{background:#fff0c7;color:#805b00}.status[data-status=APPROVED]{background:#dff3e8;color:#14623d}.status[data-status=REJECTED]{background:#fee3df;color:#9c3328}.details{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;border-top:1px solid #e5ece8;margin-top:18px;padding-top:18px}.details div{display:flex;flex-direction:column;gap:4px;min-width:0}.details small,.details span{color:#71807a;overflow-wrap:anywhere}.reason{background:#fff1ee;padding:12px;border-radius:10px}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.actions .approve{background:#17352d;color:#fff}.actions .reject{color:#a33b2d;border-color:#e5b4ac}.decision{width:100%;display:flex;align-items:center;justify-content:flex-end;gap:10px;background:#f3f7f4;padding:14px;border-radius:14px}.decision>div:first-child{margin-right:auto}.decision p{margin:4px 0;color:#66756f}.reject-form{display:grid;grid-template-columns:1fr auto;align-items:end}.reject-form label,.reject-form textarea{grid-column:1/-1}.reject-form label{display:flex;flex-direction:column;gap:3px}.reject-form label span{color:#66756f}.reject-form textarea{border:1px solid #b9cbc3;border-radius:10px;padding:12px;font:inherit;resize:vertical}.invalid{color:#a33b2d}.state{min-height:260px;display:grid;place-content:center;text-align:center;gap:8px;background:#f6f9f7;border:1px dashed #c9d7d1;border-radius:20px}.state p{margin:0;color:#6b7974}.state button{justify-self:center}.empty{font-size:30px}.spinner{width:30px;height:30px;border:3px solid #d8e4df;border-top-color:#d45b35;border-radius:50%;animation:spin .8s linear infinite;justify-self:center}@keyframes spin{to{transform:rotate(360deg)}}button:focus-visible,textarea:focus-visible{outline:3px solid #ef9d70;outline-offset:2px}button:disabled{opacity:.55}@media(max-width:700px){.page{padding:22px 14px 50px}header{align-items:flex-start}.count{display:none}.details{grid-template-columns:1fr}.identity{align-items:flex-start}.status{font-size:10px}.actions,.decision{flex-wrap:wrap}.actions>button{flex:1}.decision>div:first-child{width:100%}.reject-form{display:flex;align-items:stretch;flex-direction:column}.reject-form div{display:flex;gap:8px}.reject-form div button{flex:1}}
  `]
})
export class PropertyClaimsComponent implements OnInit {
  private readonly permissions = inject(PermissionService);
  claims: PropertyClaimReview[] = []; loading = true; error = ''; filter: ClaimStatus | 'ALL' = 'PENDING';
  activeId: ClaimId | null = null; mode: 'approve' | 'reject' | null = null; rejectionReason = ''; busy = false;
  readonly canApprove = this.permissions.hasPermission(FunctionCode.PROPERTY_CLAIM, ActionCode.APPROVE);
  readonly filters: { value: ClaimStatus | 'ALL'; label: string }[] = [{value:'PENDING',label:'Chờ duyệt'},{value:'APPROVED',label:'Đã duyệt'},{value:'REJECTED',label:'Đã từ chối'},{value:'ALL',label:'Tất cả'}];
  constructor(private readonly reviews: PropertyClaimReviewService) {}
  ngOnInit(): void { this.loadClaims(); }
  loadClaims(): void { this.loading=true;this.error='';this.reviews.list(this.filter).subscribe({next:r=>{this.claims=r.content || [];this.loading=false;},error:e=>{this.error=e?.error?.message || 'Vui lòng kiểm tra kết nối và thử lại.';this.loading=false;}}); }
  setFilter(value: ClaimStatus | 'ALL'): void { this.filter=value;this.cancelDecision();this.loadClaims(); }
  openApprove(id: ClaimId): void { this.activeId=id;this.mode='approve';this.rejectionReason=''; }
  openReject(id: ClaimId): void { this.activeId=id;this.mode='reject';this.rejectionReason=''; }
  cancelDecision(): void { this.activeId=null;this.mode=null;this.rejectionReason=''; }
  confirmApprove(id: ClaimId): void { this.busy=true;this.reviews.approve(id).subscribe({next:()=>this.afterDecision(),error:e=>this.failDecision(e)}); }
  confirmReject(id: ClaimId): void { const reason=this.rejectionReason.trim();if(reason.length<3)return;this.busy=true;this.reviews.reject(id,reason).subscribe({next:()=>this.afterDecision(),error:e=>this.failDecision(e)}); }
  private afterDecision(): void { this.busy=false;this.cancelDecision();this.loadClaims(); }
  private failDecision(error: any): void { this.busy=false;this.error=error?.error?.message || 'Không thể xử lý yêu cầu. Vui lòng thử lại.'; }
  initials(name?: string | null): string { return (name || 'KS').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(); }
  statusLabel(status: ClaimStatus): string { return ({PENDING:'Chờ duyệt',APPROVED:'Đã duyệt',REJECTED:'Đã từ chối'} as const)[status]; }
  methodLabel(method: string | null): string { return ({BUSINESS_LICENSE:'Giấy phép kinh doanh',DOMAIN_EMAIL:'Email tên miền',PHONE:'Số điện thoại',OTHER:'Tài liệu khác'} as Record<string,string>)[method || ''] || method || 'Chưa xác định'; }
}
