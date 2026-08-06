import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../auth.service';

interface Sport {
  name: string;
}

interface ResultResponse {
  id: number;
  discipline: string;
  category?: string;
  status: string;
  time: string;
  is_live: boolean;
  visible: boolean;
  home: { name: string; short_name: string; score: number | null };
  away: { name: string; short_name: string; score: number | null };
}

@Component({
  selector: 'app-result-editor-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './result-editor-page.html',
  styleUrl: './result-editor-page.scss',
})
export class ResultEditorPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  private readonly resultId = this.route.snapshot.paramMap.get('id');

  protected readonly sports = signal<Sport[]>([]);
  protected readonly selectedSport = signal('');
  protected readonly homeName = signal('');
  protected readonly homeShortName = signal('');
  protected readonly homeScore = signal<number | null>(null);
  protected readonly awayName = signal('');
  protected readonly awayShortName = signal('');
  protected readonly awayScore = signal<number | null>(null);
  protected readonly isLive = signal(false);
  protected readonly eventTime = signal('');
  protected readonly visible = signal(true);
  protected readonly loadingSports = signal(true);
  protected readonly loadingResult = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly editing = signal(Boolean(this.resultId));

  constructor() {
    this.http
      .get<Sport[]>('/api/sports')
      .pipe(finalize(() => this.loadingSports.set(false)))
      .subscribe({
        next: (sports) => {
          this.sports.set(sports);
          if (!this.selectedSport()) {
            this.selectedSport.set(sports[0]?.name ?? '');
          }
        },
        error: () => this.errorMessage.set('Nie udało się załadować listy sportów.'),
      });

    if (this.resultId) {
      this.loadingResult.set(true);
      this.http
        .get<ResultResponse>(`/api/results/${this.resultId}`, { headers: this.auth.authHeaders() })
        .pipe(finalize(() => this.loadingResult.set(false)))
        .subscribe({
          next: (result) => this.fillForm(result),
          error: () => this.errorMessage.set('Nie udało się załadować wyniku do edycji.'),
        });
    }
  }

  protected submit(): void {
    this.errorMessage.set('');
    if (!this.selectedSport() || !this.homeName().trim() || !this.awayName().trim()) {
      this.errorMessage.set('Wybierz sport i wpisz obie strony wyniku.');
      return;
    }

    this.submitting.set(true);
    const payload = {
      category: this.selectedSport(),
      home_name: this.homeName().trim(),
      home_short_name: this.homeShortName().trim(),
      home_score: this.homeScore(),
      away_name: this.awayName().trim(),
      away_short_name: this.awayShortName().trim(),
      away_score: this.awayScore(),
      is_live: this.isLive(),
      event_time: this.eventTime().trim(),
      visible: this.visible(),
    };
    const request = this.resultId
      ? this.http.put<ResultResponse>(`/api/results/${this.resultId}`, payload, { headers: this.auth.authHeaders() })
      : this.http.post<ResultResponse>('/api/results', payload, { headers: this.auth.authHeaders() });

    request
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => this.router.navigate(['/employee/results']),
        error: (error) => this.errorMessage.set(error.error?.detail ?? 'Nie udało się zapisać wyniku.'),
      });
  }

  private fillForm(result: ResultResponse): void {
    this.selectedSport.set(result.category ?? result.discipline);
    this.homeName.set(result.home.name);
    this.homeShortName.set(result.home.short_name);
    this.homeScore.set(result.home.score);
    this.awayName.set(result.away.name);
    this.awayShortName.set(result.away.short_name);
    this.awayScore.set(result.away.score);
    this.isLive.set(result.is_live || result.status === 'LIVE');
    this.visible.set(result.visible);
  }
}
