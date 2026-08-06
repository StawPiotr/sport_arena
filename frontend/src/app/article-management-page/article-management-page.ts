import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../auth.service';
import { exactPublishedAt } from '../date-format';

interface Article {
  id: number;
  category: string;
  title: string;
  excerpt: string;
  published_at: string;
  reading_time: number;
  featured: boolean;
  category_featured: boolean;
  hidden: boolean;
  author: string;
}

@Component({
  selector: 'app-article-management-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './article-management-page.html',
  styleUrl: './article-management-page.scss',
})
export class ArticleManagementPage {
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(AuthService);

  protected readonly articles = signal<Article[]>([]);
  protected readonly loading = signal(true);
  protected readonly busyId = signal<number | null>(null);
  protected readonly errorMessage = signal('');
  protected readonly visibleCount = computed(() => this.articles().filter((article) => !article.hidden).length);

  constructor() {
    this.loadArticles();
  }

  protected loadArticles(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.http
      .get<Article[]>('/api/employee/articles', { headers: this.auth.authHeaders() })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (articles) => this.articles.set(articles),
        error: () => this.errorMessage.set('Nie udało się załadować artykułów.'),
      });
  }

  protected toggleHidden(article: Article): void {
    this.busyId.set(article.id);
    this.http
      .patch<Article>(
        `/api/articles/${article.id}/visibility`,
        { hidden: !article.hidden },
        { headers: this.auth.authHeaders() },
      )
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: (updated) => this.replaceArticle(updated),
        error: () => this.errorMessage.set('Nie udało się zmienić widoczności artykułu.'),
      });
  }

  protected setFeatured(article: Article, scope: 'home' | 'category'): void {
    this.busyId.set(article.id);
    this.http
      .patch<Article>(
        `/api/articles/${article.id}/featured`,
        { scope },
        { headers: this.auth.authHeaders() },
      )
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: () => this.loadArticles(),
        error: () => this.errorMessage.set('Nie udało się ustawić artykułu jako głównego.'),
      });
  }

  protected deleteArticle(article: Article): void {
    if (!confirm(`Usunąć artykuł „${article.title}”? Tej akcji nie da się cofnąć.`)) {
      return;
    }

    this.busyId.set(article.id);
    this.http
      .delete<void>(`/api/articles/${article.id}`, { headers: this.auth.authHeaders() })
      .pipe(finalize(() => this.busyId.set(null)))
      .subscribe({
        next: () => this.articles.update((articles) => articles.filter((item) => item.id !== article.id)),
        error: () => this.errorMessage.set('Nie udało się usunąć artykułu.'),
      });
  }

  protected dateLabel(value: string): string {
    return exactPublishedAt(value);
  }

  private replaceArticle(updated: Article): void {
    this.articles.update((articles) =>
      articles.map((article) => article.id === updated.id ? updated : article),
    );
  }
}
