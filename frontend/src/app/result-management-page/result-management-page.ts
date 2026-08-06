import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../auth.service';

interface Team {
  name: string;
  short_name: string;
  score: number | null;
}

interface Result {
  id: number;
  discipline: string;
  category?: string;
  status: string;
  time: string;
  is_live: boolean;
  visible: boolean;
  home: Team;
  away: Team;
}

interface ResultSetting {
  category: string;
  visible_limit: number;
}

@Component({
  selector: 'app-result-management-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './result-management-page.html',
  styleUrl: './result-management-page.scss',
})
export class ResultManagementPage {
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(AuthService);

  protected readonly results = signal<Result[]>([]);
  protected readonly settings = signal<ResultSetting[]>([]);
  protected readonly loading = signal(true);
  protected readonly busyId = signal<number | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly visibleCount = computed(() => this.results().filter((result) => result.visible).length);

  constructor() {
    this.loadData();
  }

  protected loadData(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.http.get<Result[]>('/api/employee/results', { headers: this.auth.authHeaders() }).subscribe({
      next: (results) => this.results.set(results),
      error: () => this.errorMessage.set('Nie udało się załadować wyników.'),
    });
    this.http
      .get<ResultSetting[]>('/api/result-settings', { headers: this.auth.authHeaders() })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (settings) => this.settings.set(settings),
        error: () => this.errorMessage.set('Nie udało się załadować ustawień wyników.'),
      });
  }

  protected updateLimit(setting: ResultSetting, value: string | number): void {
    const visibleLimit = Math.max(0, Math.min(20, Number(value) || 0));
    this.http
      .put<ResultSetting>(
        '/api/result-settings',
        { category: setting.category, visible_limit: visibleLimit },
        { headers: this.auth.authHeaders() },
      )
      .subscribe({
        next: (updated) => this.settings.update((items) => items.map((item) => item.category === updated.category ? updated : item)),
        error: () => this.errorMessage.set('Nie udało się zapisać limitu wyników.'),
      });
  }

  protected settingLabel(setting: ResultSetting): string {
    return setting.category === '__home__' ? 'Strona główna' : setting.category;
  }

  protected toggleStatus(result: Result): void {
    this.busyId.set(result.id);
    this.http
      .patch<Result>(`/api/results/${result.id}/status`, {}, { headers: this.auth.authHeaders() })
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: (updated) => this.results.update((items) => items.map((item) => item.id === updated.id ? updated : item)),
        error: () => this.errorMessage.set('Nie udało się zmienić statusu wyniku.'),
      });
  }

  protected toggleVisible(result: Result): void {
    this.busyId.set(result.id);
    this.http
      .patch<Result>(
        `/api/results/${result.id}/visibility`,
        { visible: !result.visible },
        { headers: this.auth.authHeaders() },
      )
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: (updated) => this.results.update((items) => items.map((item) => item.id === updated.id ? updated : item)),
        error: () => this.errorMessage.set('Nie udało się zmienić widoczności wyniku.'),
      });
  }

  protected deleteResult(result: Result): void {
    if (!confirm(`Usunąć wynik ${result.home.name} - ${result.away.name}?`)) return;
    this.busyId.set(result.id);
    this.http
      .delete<void>(`/api/results/${result.id}`, { headers: this.auth.authHeaders() })
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: () => this.results.update((items) => items.filter((item) => item.id !== result.id)),
        error: () => this.errorMessage.set('Nie udało się usunąć wyniku.'),
      });
  }
}
