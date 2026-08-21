import { Directive, Input, TemplateRef, ViewContainerRef, inject } from '@angular/core';
import { PermissionService, ActionCode } from '../../core/services/permission.service';

@Directive({
  selector: '[hasPermission]',
  standalone: true
})
export class PermissionDirective {
  private permissionService = inject(PermissionService);
  private templateRef = inject(TemplateRef);
  private viewContainer = inject(ViewContainerRef);

  private hasView = false;

  @Input() set hasPermission(permission: string) {
    if (!permission) {
      this.clearView();
      return;
    }

    const parts = permission.split('_');
    if (parts.length < 2) {
      this.clearView();
      return;
    }

    // Extract Function and Action from string like 'ROOM_VIEW'
    const actionStr = parts.pop() as string;
    const functionCode = parts.join('_');

    const actionCode = ActionCode[actionStr as keyof typeof ActionCode];

    if (actionCode === undefined) {
      this.clearView();
      return;
    }

    if (this.permissionService.hasPermission(functionCode, actionCode)) {
      if (!this.hasView) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.hasView = true;
      }
    } else {
      this.clearView();
    }
  }

  private clearView() {
    if (this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
