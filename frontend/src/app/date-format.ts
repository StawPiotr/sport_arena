const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function relativePublishedAt(value: string, now = new Date()): string {
  const published = new Date(value);
  const difference = Math.max(0, now.getTime() - published.getTime());

  if (difference <= DAY) {
    const hours = Math.max(1, Math.floor(difference / HOUR));
    return `${hours} ${polishHours(hours)} temu`;
  }

  if (difference <= 7 * DAY) {
    const days = Math.max(1, Math.floor(difference / DAY));
    return `${days} ${polishDays(days)} temu`;
  }

  return new Intl.DateTimeFormat('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(published);
}

export function exactPublishedAt(value: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

function polishHours(value: number): string {
  if (value === 1) return 'godzinę';
  if (value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 12 || value % 100 > 14)) {
    return 'godziny';
  }
  return 'godzin';
}

function polishDays(value: number): string {
  if (value === 1) return 'dzień';
  return 'dni';
}
