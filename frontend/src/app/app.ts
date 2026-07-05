import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly routedPage = signal(this.router.url !== '/');
  protected readonly menuOpen = signal(false);
  protected readonly searchOpen = signal(false);
  protected readonly searchPhrase = signal('');
  protected readonly selectedCategory = signal('Wszystkie');
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly articles = signal<Article[]>([]);
  protected readonly matches = signal<Match[]>([]);
  protected readonly standings = signal<Standing[]>([]);
  protected readonly categories = ['Wszystkie', 'Piłka nożna', 'Tenis', 'Formuła 1', 'Siatkówka', 'Kolarstwo'];

  protected readonly filteredArticles = computed(() => {
    const category = this.selectedCategory();
    const phrase = this.searchPhrase().trim().toLocaleLowerCase('pl');
    return this.articles().filter((item) =>
      (category === 'Wszystkie' || item.category === category) &&
      (!phrase || `${item.title} ${item.excerpt} ${item.category}`.toLocaleLowerCase('pl').includes(phrase))
    );
  });
  protected readonly featuredArticle = computed(() =>
    this.filteredArticles().find((item) => item.featured) ?? this.filteredArticles()[0]
  );

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.routedPage.set(event.urlAfterRedirects !== '/');
        this.menuOpen.set(false);
        this.searchOpen.set(false);
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    });
    this.http.get<HomeData>('/api/home').subscribe({
      next: (data) => {
        this.articles.set(data.articles);
        this.matches.set(data.matches);
        this.standings.set(data.standings);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      }
    });
  }

  protected selectCategory(category: string): void {
    this.selectedCategory.set(category);
    this.menuOpen.set(false);
  }

  protected toggleSearch(): void {
    this.searchOpen.update((open) => !open);
    if (!this.searchOpen()) this.searchPhrase.set('');
  }

  protected setSearch(event: Event): void {
    this.searchPhrase.set((event.target as HTMLInputElement).value);
  }

  protected scrollToNews(): void {
    document.querySelector('#news')?.scrollIntoView({ behavior: 'smooth' });
  }
}

interface Team { name: string; short_name: string; score: number | null; }
interface Match { id: number; discipline: string; status: 'LIVE' | 'NADCHODZĄCY' | 'ZAKOŃCZONY'; time: string; home: Team; away: Team; }
interface Article { id: number; category: string; title: string; excerpt: string; published_at: string; reading_time: number; featured: boolean; accent: string; image_url?: string; }
interface Standing { position: number; team: string; played: number; points: number; }
interface HomeData { articles: Article[]; matches: Match[]; standings: Standing[]; }
