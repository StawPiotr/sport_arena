import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AuthService } from '../auth.service';
import { exactPublishedAt } from '../date-format';

interface Article {
  id: number;
  category: string;
  title: string;
  excerpt: string;
  published_at: string;
  reading_time: number;
  accent: string;
  author: string;
  image_url: string | null;
  image_alt: string | null;
  content: string[];
  blocks: ArticleBlock[];
  quote: string | null;
}

interface ArticleBlock {
  type: 'text' | 'image';
  content?: string;
  src?: string;
  alt?: string;
}

@Component({
  selector: 'app-article-page',
  imports: [CommonModule, RouterLink],
  templateUrl: './article-page.html',
  styleUrl: './article-page.scss',
})
export class ArticlePage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);

  protected readonly article = signal<Article | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          this.loading.set(true);
          this.notFound.set(false);
          return this.http.get<Article>(`/api/articles/${params.get('id')}`);
        }),
      )
      .subscribe({
        next: (article) => {
          this.article.set(article);
          this.loading.set(false);
        },
        error: () => {
          this.article.set(null);
          this.notFound.set(true);
          this.loading.set(false);
        },
      });
  }

  protected exactDate(value: string): string {
    return exactPublishedAt(value);
  }
}
