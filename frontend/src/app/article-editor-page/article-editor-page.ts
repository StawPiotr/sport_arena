import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../auth.service';

interface Sport {
  name: string;
  accent: string;
}

interface ArticleBlock {
  type: 'text' | 'image' | 'embed';
  content?: string;
  src?: string;
  alt?: string;
  provider?: string;
  url?: string;
}

interface CreatedArticle {
  id: number;
}

interface EditableArticle {
  id: number;
  category: string;
  title: string;
  excerpt: string;
  published_at: string;
  content: string[];
  blocks: ArticleBlock[];
}

@Component({
  selector: 'app-article-editor-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './article-editor-page.html',
  styleUrl: './article-editor-page.scss',
})
export class ArticleEditorPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  private readonly articleId = this.route.snapshot.paramMap.get('id');

  protected readonly sports = signal<Sport[]>([]);
  protected readonly selectedSport = signal('');
  protected readonly title = signal('');
  protected readonly excerpt = signal('');
  protected readonly publishLater = signal(false);
  protected readonly publishedAt = signal('');
  protected readonly blocks = signal<ArticleBlock[]>([
    { type: 'text', content: '' },
  ]);
  protected readonly loadingSports = signal(true);
  protected readonly loadingArticle = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly editing = signal(Boolean(this.articleId));
  protected readonly textColor = signal('#dfff3f');
  protected readonly suggestedColors = [
    '#dfff3f',
    '#ffffff',
    '#b8c0bd',
    '#ff7a45',
    '#ff6259',
    '#66d9ff',
    '#b48cff',
    '#50e3a4',
  ];
  private savedSelection: Range | null = null;

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

    if (this.articleId) {
      this.loadingArticle.set(true);
      this.http
        .get<EditableArticle>(`/api/articles/${this.articleId}`)
        .pipe(finalize(() => this.loadingArticle.set(false)))
        .subscribe({
          next: (article) => this.fillForm(article),
          error: () => this.errorMessage.set('Nie udało się załadować artykułu do edycji.'),
        });
    }
  }

  protected addTextBlock(): void {
    this.blocks.update((blocks) => [...blocks, { type: 'text', content: '' }]);
  }

  protected addImageBlock(): void {
    this.blocks.update((blocks) => [...blocks, { type: 'image', src: '', alt: '' }]);
  }

  protected addEmbedBlock(): void {
    this.blocks.update((blocks) => [...blocks, { type: 'embed', provider: 'X / Twitter', url: '' }]);
  }

  protected formatText(command: string, value?: string): void {
    this.restoreSelection();
    document.execCommand(command, false, value);
    this.rememberSelection();
  }

  protected applyTextColor(color = this.textColor()): void {
    const normalized = this.normalizeHexColor(color);
    this.textColor.set(normalized);
    this.formatText('foreColor', normalized);
  }

  protected rememberSelection(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container.nodeType === Node.ELEMENT_NODE
      ? container as Element
      : container.parentElement;
    if (element?.closest('.rich-editor')) {
      this.savedSelection = range.cloneRange();
    }
  }

  protected setTextColor(value: string): void {
    this.textColor.set(this.normalizeHexColor(value));
  }

  protected updateTextBlock(index: number, event: Event): void {
    this.updateBlock(index, { content: (event.target as HTMLElement).innerHTML });
  }

  protected blockLabel(block: ArticleBlock): string {
    if (block.type === 'text') return 'Blok tekstowy';
    if (block.type === 'image') return 'Blok zdjęcia';
    return 'Osadzony post';
  }

  protected updateBlock(index: number, patch: Partial<ArticleBlock>): void {
    this.blocks.update((blocks) =>
      blocks.map((block, currentIndex) =>
        currentIndex === index ? { ...block, ...patch } : block,
      ),
    );
  }

  protected removeBlock(index: number): void {
    this.blocks.update((blocks) => blocks.filter((_, currentIndex) => currentIndex !== index));
  }

  protected moveBlock(index: number, direction: -1 | 1): void {
    const target = index + direction;
    const blocks = [...this.blocks()];
    if (target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    this.blocks.set(blocks);
  }

  protected selectImage(index: number, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.updateBlock(index, {
        src: String(reader.result),
        alt: this.blocks()[index]?.alt || file.name,
      });
    };
    reader.readAsDataURL(file);
  }

  protected submit(): void {
    (document.activeElement as HTMLElement | null)?.blur();
    this.errorMessage.set('');

    const title = this.title().trim();
    const excerpt = this.excerpt().trim();

    if (!title || !excerpt || !this.selectedSport()) {
      this.errorMessage.set('Uzupełnij tytuł, skrót i sport.');
      return;
    }
    if (title.length < 3) {
      this.errorMessage.set('Tytuł musi mieć przynajmniej 3 znaki.');
      return;
    }
    if (excerpt.length < 10) {
      this.errorMessage.set('Skrót artykułu musi mieć przynajmniej 10 znaków.');
      return;
    }
    if (this.publishLater() && this.publishedAt() && Number.isNaN(new Date(this.publishedAt()).getTime())) {
      this.errorMessage.set('Wybierz poprawną datę i godzinę publikacji.');
      return;
    }

    const payloadBlocks = this.blocks()
      .map((block) => {
        if (block.type === 'text') {
          return { type: 'text' as const, content: (block.content ?? '').trim() };
        }
        if (block.type === 'embed') {
          return {
            type: 'embed' as const,
            provider: (block.provider ?? 'Post').trim(),
            url: (block.url ?? '').trim(),
            content: (block.content ?? '').trim(),
          };
        }
        return {
          type: 'image' as const,
          src: (block.src ?? '').trim(),
          alt: (block.alt ?? title).trim(),
        };
      })
      .filter((block) => {
        if (block.type === 'text') return block.content;
        if (block.type === 'embed') return block.content || block.url;
        return block.src;
      });

    if (!payloadBlocks.some((block) => block.type === 'text')) {
      this.errorMessage.set('Dodaj przynajmniej jeden blok tekstowy.');
      return;
    }

    this.submitting.set(true);
    const payload = {
      category: this.selectedSport(),
      title,
      excerpt,
      published_at: this.publishLater() && this.publishedAt()
        ? new Date(this.publishedAt()).toISOString()
        : null,
      blocks: payloadBlocks,
    };
    const request = this.articleId
      ? this.http.put<CreatedArticle>(`/api/articles/${this.articleId}`, payload, { headers: this.auth.authHeaders() })
      : this.http.post<CreatedArticle>('/api/articles', payload, { headers: this.auth.authHeaders() });

    request
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (article) => this.router.navigate(['/artykul', article.id]),
        error: (error) => {
          this.errorMessage.set(
            error.status === 401
              ? 'Sesja wygasła. Zaloguj się ponownie.'
              : this.apiErrorMessage(error),
          );
        },
      });
  }

  private fillForm(article: EditableArticle): void {
    this.selectedSport.set(article.category);
    this.title.set(article.title);
    this.excerpt.set(article.excerpt);
    this.publishLater.set(true);
    this.publishedAt.set(this.toLocalInputDate(article.published_at));

    const blocks = article.blocks?.length
      ? article.blocks
      : article.content.map((paragraph) => ({ type: 'text' as const, content: paragraph }));
    this.blocks.set(blocks.length ? blocks : [{ type: 'text', content: '' }]);
  }

  private toLocalInputDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  private normalizeHexColor(value: string): string {
    const color = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    if (/^[0-9a-fA-F]{6}$/.test(color)) return `#${color}`;
    return '#dfff3f';
  }

  private restoreSelection(): void {
    if (!this.savedSelection) return;
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(this.savedSelection);
  }

  private apiErrorMessage(error: unknown): string {
    const fallback = 'Nie udało się zapisać artykułu.';
    if (!error || typeof error !== 'object') return fallback;

    const detail = (error as { error?: { detail?: unknown } }).error?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'msg' in item) {
            return String((item as { msg: unknown }).msg);
          }
          return '';
        })
        .filter(Boolean);
      return messages.length ? messages.join(' ') : fallback;
    }

    return fallback;
  }
}
