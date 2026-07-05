import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, Observable, of, tap } from 'rxjs';

interface LoginResponse {
  token: string;
  username: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storageKey = 'arena_employee_token';

  readonly username = signal<string | null>(null);
  readonly checkingSession = signal(true);

  constructor() {
    this.restoreSession();
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>('/api/auth/login', { username, password })
      .pipe(
        tap((session) => {
          localStorage.setItem(this.storageKey, session.token);
          this.username.set(session.username);
        }),
      );
  }

  logout(): void {
    const token = this.token;
    this.clearSession();
    if (token) {
      this.http
        .post<void>('/api/auth/logout', {}, { headers: this.authHeaders(token) })
        .pipe(catchError(() => of(undefined)))
        .subscribe();
    }
  }

  private restoreSession(): void {
    const token = this.token;
    if (!token) {
      this.checkingSession.set(false);
      return;
    }

    this.http
      .get<{ username: string }>('/api/auth/me', {
        headers: this.authHeaders(token),
      })
      .pipe(finalize(() => this.checkingSession.set(false)))
      .subscribe({
        next: (user) => this.username.set(user.username),
        error: () => this.clearSession(),
      });
  }

  private get token(): string | null {
    return localStorage.getItem(this.storageKey);
  }

  private authHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private clearSession(): void {
    localStorage.removeItem(this.storageKey);
    this.username.set(null);
  }
}
