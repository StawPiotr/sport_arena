import { AfterViewInit, Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

declare global {
  interface Window {
    FB?: {
      XFBML?: {
        parse: (element?: HTMLElement) => void;
      };
    };
    instgrm?: {
      Embeds?: {
        process: () => void;
      };
    };
    twttr?: {
      widgets?: {
        load: (element?: HTMLElement) => void;
      };
    };
  }
}

@Component({
  selector: 'app-x-embed',
  templateUrl: './x-embed.html',
  styleUrl: './x-embed.scss',
})
export class XEmbed implements AfterViewInit, OnChanges {
  @Input() content = '';
  @Input() provider = '';
  @Input() url = '';
  @ViewChild('tweetContainer') private tweetContainer?: ElementRef<HTMLElement>;

  private readonly sanitizer = inject(DomSanitizer);

  protected embedHtml: SafeHtml | null = null;
  protected embedUrl = '';
  protected platform: 'x' | 'facebook' | 'instagram' | 'generic' = 'generic';
  protected failed = false;

  ngAfterViewInit(): void {
    this.renderTweet();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['content'] || changes['provider'] || changes['url']) {
      this.prepareEmbed();
      this.renderTweet();
    }
  }

  private prepareEmbed(): void {
    const raw = (this.content || this.url || '').trim();
    this.platform = this.detectPlatform(raw);
    this.embedUrl = this.extractPlatformUrl(raw, this.platform);
    this.failed = !this.embedUrl && this.platform !== 'generic';
    this.embedHtml = this.buildEmbedHtml(raw);
  }

  private extractTweetUrl(value: string): string {
    const match = value.match(/https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^"'<>\s]+\/status\/\d+[^"'<>\s]*/i);
    if (!match) return '';
    return match[0].replace(/&amp;/g, '&').replace(/https:\/\/(?:www\.)?x\.com\//i, 'https://twitter.com/');
  }

  private detectPlatform(raw: string): 'x' | 'facebook' | 'instagram' | 'generic' {
    const provider = this.provider.toLowerCase();
    const value = raw.toLowerCase();

    if (provider.includes('instagram') || value.includes('instagram-media') || value.includes('instagram.com/')) return 'instagram';
    if (provider.includes('facebook') || value.includes('fb-post') || value.includes('facebook.com/') || value.includes('fb.watch/')) return 'facebook';
    if (provider.includes('twitter') || provider === 'x' || provider.includes('x /') || value.includes('twitter-tweet') || /(?:x|twitter)\.com\//.test(value)) return 'x';
    return 'generic';
  }

  private extractPlatformUrl(raw: string, platform: 'x' | 'facebook' | 'instagram' | 'generic'): string {
    if (platform === 'x') return this.extractTweetUrl(raw);
    if (platform === 'instagram') return this.extractInstagramUrl(raw);
    if (platform === 'facebook') return this.extractFacebookUrl(raw);
    return this.extractAnyUrl(raw);
  }

  private buildEmbedHtml(raw: string): SafeHtml | null {
    if (this.platform === 'x') {
      const html = this.buildTweetHtml(raw, this.embedUrl);
      return html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
    }

    if (this.platform === 'instagram') {
      const html = this.buildInstagramHtml(raw, this.embedUrl);
      return html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
    }

    if (this.platform === 'facebook') {
      const html = this.buildFacebookHtml(raw, this.embedUrl);
      return html ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
    }

    const iframe = this.extractSafeIframe(raw);
    return iframe ? this.sanitizer.bypassSecurityTrustHtml(iframe) : null;
  }

  private buildTweetHtml(raw: string, tweetUrl: string): string {
    const parsedBlockquote = this.extractOfficialBlockquote(raw, 'blockquote.twitter-tweet');
    if (parsedBlockquote) return parsedBlockquote;
    if (!tweetUrl) return '';

    return `<blockquote class="twitter-tweet" data-dnt="true"><a href="${this.escapeAttribute(tweetUrl)}"></a></blockquote>`;
  }

  private buildInstagramHtml(raw: string, instagramUrl: string): string {
    const parsedBlockquote = this.extractOfficialBlockquote(raw, 'blockquote.instagram-media');
    if (parsedBlockquote) return parsedBlockquote;
    if (!instagramUrl) return '';

    return `<blockquote class="instagram-media" data-instgrm-permalink="${this.escapeAttribute(instagramUrl)}" data-instgrm-version="14"></blockquote>`;
  }

  private buildFacebookHtml(raw: string, facebookUrl: string): string {
    const parsedFacebook = this.extractOfficialFacebook(raw);
    if (parsedFacebook) return parsedFacebook;
    if (!facebookUrl) return '';

    const pluginType = this.isFacebookVideo(raw || facebookUrl) ? 'video' : 'post';
    const isReel = this.isFacebookReel(raw || facebookUrl);
    const width = pluginType === 'video' && isReel ? 267 : 500;
    const height = pluginType === 'video' && isReel ? 476 : pluginType === 'video' ? 620 : 760;
    const src = this.facebookPluginUrl(pluginType, facebookUrl, width, 'true');

    return this.safeIframeHtml(src, 'Osadzony post z Facebooka', 'facebook-iframe', height, width);
  }

  private extractOfficialBlockquote(raw: string, selector: string): string {
    const document = new DOMParser().parseFromString(raw, 'text/html');
    const blockquote = document.querySelector(selector);
    if (!blockquote) return '';

    blockquote.querySelectorAll('script').forEach((script) => script.remove());
    if (selector.includes('twitter-tweet')) blockquote.setAttribute('data-dnt', 'true');
    return blockquote.outerHTML;
  }

  private extractOfficialFacebook(raw: string): string {
    const document = new DOMParser().parseFromString(raw, 'text/html');
    const post = document.querySelector('.fb-post, .fb-video') as HTMLElement | null;
    if (post) {
      const href = post.getAttribute('data-href');
      if (href) {
        const pluginType = post.classList.contains('fb-video') || this.isFacebookVideo(href) ? 'video' : 'post';
        const isReel = this.isFacebookReel(href);
        const width = pluginType === 'video' && isReel ? 267 : 500;
        const height = pluginType === 'video' && isReel ? 476 : pluginType === 'video' ? 620 : 760;
        const src = this.facebookPluginUrl(pluginType, this.cleanHtmlUrl(href), width, 'true');
        return this.safeIframeHtml(src, 'Osadzony post z Facebooka', 'facebook-iframe', height, width);
      }
    }

    const iframe = document.querySelector('iframe[src*="facebook.com/plugins/"]') as HTMLIFrameElement | null;
    if (!iframe?.src) return '';
    const pluginType = iframe.src.includes('/video.php') ? 'video' : 'post';
    const originalWidth = Number(iframe.getAttribute('width')) || 0;
    const originalHeight = Number(iframe.getAttribute('height')) || 0;
    const hasOriginalRatio = originalWidth > 0 && originalHeight > 0;
    const isPortraitReel = pluginType === 'video' && this.isFacebookReel(iframe.src) && (!hasOriginalRatio || originalHeight > originalWidth);
    const width = isPortraitReel ? 267 : originalWidth || 500;
    const height = isPortraitReel ? 476 : originalHeight || (pluginType === 'video' ? 620 : 760);
    const src = isPortraitReel ? this.rebuildFacebookPluginIframeSrc(iframe.src, pluginType, width) : iframe.src;
    return this.safeIframeHtml(src, 'Osadzony post z Facebooka', 'facebook-iframe', height, width);
  }

  private extractInstagramUrl(value: string): string {
    const document = new DOMParser().parseFromString(value, 'text/html');
    const permalink = document.querySelector('blockquote.instagram-media')?.getAttribute('data-instgrm-permalink');
    if (permalink) return this.cleanHtmlUrl(permalink);

    const match = value.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[^"'<>\s/?#]+\/?[^"'<>\s]*/i);
    return match ? this.cleanHtmlUrl(match[0]) : '';
  }

  private extractFacebookUrl(value: string): string {
    const document = new DOMParser().parseFromString(value, 'text/html');
    const dataHref = document.querySelector('.fb-post, .fb-video')?.getAttribute('data-href');
    if (dataHref) return this.cleanHtmlUrl(dataHref);

    const pluginIframe = document.querySelector('iframe[src*="facebook.com/plugins/"]') as HTMLIFrameElement | null;
    if (pluginIframe?.src) {
      const href = new URL(pluginIframe.src).searchParams.get('href');
      if (href) return this.cleanHtmlUrl(href);
    }

    const match = value.match(/https?:\/\/(?:www\.)?(?:facebook\.com|fb\.watch)\/[^"'<>\s]+/i);
    return match ? this.cleanHtmlUrl(match[0]) : '';
  }

  private extractAnyUrl(value: string): string {
    const match = value.match(/https?:\/\/[^"'<>\s]+/);
    return match ? this.cleanHtmlUrl(match[0]) : '';
  }

  private extractSafeIframe(raw: string): string {
    const document = new DOMParser().parseFromString(raw, 'text/html');
    const iframe = document.querySelector('iframe') as HTMLIFrameElement | null;
    if (!iframe?.src || !/^https:\/\//i.test(iframe.src)) return '';
    return this.safeIframeHtml(iframe.src, iframe.title || 'Osadzona treść');
  }

  private safeIframeHtml(src: string, title: string, className = 'generic-iframe', height?: number, width?: number): string {
    const heightAttribute = height ? ` height="${height}"` : '';
    const widthAttribute = width ? ` width="${width}"` : '';
    const sizeStyle = className.includes('facebook') && width && height ? ` style="width:${width}px;height:${height}px"` : '';
    const loading = className.includes('facebook') ? 'eager' : 'lazy';
    const scrolling = className.includes('facebook') ? 'no' : 'auto';
    return `<iframe class="social-iframe ${className}" src="${this.escapeAttribute(src)}" title="${this.escapeAttribute(title)}" loading="${loading}" scrolling="${scrolling}" frameborder="0" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowfullscreen${widthAttribute}${heightAttribute}${sizeStyle}></iframe>`;
  }

  private renderTweet(): void {
    window.setTimeout(() => {
      const element = this.tweetContainer?.nativeElement;
      if (!element || !this.embedHtml) return;

      this.loadPlatformScript()
        .then(() => this.processPlatform(element))
        .catch(() => {
          this.failed = true;
        });
    });
  }

  private loadPlatformScript(): Promise<void> {
    if (this.platform === 'x') return this.loadTwitterWidgets();
    if (this.platform === 'instagram') return this.loadInstagramEmbed();
    return Promise.resolve();
  }

  private processPlatform(element: HTMLElement): void {
    if (this.platform === 'x') window.twttr?.widgets?.load(element);
    if (this.platform === 'instagram') window.instgrm?.Embeds?.process();
  }

  private loadTwitterWidgets(): Promise<void> {
    if (window.twttr?.widgets?.load) return Promise.resolve();

    const existingScript = document.getElementById('twitter-wjs') as HTMLScriptElement | null;
    if (existingScript) {
      return new Promise((resolve, reject) => {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(), { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'twitter-wjs';
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      script.charset = 'utf-8';
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.body.appendChild(script);
    });
  }

  private loadInstagramEmbed(): Promise<void> {
    if (window.instgrm?.Embeds?.process) return Promise.resolve();

    const existingScript = document.getElementById('instagram-embed-js') as HTMLScriptElement | null;
    if (existingScript) {
      return new Promise((resolve, reject) => {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(), { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'instagram-embed-js';
      script.src = 'https://www.instagram.com/embed.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.body.appendChild(script);
    });
  }

  private loadFacebookSdk(): Promise<void> {
    if (window.FB?.XFBML?.parse) return Promise.resolve();

    if (!document.getElementById('fb-root')) {
      const root = document.createElement('div');
      root.id = 'fb-root';
      document.body.prepend(root);
    }

    const existingScript = document.getElementById('facebook-jssdk') as HTMLScriptElement | null;
    if (existingScript) {
      return new Promise((resolve, reject) => {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(), { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'facebook-jssdk';
      script.src = 'https://connect.facebook.net/pl_PL/sdk.js#xfbml=1&version=v23.0';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve();
      script.onerror = () => reject();
      document.body.appendChild(script);
    });
  }

  private cleanHtmlUrl(value: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value.replace(/&amp;/g, '&').trim();
  }

  private isFacebookVideo(value: string): boolean {
    return /fb\.watch|\/videos\/|\/watch\/?\?v=|plugins\/video\.php/i.test(value);
  }

  private isFacebookReel(value: string): boolean {
    return /\/reel\/|plugins\/video\.php[^"'<>]*%2Freel%2F|plugins\/video\.php[^"'<>]*\/reel\//i.test(value);
  }

  private facebookPluginUrl(pluginType: 'post' | 'video', facebookUrl: string, width: number, showText: string): string {
    return `https://www.facebook.com/plugins/${pluginType}.php?href=${encodeURIComponent(facebookUrl)}&show_text=${showText}&width=${width}`;
  }

  private rebuildFacebookPluginIframeSrc(src: string, pluginType: 'post' | 'video', width: number): string {
    const url = new URL(src);
    const href = url.searchParams.get('href');
    if (!href) return src;

    const showText = url.searchParams.get('show_text') ?? 'false';
    const rebuilt = new URL(`https://www.facebook.com/plugins/${pluginType}.php`);
    rebuilt.searchParams.set('href', href);
    rebuilt.searchParams.set('show_text', showText);
    rebuilt.searchParams.set('width', String(width));
    const time = url.searchParams.get('t');
    if (time) rebuilt.searchParams.set('t', time);
    return rebuilt.toString();
  }

  private escapeAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
