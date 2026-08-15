import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './auth.service';
import { relativePublishedAt } from './date-format';

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
  protected readonly userMenuOpen = signal(false);
  protected readonly searchOpen = signal(false);
  protected readonly searchPhrase = signal('');
  protected readonly selectedCategory = signal('Wszystkie');
  protected readonly selectedSubcategory = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly articles = signal<Article[]>([]);
  protected readonly matches = signal<Match[]>([]);
  protected readonly standings = signal<Standing[]>([]);
  protected readonly categories = signal<Category[]>([]);

  protected readonly filteredArticles = computed(() => {
    const category = this.selectedCategory();
    const phrase = this.searchPhrase().trim().toLocaleLowerCase('pl');
    return this.articles().filter((item) =>
      (category === 'Wszystkie' || item.category === category) &&
      (!this.selectedSubcategory() || item.subcategory === this.selectedSubcategory()) &&
      (!phrase || `${item.title} ${item.excerpt} ${item.category}`.toLocaleLowerCase('pl').includes(phrase))
    );
  });
  protected readonly featuredArticle = computed(() =>
    this.selectedCategory() === 'Wszystkie'
      ? this.filteredArticles().find((item) => item.featured) ?? this.filteredArticles()[0]
      : this.filteredArticles().find((item) => item.category_featured) ?? this.filteredArticles()[0]
  );
  protected readonly filteredMatches = computed(() => {
    const category = this.selectedCategory();
    return this.matches().filter((match) => category === 'Wszystkie' || match.discipline === category || match.category === category);
  });

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        const onHomePage = event.urlAfterRedirects === '/';
        this.routedPage.set(!onHomePage);
        this.menuOpen.set(false);
        this.userMenuOpen.set(false);
        this.searchOpen.set(false);
        if (onHomePage) {
          this.loadHome();
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    });
    this.loadHome();
  }

  private loadHome(): void {
    if (!this.articles().length) {
      this.loading.set(true);
    }
    this.error.set(false);
    this.http.get<HomeData>('/api/home').subscribe({
      next: (data) => {
        this.articles.set(data.articles);
        this.categories.set(data.categories);
        if (this.selectedCategory() !== 'Wszystkie' && !data.categories.some((item) => item.name === this.selectedCategory())) {
          this.selectedCategory.set('Wszystkie');
          this.selectedSubcategory.set('');
        }
        if (this.selectedCategory() === 'Wszystkie') {
          this.matches.set(data.matches);
        } else {
          this.loadMatchesForCategory(this.selectedCategory());
        }
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
    this.selectedSubcategory.set('');
    this.menuOpen.set(false);
    if (this.routedPage()) {
      this.router.navigate(['/']);
    } else {
      this.loadMatchesForCategory(category);
    }
  }

  protected selectSubcategory(category: string, subcategory: string): void {
    this.selectedCategory.set(category);
    this.selectedSubcategory.set(subcategory);
    this.menuOpen.set(false);
    if (this.routedPage()) {
      this.router.navigate(['/']);
    } else {
      this.loadMatchesForCategory(category);
    }
  }

  private loadMatchesForCategory(category: string): void {
    const url = category === 'Wszystkie'
      ? '/api/matches'
      : `/api/matches?category=${encodeURIComponent(category)}`;
    this.http.get<Match[]>(url).subscribe({
      next: (matches) => this.matches.set(matches),
      error: () => this.error.set(true),
    });
  }

  protected toggleSearch(): void {
    this.userMenuOpen.set(false);
    this.searchOpen.update((open) => !open);
    if (!this.searchOpen()) this.searchPhrase.set('');
  }

  protected toggleUserMenu(): void {
    this.searchOpen.set(false);
    this.userMenuOpen.update((open) => !open);
  }

  protected logout(): void {
    this.auth.logout();
    this.userMenuOpen.set(false);
    this.router.navigate(['/']);
  }

  protected setSearch(event: Event): void {
    this.searchPhrase.set((event.target as HTMLInputElement).value);
  }

  protected scrollToNews(): void {
    document.querySelector('#news')?.scrollIntoView({ behavior: 'smooth' });
  }

  protected publishedLabel(value: string): string {
    return relativePublishedAt(value);
  }
}

interface Team { name: string; short_name: string; score: number | null; }
interface Match { id: number; discipline: string; category?: string; status: string; time: string; is_live: boolean; visible: boolean; home: Team; away: Team; }
interface Article { id: number; category: string; subcategory?: string | null; title: string; excerpt: string; published_at: string; reading_time: number; featured: boolean; category_featured: boolean; hidden: boolean; accent: string; author: string; image_url?: string; image_alt?: string; thumbnail_url?: string; thumbnail_alt?: string; featured_image_url?: string; featured_image_alt?: string; }
interface Subcategory { id: number; name: string; }
interface Category { id: number; name: string; accent: string; subcategories: Subcategory[]; }
interface Standing { position: number; team: string; played: number; points: number; }
interface HomeData { articles: Article[]; matches: Match[]; standings: Standing[]; categories: Category[]; }
