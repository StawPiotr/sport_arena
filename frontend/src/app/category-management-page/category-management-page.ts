import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../auth.service';

interface Subcategory {
  id: number;
  name: string;
  draftName?: string;
}

interface Category {
  id: number;
  name: string;
  accent: string;
  subcategories: Subcategory[];
  draftName?: string;
  newSubcategory?: string;
}

@Component({
  selector: 'app-category-management-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './category-management-page.html',
  styleUrl: './category-management-page.scss',
})
export class CategoryManagementPage {
  private readonly http = inject(HttpClient);
  protected readonly auth = inject(AuthService);

  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(true);
  protected readonly busyKey = signal('');
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');

  constructor() {
    this.loadCategories();
  }

  protected saveCategory(category: Category): void {
    const name = (category.draftName ?? category.name).trim();
    if (name.length < 2) return;
    this.run(`category-${category.id}`,
      this.http.put<Category>(
        `/api/categories/${category.id}`,
        { name, accent: category.accent },
        { headers: this.auth.authHeaders() },
      ),
      (updated) => {
        this.replaceCategory({ ...updated, draftName: updated.name, newSubcategory: '' });
        this.successMessage.set('Nazwa kategorii została zmieniona także we wszystkich powiązanych artykułach.');
      },
    );
  }

  protected deleteCategory(category: Category): void {
    if (!confirm(`Usunąć kategorię „${category.name}”? Można usunąć tylko kategorię bez artykułów i wyników.`)) return;
    this.run(`delete-category-${category.id}`,
      this.http.delete<void>(`/api/categories/${category.id}`, { headers: this.auth.authHeaders() }),
      () => {
        this.categories.update((items) => items.filter((item) => item.id !== category.id));
        this.successMessage.set('Kategoria została usunięta.');
      },
    );
  }

  protected addSubcategory(category: Category): void {
    const name = (category.newSubcategory ?? '').trim();
    if (name.length < 2) return;
    this.run(`new-${category.id}`,
      this.http.post<Subcategory>(
        `/api/categories/${category.id}/subcategories`,
        { name },
        { headers: this.auth.authHeaders() },
      ),
      (created) => {
        this.categories.update((items) => items.map((item) => item.id === category.id
          ? { ...item, newSubcategory: '', subcategories: [...item.subcategories, { ...created, draftName: created.name }] }
          : item));
        this.successMessage.set('Podkategoria została dodana i jest dostępna w edytorze artykułu.');
      },
    );
  }

  protected saveSubcategory(category: Category, subcategory: Subcategory): void {
    const name = (subcategory.draftName ?? subcategory.name).trim();
    if (name.length < 2 || name === subcategory.name) return;
    this.run(`subcategory-${subcategory.id}`,
      this.http.put<Subcategory>(
        `/api/subcategories/${subcategory.id}`,
        { name },
        { headers: this.auth.authHeaders() },
      ),
      (updated) => {
        this.categories.update((items) => items.map((item) => item.id === category.id
          ? {
              ...item,
              subcategories: item.subcategories.map((child) => child.id === updated.id
                ? { ...updated, draftName: updated.name }
                : child),
            }
          : item));
        this.successMessage.set('Nazwa podkategorii została zmieniona także w przypisanych artykułach.');
      },
    );
  }

  protected deleteSubcategory(category: Category, subcategory: Subcategory): void {
    if (!confirm(`Usunąć podkategorię „${subcategory.name}”? Artykuły pozostaną w kategorii „${category.name}”.`)) return;
    this.run(`delete-subcategory-${subcategory.id}`,
      this.http.delete<void>(`/api/subcategories/${subcategory.id}`, { headers: this.auth.authHeaders() }),
      () => {
        this.categories.update((items) => items.map((item) => item.id === category.id
          ? { ...item, subcategories: item.subcategories.filter((child) => child.id !== subcategory.id) }
          : item));
        this.successMessage.set('Podkategoria została usunięta, a jej artykuły przeniesiono do kategorii głównej.');
      },
    );
  }

  private loadCategories(): void {
    this.loading.set(true);
    this.http.get<Category[]>('/api/categories')
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (categories) => this.categories.set(categories.map((category) => ({
          ...category,
          draftName: category.name,
          newSubcategory: '',
          subcategories: category.subcategories.map((subcategory) => ({
            ...subcategory,
            draftName: subcategory.name,
          })),
        }))),
        error: () => this.errorMessage.set('Nie udało się załadować kategorii.'),
      });
  }

  private run<T>(key: string, request: import('rxjs').Observable<T>, onSuccess: (value: T) => void): void {
    this.errorMessage.set('');
    this.successMessage.set('');
    this.busyKey.set(key);
    request.pipe(finalize(() => this.busyKey.set(''))).subscribe({
      next: onSuccess,
      error: (error) => this.errorMessage.set(
        typeof error?.error?.detail === 'string' ? error.error.detail : 'Nie udało się zapisać zmiany.',
      ),
    });
  }

  private replaceCategory(updated: Category): void {
    this.categories.update((items) => items.map((item) => item.id === updated.id ? updated : item));
  }
}
