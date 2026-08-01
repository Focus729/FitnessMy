import { describe, expect, it } from 'vitest';
import { frequentFoods, matches, normalize, rankFood, searchFoods, searchKeyFor, stem, tokenize } from './search';
import { parseFoodText, parsePhrase, splitPhrases } from './textParse';
import type { Food } from '@/domain/model';

const food = (patch: Partial<Food> & { name: string }): Food => ({
  id: patch.name,
  source: 'seed',
  per100: { kcal: 100, proteinG: 10, fatG: 5, carbG: 5 },
  servings: [],
  basis: 'mass',
  isFavorite: false,
  useCount: 0,
  verified: true,
  searchKey: searchKeyFor({ name: patch.name, nameI18n: patch.nameI18n, brand: patch.brand }),
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...patch,
  name: patch.name,
});

describe('нормализация и поиск', () => {
  it('приводит ё к е и убирает пунктуацию', () => {
    expect(normalize('Гречка, отварная (ядрица)')).toBe('гречка отварная ядрица');
    expect(normalize('Тёмный шоколад')).toBe('темный шоколад');
  });

  it('обрезает русские окончания', () => {
    expect(stem('гречкой')).toBe('гречк');
    expect(stem('рис')).toBe('рис');
  });

  it('ищет по обоим языкам одновременно', () => {
    const key = searchKeyFor({ name: 'Гречка', nameI18n: { ru: 'Гречка', en: 'Buckwheat' } });
    expect(matches(key, tokenize('buckwheat'))).toBe(true);
    expect(matches(key, tokenize('гречка'))).toBe(true);
  });

  it('пустой запрос совпадает со всем', () => {
    expect(matches('что угодно', [])).toBe(true);
  });
});

describe('порядок выдачи (7.1)', () => {
  it('избранное с точным совпадением идёт первым', () => {
    const favorite = food({ name: 'Творог', isFavorite: true });
    const user = food({ name: 'Творог домашний', source: 'user' });
    expect(rankFood(favorite, { query: 'творог' })).toBeLessThan(rankFood(user, { query: 'творог' }));
  });

  it('продукты пользователя опережают встроенный набор', () => {
    const user = food({ name: 'Мой хлеб', source: 'user' });
    const seed = food({ name: 'Хлеб', source: 'seed' });
    expect(rankFood(user, { query: 'хлеб' })).toBeLessThan(rankFood(seed, { query: 'хлеб' }));
  });

  it('недавние опережают остальной встроенный набор', () => {
    const now = Date.now();
    const recent = food({ name: 'Рис', lastUsedAt: new Date(now - 86_400_000).toISOString() });
    const old = food({ name: 'Рис бурый' });
    expect(rankFood(recent, { query: 'рис', now })).toBeLessThan(rankFood(old, { query: 'рис', now }));
  });

  it('сеть идёт после встроенного набора', () => {
    const seed = food({ name: 'Молоко', source: 'seed' });
    const off = food({ name: 'Молоко', source: 'off' });
    expect(rankFood(seed, { query: 'молоко' })).toBeLessThan(rankFood(off, { query: 'молоко' }));
  });

  it('поиск отдаёт совпадения по подстроке', () => {
    const list = [food({ name: 'Куриная грудка' }), food({ name: 'Рис белый' })];
    const result = searchFoods(list, 'куриная');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Куриная грудка');
  });

  it('частое: избранное первым, дальше по числу использований', () => {
    const list = [
      food({ name: 'A', useCount: 10 }),
      food({ name: 'B', isFavorite: true, useCount: 1 }),
      food({ name: 'C', useCount: 5 }),
    ];
    expect(frequentFoods(list, 3).map((f) => f.name)).toEqual(['B', 'A', 'C']);
  });
});

describe('детерминированный разбор текста (15.2)', () => {
  const foods = [
    food({ name: 'Гречка отварная', nameI18n: { ru: 'Гречка отварная', en: 'Buckwheat boiled' } }),
    food({ name: 'Куриная грудка', servings: [{ id: 's', name: 'Грудка', grams: 180, isDefault: true }] }),
    food({ name: 'Яйцо куриное', servings: [{ id: 's', name: 'Штука', grams: 58, isDefault: true }] }),
  ];

  it('разбивает строку на фрагменты', () => {
    expect(splitPhrases('200 г гречки и куриная грудка')).toEqual(['200 г гречки', 'куриная грудка']);
    expect(splitPhrases('рис, курица, овощи')).toHaveLength(3);
  });

  it('разбирает число + единицу + название', () => {
    const item = parsePhrase('200 г гречки', foods);
    expect(item.grams).toBe(200);
    expect(item.food?.name).toBe('Гречка отварная');
    expect(item.confidence).toBe('high');
  });

  it('килограммы переводятся в граммы', () => {
    expect(parsePhrase('1.5 кг гречки', foods).grams).toBe(1500);
  });

  it('число без единицы трактуется как количество порций', () => {
    const item = parsePhrase('2 яйца', foods);
    expect(item.food?.name).toBe('Яйцо куриное');
    expect(item.grams).toBe(116);
  });

  it('без количества берёт порцию по умолчанию', () => {
    const item = parsePhrase('куриная грудка', foods);
    expect(item.grams).toBe(180);
    expect(item.confidence).toBe('medium');
  });

  it('незнакомый продукт помечается низкой уверенностью', () => {
    const item = parsePhrase('несуществующая еда', foods);
    expect(item.food).toBeUndefined();
    expect(item.confidence).toBe('low');
  });

  it('разбирает всю строку целиком', () => {
    const items = parseFoodText('200 г гречки и куриная грудка', foods);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.food != null)).toBe(true);
  });
});
