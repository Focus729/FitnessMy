/**
 * Корень приложения: выбор профиля → PIN → онбординг → оболочка с вкладками.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RepositoriesProvider } from '@/data/repositories/context';
import { getProfileRef } from '@/data/profiles';
import { applyTheme, useSession } from './store';
import { AppShell } from './AppShell';
import { ProfileGate } from '@/screens/ProfileGate';
import { CloudWorkspaceGate } from '@/components/CloudWorkspaceGate';
import { TodayScreen } from '@/screens/Today';
import { useSettings } from './hooks';

/**
 * Главный экран грузится сразу — он открывается при каждом запуске.
 * Остальные вкладки подгружаются по требованию: графики и сканер штрихкода
 * не должны попадать в путь первой отрисовки (19.2, цель < 1.0 с).
 */
const Onboarding = lazy(() =>
  import('@/screens/Onboarding').then((m) => ({ default: m.Onboarding })),
);
const FoodScreen = lazy(() => import('@/screens/Food').then((m) => ({ default: m.FoodScreen })));
const GymScreen = lazy(() => import('@/screens/Gym').then((m) => ({ default: m.GymScreen })));
const ActiveWorkoutScreen = lazy(() =>
  import('@/screens/ActiveWorkout').then((m) => ({
    default: m.ActiveWorkoutScreen,
  })),
);
const WorkoutDetailScreen = lazy(() =>
  import('@/screens/WorkoutDetail').then((m) => ({
    default: m.WorkoutDetailScreen,
  })),
);
const BodyScreen = lazy(() => import('@/screens/Body').then((m) => ({ default: m.BodyScreen })));
const ProgressScreen = lazy(() =>
  import('@/screens/Progress').then((m) => ({ default: m.ProgressScreen })),
);
const SettingsScreen = lazy(() =>
  import('@/screens/Settings').then((m) => ({ default: m.SettingsScreen })),
);
import { setLocale } from '@/i18n';
import { loadSeedData } from '@/data/seed/load';
import { useRepos } from '@/data/repositories/context';

export function App() {
  const { activeProfileId, unlocked } = useSession();

  const ref = activeProfileId ? getProfileRef(activeProfileId) : undefined;
  if (!activeProfileId || !ref || !unlocked) return <ProfileGate />;

  const workspace = (
    <RepositoriesProvider key={activeProfileId} profileId={activeProfileId}>
      <ProfileScope profileId={activeProfileId} />
    </RepositoriesProvider>
  );
  const cloud = ref.cloud;
  return cloud
    ? <CloudWorkspaceGate key={activeProfileId} id={activeProfileId} {...cloud}>{workspace}</CloudWorkspaceGate>
    : workspace;
}

function ProfileScope({ profileId }: { profileId: string }) {
  const settings = useSettings();
  const repos = useRepos();
  const { i18n } = useTranslation();
  const [seeded, setSeeded] = useState(false);

  // Встроенные наборы грузятся после первого рендера — они не блокируют запуск.
  useEffect(() => {
    let cancelled = false;
    void loadSeedData(repos, profileId).then(() => {
      if (!cancelled) setSeeded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [repos, profileId]);

  useEffect(() => {
    applyTheme(settings.theme, getProfileRef(profileId)?.tint ?? 'a');
  }, [settings.theme, profileId]);

  useEffect(() => {
    if (settings.locale !== i18n.language) void setLocale(settings.locale);
  }, [settings.locale, i18n.language]);

  if (!settings.onboardingDone) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <Onboarding />
      </Suspense>
    );
  }

  return (
    <HashRouter>
      <Suspense fallback={<ScreenFallback />}>
        <Routes>
          <Route path="/workout/:workoutId" element={<ActiveWorkoutScreen />} />
          <Route path="/workout/:workoutId/view" element={<WorkoutDetailScreen />} />
          <Route element={<AppShell seeded={seeded} />}>
            <Route path="/" element={<TodayScreen />} />
            <Route path="/food" element={<FoodScreen />} />
            <Route path="/gym" element={<GymScreen />} />
            <Route path="/body" element={<BodyScreen />} />
            <Route path="/progress" element={<ProgressScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
}

/** Пустое место вместо спиннера: переход между вкладками короче 100 мс. */
function ScreenFallback() {
  return <div className="min-h-dvh" />;
}
