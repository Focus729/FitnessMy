import { useEffect, useState } from "react";

export async function mealBridgeRequest(
  profile: string,
  suffix: string,
  options: RequestInit = {},
) {
  const response = await fetch(
    `/api/profiles/${encodeURIComponent(profile)}/hermes-meals${suffix}`,
    {
      ...options,
      cache: "no-store",
      credentials: "same-origin",
    },
  );
  if (!response.ok) throw new Error("hermes_meals_unavailable");
  return response.json();
}

export function useHermesMeal(
  profile: string | undefined,
  paired: boolean,
  purpose: "plan" | "review",
  prompt: string,
) {
  const [result, setResult] = useState<{
    profile: string;
    prompt: string;
    text?: string;
    unavailable?: boolean;
  }>();
  useEffect(() => {
    if (!profile || !paired || !prompt) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const { signal } = controller;
    async function run() {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(prompt),
      );
      const snapshot = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const path = `?purpose=${purpose}&snapshot=${snapshot}`;
      const options = { signal };
      const queued = await mealBridgeRequest(profile!, path, {
        ...options,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      let checks = 0;
      const poll = async (job: { status?: string; result?: string }) => {
        if (signal.aborted) return;
        if (job.status === "ready" && typeof job.result === "string") {
          setResult({ profile: profile!, prompt, text: job.result });
        } else if (job.status !== "pending" || checks++ >= 32) {
          setResult({ profile: profile!, prompt, unavailable: true });
        } else {
          timer = setTimeout(() => {
            void mealBridgeRequest(profile!, path, options)
              .then(poll)
              .catch(failed);
          }, 3000);
        }
      };
      await poll(queued);
    }
    const failed = () => {
      if (!signal.aborted) setResult({ profile, prompt, unavailable: true });
    };
    timer = setTimeout(() => void run().catch(failed), 1200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [paired, profile, prompt, purpose]);
  return paired && prompt
    ? result?.profile === profile && result?.prompt === prompt
      ? result
      : { prompt }
    : undefined;
}
