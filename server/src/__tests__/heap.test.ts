import { describe, it, expect } from 'vitest';
import { MinHeap } from '../algo/heap.js';

describe('MinHeap', () => {
  it('starts empty', () => {
    const h = new MinHeap<string>();
    expect(h.size).toBe(0);
    expect(h.pop()).toBeUndefined();
  });

  it('pops items in priority order', () => {
    const h = new MinHeap<string>();
    h.push('c', 30);
    h.push('a', 10);
    h.push('b', 20);
    expect(h.size).toBe(3);
    expect(h.pop()).toBe('a');
    expect(h.pop()).toBe('b');
    expect(h.pop()).toBe('c');
    expect(h.size).toBe(0);
  });

  it('handles duplicate priorities', () => {
    const h = new MinHeap<number>();
    h.push(1, 5);
    h.push(2, 5);
    h.push(3, 5);
    expect(h.size).toBe(3);
    const results = [h.pop(), h.pop(), h.pop()];
    expect(results.sort()).toEqual([1, 2, 3]);
  });

  it('handles single element', () => {
    const h = new MinHeap<string>();
    h.push('only', 42);
    expect(h.size).toBe(1);
    expect(h.pop()).toBe('only');
    expect(h.size).toBe(0);
  });

  it('maintains heap property with many inserts', () => {
    const h = new MinHeap<number>();
    const values = [50, 20, 80, 10, 60, 30, 90, 5, 70, 40];
    for (const v of values) h.push(v, v);

    const sorted: number[] = [];
    while (h.size > 0) sorted.push(h.pop()!);
    expect(sorted).toEqual([5, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });
});
