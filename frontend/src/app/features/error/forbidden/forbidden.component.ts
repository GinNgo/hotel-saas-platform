import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './forbidden.component.html',
  styleUrls: ['./forbidden.component.css']
})
export class ForbiddenComponent {

  constructor(private router: Router, private authService: AuthService) {}

  returnToDashboard() {
    this.router.navigate(['/']);
  }

  goBack() {
    window.history.back();
  }

  logout() {
    this.authService.logout();
    localStorage.removeItem('permissions');
    this.router.navigate(['/login']);
  }
}
