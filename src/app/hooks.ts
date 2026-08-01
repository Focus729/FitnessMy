/** Прикладные хуки поверх репозиториев. Dexie здесь не виден. */
import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@/data/repositories/hooks';
import { useRepos } from '@/data/repositories/context';
import { defaultSettings } from '@/data/defaults';
import type { LocalDate, Nutrients, Settings } from '@/domain/model';
import { sumEntries } from '@/domain/nutrition/nutrients';
import { buildRibbon } from '@/domain/nutrition/fasting';
import { today } from '@/lib/date';

export function useSettings(): Settings {
  return useQuery((r) => r.settings.get()) ?? defaultSettings();
}

export function useUpdateSettings() {
  const repos = useRepos();
  return useCallback((patch: Partial<Settings>) => repos.settings.update(patch), [repos]);
}

export function useProfile() {
  return useQuery((r) => r.profile.get());
}

export interface DaySummary {
  date: LocalDate;
  totals: Nutrients;
  waterMl: number;
  entryCount: number;
}

export function useDaySummary(date: LocalDate): DaySummary {
  const data = useQuery(
    async (r) => {
      const [entries, waterMl] = await Promise.all([r.diary.byDate(date), r.water.totalForDate(date)]);
      return { totals: sumEntries(entries), waterMl, entryCount: entries.length };
    },
    [date],
  );
  return {
    date,
    totals: data?.totals ?? { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 },
    waterMl: data?.waterMl ?? 0,
    entryCount: data?.entryCount ?? 0,
  };
}

/** Модель ленты дня — раздел 18.4. */
export function useRibbon(date: LocalDate, targetWindowHours?: number) {
  return useQuery(
    async (r) => {
      const [entries, water, workouts, foods] = await Promise.all([
        r.diary.byDate(date),
        r.water.byDate(date),
        r.workouts.byDate(date),
        r.foods.all(),
      ]);
      const nameById = new Map(foods.map((f) => [f.id, f.name]));
      return buildRibbon({
        entries,
        water,
        workouts,
        targetWindowHours,
        labelFor: (id) => {
          const entry = entries.find((e) => e.id === id);
          return entry?.refId ? (nameById.get(entry.refId) ?? '') : (entry?.quickName ?? '');
        },
      });
    },
    [date, targetWindowHours],
  );
}

/** Текущая дата, обновляемая при возврате на вкладку (полночь не должна «залипать»). */
export function useToday(): LocalDate {
  const [date, setDate] = useState(today);
  useEffect(() => {
    const check = () => setDate(today());
    document.addEventListener('visibilitychange', check);
    const id = window.setInterval(check, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.clearInterval(id);
    };
  }, []);
  return date;
}

/** Индикатор офлайн-режима — тонкая полоса вверху, без всплывающих окон (19.1). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
