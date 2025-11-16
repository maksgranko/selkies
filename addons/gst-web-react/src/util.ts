/**
 * Очередь для хранения элементов
 */
export class Queue<T> {
  private items: T[] = [];

  constructor(...elements: T[]) {
    this.enqueue(...elements);
  }

  enqueue(...elements: T[]): void {
    elements.forEach(element => this.items.push(element));
  }

  dequeue(count: number = 1): T | undefined {
    return this.items.splice(0, count)[0];
  }

  size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  toArray(): T[] {
    return [...this.items];
  }

  remove(element: T): void {
    const index = this.items.indexOf(element);
    if (index > -1) {
      this.items.splice(index, 1);
    }
  }

  find(element: T): boolean {
    return this.items.indexOf(element) !== -1;
  }

  clear(): void {
    this.items.length = 0;
  }
}

/**
 * Конвертирует строку в base64 с UTF-8 форматом
 */
export function stringToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const binString = Array.from(bytes, (byte) =>
    String.fromCodePoint(byte),
  ).join("");
  return btoa(binString);
}

/**
 * Конвертирует base64 UTF-8 строку в оригинальную форму
 */
export function base64ToString(base64: string): string {
  const stringBytes = atob(base64);
  const bytes = Uint8Array.from(stringBytes, (m) => m.codePointAt(0) ?? 0);
  return new TextDecoder().decode(bytes);
}

/**
 * Получить значение cookie по имени
 */
export function getCookieValue(name: string): string {
  const match = document.cookie.match('(^|[^;]+)\\s*' + name + '\\s*=\\s*([^;]+)');
  return match ? match.pop() || '' : '';
}


