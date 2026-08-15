import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../auth.service';

interface Sport {
  id: number;
  name: string;
  accent: string;
  subcategories: { id: number; name: string }[];
}

interface ArticleBlock {
  type: 'text' | 'image' | 'embed';
  content?: string;
  src?: string;
  alt?: string;
  provider?: string;
  url?: string;
  images?: GalleryImage[];
}

interface GalleryImage {
  src: string;
  alt: string;
  original_src?: string;
}

interface CreatedArticle {
  id: number;
}

interface EditableArticle {
  id: number;
  category: string;
  subcategory: string | null;
  title: string;
  excerpt: string;
  published_at: string;
  content: string[];
  blocks: ArticleBlock[];
  image_url: string | null;
  image_alt: string | null;
  thumbnail_url: string | null;
  thumbnail_alt: string | null;
  featured_image_url: string | null;
  featured_image_alt: string | null;
}

interface CropState {
  target: 'cover' | 'thumbnail' | 'featured' | 'block';
  blockIndex?: number;
  source: string;
  fileName: string;
  imageWidth: number;
  imageHeight: number;
  image: HTMLImageElement;
  aspect: number;
  zoom: number;
  positionX: number;
  positionY: number;
  galleryImageIndex?: number;
  appendToGallery?: boolean;
}

@Component({
  selector: 'app-article-editor-page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './article-editor-page.html',
  styleUrl: './article-editor-page.scss',
})
export class ArticleEditorPage {
  @ViewChild('cropCanvas') private cropCanvas?: ElementRef<HTMLCanvasElement>;
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  private readonly articleId = this.route.snapshot.paramMap.get('id');

  protected readonly sports = signal<Sport[]>([]);
  protected readonly selectedSport = signal('');
  protected readonly selectedSubcategory = signal('');
  protected readonly title = signal('');
  protected readonly excerpt = signal('');
  protected readonly coverImage = signal('');
  protected readonly coverImageAlt = signal('');
  protected readonly thumbnailImage = signal('');
  protected readonly thumbnailImageAlt = signal('');
  protected readonly featuredImage = signal('');
  protected readonly featuredImageAlt = signal('');
  protected readonly publishLater = signal(false);
  protected readonly publishedAt = signal('');
  protected readonly blocks = signal<ArticleBlock[]>([
    { type: 'text', content: '' },
  ]);
  protected readonly loadingSports = signal(true);
  protected readonly loadingArticle = signal(false);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly cropState = signal<CropState | null>(null);
  protected readonly effectiveCoverImage = computed(() =>
    this.coverImage()
      || this.blocks().find((block) => block.type === 'image' && (block.src || block.images?.length))?.src
      || this.blocks().find((block) => block.type === 'image' && block.images?.length)?.images?.[0]?.src
      || '',
  );
  protected readonly usingFallbackCover = computed(() => !this.coverImage() && Boolean(this.effectiveCoverImage()));
  protected readonly effectiveThumbnailImage = computed(() => this.thumbnailImage() || this.effectiveCoverImage());
  protected readonly effectiveFeaturedImage = computed(() => this.featuredImage() || this.effectiveCoverImage());
  protected readonly usingFallbackThumbnail = computed(() => !this.thumbnailImage() && Boolean(this.effectiveThumbnailImage()));
  protected readonly usingFallbackFeatured = computed(() => !this.featuredImage() && Boolean(this.effectiveFeaturedImage()));
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
  private pendingGalleryCrops: { blockIndex: number; source: string; fileName: string }[] = [];

  constructor() {
    this.http
      .get<Sport[]>('/api/categories')
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

  protected selectSport(name: string): void {
    this.selectedSport.set(name);
    const category = this.sports().find((item) => item.name === name);
    if (!category?.subcategories.some((item) => item.name === this.selectedSubcategory())) {
      this.selectedSubcategory.set('');
    }
  }

  protected selectedSportSubcategories(): { id: number; name: string }[] {
    return this.sports().find((item) => item.name === this.selectedSport())?.subcategories ?? [];
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
    if (block.type === 'image') return (block.images?.length ?? 0) > 1 ? `Galeria · zdjęć: ${block.images?.length}` : 'Blok zdjęcia';
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
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    input.value = '';

    const block = this.blocks()[index];
    const useGallery = files.length > 1 || Boolean(block.images?.length) || Boolean(block.src);
    if (!useGallery) {
      this.openFileCropper(files[0], 'block', index);
      return;
    }

    if (!block.images) {
      const existing = block.src ? [{ src: block.src, original_src: block.src, alt: block.alt || 'Zdjęcie' }] : [];
      this.updateBlock(index, { images: existing, src: undefined, alt: undefined });
    }
    Promise.all(files.map((file) => this.readImageFile(file))).then((images) => {
      this.pendingGalleryCrops.push(...images.map((image) => ({ blockIndex: index, ...image })));
      if (!this.cropState()) this.openNextGalleryCrop();
    }).catch(() => this.errorMessage.set('Nie udało się odczytać jednego ze zdjęć.'));
  }

  protected selectCoverImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.openFileCropper(file, 'cover');
    (event.target as HTMLInputElement).value = '';
  }

  protected selectThumbnailImage(event: Event): void {
    this.selectPlacementImage(event, 'thumbnail');
  }

  protected selectFeaturedImage(event: Event): void {
    this.selectPlacementImage(event, 'featured');
  }

  protected recropCoverImage(): void {
    const source = this.effectiveCoverImage();
    if (!source) return;
    const fallbackImage = this.blocks().find((block) => block.type === 'image' && block.src);
    this.openCropper(
      source,
      'cover',
      undefined,
      this.coverImageAlt() || fallbackImage?.alt || 'zdjecie-glowne',
    );
  }

  protected recropThumbnailImage(): void {
    const source = this.effectiveThumbnailImage();
    if (source) this.openCropper(source, 'thumbnail', undefined, this.thumbnailImageAlt() || 'miniatura');
  }

  protected recropFeaturedImage(): void {
    const source = this.effectiveFeaturedImage();
    if (source) this.openCropper(source, 'featured', undefined, this.featuredImageAlt() || 'zdjecie-wyroznione');
  }

  protected recropBlockImage(index: number): void {
    const block = this.blocks()[index];
    if (block?.src) this.openCropper(block.src, 'block', index, block.alt || `zdjecie-${index + 1}`);
  }

  protected recropGalleryImage(blockIndex: number, imageIndex: number): void {
    const image = this.blocks()[blockIndex]?.images?.[imageIndex];
    if (image) this.openCropper(image.original_src || image.src, 'block', blockIndex, image.alt, imageIndex);
  }

  protected removeGalleryImage(blockIndex: number, imageIndex: number): void {
    const block = this.blocks()[blockIndex];
    this.updateBlock(blockIndex, {
      images: (block.images ?? []).filter((_, index) => index !== imageIndex),
    });
  }

  protected updateGalleryImageAlt(blockIndex: number, imageIndex: number, alt: string): void {
    const block = this.blocks()[blockIndex];
    this.updateBlock(blockIndex, {
      images: (block.images ?? []).map((image, index) => index === imageIndex ? { ...image, alt } : image),
    });
  }

  protected visibleGalleryImages(block: ArticleBlock): GalleryImage[] {
    return (block.images ?? []).slice(0, 4);
  }

  protected hiddenGalleryCount(block: ArticleBlock): number {
    return Math.max(0, (block.images?.length ?? 0) - 4);
  }

  protected galleryOverlayOpacity(block: ArticleBlock): number {
    return Math.min(0.82, 0.38 + this.hiddenGalleryCount(block) * 0.08);
  }

  protected removeCoverImage(): void {
    this.coverImage.set('');
    this.coverImageAlt.set('');
  }

  protected removeThumbnailImage(): void {
    this.thumbnailImage.set('');
    this.thumbnailImageAlt.set('');
  }

  protected removeFeaturedImage(): void {
    this.featuredImage.set('');
    this.featuredImageAlt.set('');
  }

  protected updateCrop(patch: Partial<Pick<CropState, 'aspect' | 'zoom' | 'positionX' | 'positionY'>>): void {
    this.cropState.update((state) => state ? { ...state, ...patch } : null);
    setTimeout(() => this.renderCropPreview());
  }

  protected cancelCrop(): void {
    this.cropState.set(null);
    this.pendingGalleryCrops = [];
  }

  protected cropFormatLabel(crop: CropState): string {
    if (crop.target === 'thumbnail') return 'Miniatura · 1200 × 600 px · proporcje 2:1';
    if (crop.target === 'featured') return 'Materiał wyróżniony · 1200 × 1000 px · proporcje 6:5';
    if (crop.target === 'block' && (crop.appendToGallery || crop.galleryImageIndex !== undefined)) {
      return 'Zdjęcie galerii · stałe proporcje 4:3';
    }
    if (crop.target === 'block') return 'Zdjęcie w treści · stałe proporcje 16:9';
    if (crop.target === 'cover') return `Zdjęcie główne · wybrany układ ${crop.aspect.toFixed(2)}:1 · maksymalnie 1180 × 720 px na stronie`;
    return `Zdjęcie zachowa proporcje oryginału · ${crop.imageWidth} × ${crop.imageHeight} px`;
  }

  protected applyCrop(): void {
    const state = this.cropState();
    if (!state) return;
    const cropped = this.drawCrop(state, true);
    if (!cropped) return;

    if (state.target === 'cover') {
      this.coverImage.set(cropped);
      if (!this.coverImageAlt()) this.coverImageAlt.set(state.fileName);
    } else if (state.target === 'thumbnail') {
      this.thumbnailImage.set(cropped);
      if (!this.thumbnailImageAlt()) this.thumbnailImageAlt.set(state.fileName);
    } else if (state.target === 'featured') {
      this.featuredImage.set(cropped);
      if (!this.featuredImageAlt()) this.featuredImageAlt.set(state.fileName);
    } else if (state.blockIndex !== undefined) {
      const block = this.blocks()[state.blockIndex];
      if (state.galleryImageIndex !== undefined) {
        this.updateBlock(state.blockIndex, {
          images: (block.images ?? []).map((image, index) => index === state.galleryImageIndex
            ? { src: cropped, original_src: image.original_src || state.source, alt: image.alt || state.fileName }
            : image),
        });
      } else if (state.appendToGallery) {
        this.updateBlock(state.blockIndex, {
          images: [...(block.images ?? []), { src: cropped, original_src: state.source, alt: state.fileName }],
        });
      } else {
        this.updateBlock(state.blockIndex, {
          src: cropped,
          alt: block.alt || state.fileName,
        });
      }
    }
    this.cropState.set(null);
    if (state.appendToGallery) setTimeout(() => this.openNextGalleryCrop());
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
          images: (block.images ?? [])
            .filter((image) => image.src.trim())
            .map((image) => ({
              src: image.src.trim(),
              original_src: (image.original_src ?? image.src).trim(),
              alt: image.alt.trim() || title,
            })),
        };
      })
      .filter((block) => {
        if (block.type === 'text') return block.content;
        if (block.type === 'embed') return block.content || block.url;
        return block.src || block.images.length;
      });

    if (!payloadBlocks.some((block) => block.type === 'text')) {
      this.errorMessage.set('Dodaj przynajmniej jeden blok tekstowy.');
      return;
    }

    this.submitting.set(true);
    const payload = {
      category: this.selectedSport(),
      subcategory: this.selectedSubcategory().trim() || null,
      title,
      excerpt,
      published_at: this.publishLater() && this.publishedAt()
        ? new Date(this.publishedAt()).toISOString()
        : null,
      image_url: this.coverImage().trim() || null,
      image_alt: this.coverImage() ? (this.coverImageAlt().trim() || title) : null,
      thumbnail_url: this.thumbnailImage().trim() || null,
      thumbnail_alt: this.thumbnailImage() ? (this.thumbnailImageAlt().trim() || title) : null,
      featured_image_url: this.featuredImage().trim() || null,
      featured_image_alt: this.featuredImage() ? (this.featuredImageAlt().trim() || title) : null,
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
    this.selectedSubcategory.set(article.subcategory ?? '');
    this.title.set(article.title);
    this.excerpt.set(article.excerpt);
    this.coverImage.set(article.image_url ?? '');
    this.coverImageAlt.set(article.image_alt ?? '');
    this.thumbnailImage.set(article.thumbnail_url ?? '');
    this.thumbnailImageAlt.set(article.thumbnail_alt ?? '');
    this.featuredImage.set(article.featured_image_url ?? '');
    this.featuredImageAlt.set(article.featured_image_alt ?? '');
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

  private selectPlacementImage(event: Event, target: 'thumbnail' | 'featured'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.openFileCropper(file, target);
    input.value = '';
  }

  private openFileCropper(file: File, target: CropState['target'], blockIndex?: number): void {
    const reader = new FileReader();
    reader.onload = () => this.openCropper(String(reader.result), target, blockIndex, file.name);
    reader.readAsDataURL(file);
  }

  private readImageFile(file: File): Promise<{ source: string; fileName: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ source: String(reader.result), fileName: file.name });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private openNextGalleryCrop(): void {
    const next = this.pendingGalleryCrops.shift();
    if (!next) return;
    this.openCropper(next.source, 'block', next.blockIndex, next.fileName, undefined, true);
  }

  private openCropper(
    source: string,
    target: CropState['target'],
    blockIndex?: number,
    fileName = 'zdjecie',
    galleryImageIndex?: number,
    appendToGallery = false,
  ): void {
    const image = new Image();
    image.onload = () => {
      this.cropState.set({
        target,
        blockIndex,
        source,
        fileName,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        image,
        aspect: target === 'thumbnail'
          ? 2
          : target === 'featured'
            ? 6 / 5
            : target === 'block'
              ? (appendToGallery || galleryImageIndex !== undefined ? 4 / 3 : 16 / 9)
              : image.naturalWidth / image.naturalHeight,
        zoom: 1,
        positionX: 0,
        positionY: 0,
        galleryImageIndex,
        appendToGallery,
      });
      setTimeout(() => this.renderCropPreview());
    };
    image.onerror = () => this.errorMessage.set('Nie udało się odczytać wybranego zdjęcia.');
    image.src = source;
  }

  private renderCropPreview(): void {
    const state = this.cropState();
    const canvas = this.cropCanvas?.nativeElement;
    if (!state || !canvas) return;
    const width = Math.min(720, window.innerWidth - 80);
    canvas.width = Math.max(280, width);
    canvas.height = Math.round(canvas.width / state.aspect);
    this.drawCrop(state, false, canvas);
  }

  private drawCrop(state: CropState, exportImage: boolean, targetCanvas?: HTMLCanvasElement): string | null {
    const canvas = targetCanvas ?? document.createElement('canvas');
    if (exportImage) {
      if (state.target === 'thumbnail') {
        canvas.width = 1200;
        canvas.height = 600;
      } else if (state.target === 'featured') {
        canvas.width = 1200;
        canvas.height = 1000;
      } else {
        canvas.width = Math.min(1600, state.imageWidth);
        canvas.height = Math.round(canvas.width / state.aspect);
      }
    }
    const context = canvas.getContext('2d');
    if (!context) return null;

    const sourceAspect = state.imageWidth / state.imageHeight;
    let cropWidth = sourceAspect > state.aspect ? state.imageHeight * state.aspect : state.imageWidth;
    let cropHeight = sourceAspect > state.aspect ? state.imageHeight : state.imageWidth / state.aspect;
    cropWidth /= state.zoom;
    cropHeight /= state.zoom;
    const travelX = (state.imageWidth - cropWidth) / 2;
    const travelY = (state.imageHeight - cropHeight) / 2;
    const sourceX = state.imageWidth / 2 + (state.positionX / 100) * travelX - cropWidth / 2;
    const sourceY = state.imageHeight / 2 + (state.positionY / 100) * travelY - cropHeight / 2;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(state.image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    return exportImage ? canvas.toDataURL('image/jpeg', 0.9) : '';
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
