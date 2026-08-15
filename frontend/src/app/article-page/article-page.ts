import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AuthService } from '../auth.service';
import { exactPublishedAt } from '../date-format';
import { XEmbed } from '../x-embed/x-embed';

interface Article {
  id: number;
  category: string;
  subcategory: string | null;
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
  type: 'text' | 'image' | 'embed';
  content?: string;
  src?: string;
  alt?: string;
  provider?: string;
  url?: string;
}

interface EmbedView {
  kind: 'youtube' | 'social' | 'generic';
  provider: string;
  url: string;
  text?: string;
  iframeUrl?: SafeResourceUrl;
}

@Component({
  selector: 'app-article-page',
  imports: [CommonModule, RouterLink, XEmbed],
  templateUrl: './article-page.html',
  styleUrl: './article-page.scss',
})
export class ArticlePage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);
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

  protected embedView(block: ArticleBlock): EmbedView {
    const raw = (block.content || block.url || '').trim();
    const provider = block.provider ?? 'Post';
    const url = this.extractUrl(raw);
    const youtubeId = this.youtubeId(url || raw);
    if (youtubeId) {
      return {
        kind: 'youtube',
        provider: 'YouTube',
        url: url || raw,
        iframeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube.com/embed/${youtubeId}`),
      };
    }

    if (this.isSocialEmbed(provider, raw)) {
      return {
        kind: 'social',
        provider,
        url: url || this.extractUrl(raw),
        text: raw,
      };
    }

    return {
      kind: 'generic',
      provider,
      url: url || raw,
      text: this.plainText(raw) || 'Osadzony post',
    };
  }

  private youtubeId(value: string): string | null {
    return value.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/)?.[1] ?? null;
  }

  private isSocialEmbed(provider: string, raw: string): boolean {
    const normalizedProvider = provider.toLowerCase();
    const normalizedRaw = raw.toLowerCase();

    return (
      normalizedProvider.includes('twitter') ||
      normalizedProvider === 'x' ||
      normalizedProvider.includes('x /') ||
      normalizedProvider.includes('facebook') ||
      normalizedProvider.includes('instagram') ||
      normalizedRaw.includes('twitter-tweet') ||
      normalizedRaw.includes('instagram-media') ||
      normalizedRaw.includes('fb-post') ||
      normalizedRaw.includes('fb-video') ||
      /(?:x|twitter)\.com\//.test(normalizedRaw) ||
      /(?:facebook\.com|fb\.watch)\//.test(normalizedRaw) ||
      /instagram\.com\//.test(normalizedRaw)
    );
  }

  private extractUrl(value: string): string {
    return value.match(/https?:\/\/[^"'<>\s]+/)?.[0] ?? '';
  }

  private plainText(value: string): string {
    return this.decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }

  private decodeHtml(value: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
  }
}
