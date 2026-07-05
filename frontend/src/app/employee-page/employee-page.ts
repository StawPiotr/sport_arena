import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../auth.service';

@Component({
  selector: 'app-employee-page',
  imports: [FormsModule, RouterLink],
  templateUrl: './employee-page.html',
  styleUrl: './employee-page.scss',
})
export class EmployeePage {
  protected readonly auth = inject(AuthService);
  protected readonly login = signal('');
  protected readonly password = signal('');
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly passwordVisible = signal(false);

  protected submit(): void {
    if (!this.login().trim() || !this.password()) {
      this.errorMessage.set('Wpisz login i hasło.');
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set('');
    this.auth
      .login(this.login().trim(), this.password())
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => this.password.set(''),
        error: (error) => {
          this.errorMessage.set(
            error.status === 401
              ? 'Nieprawidłowy login lub hasło.'
              : 'Nie udało się połączyć z serwerem.',
          );
        },
      });
  }
}
