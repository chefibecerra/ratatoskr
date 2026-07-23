import { useEffect } from "react";

import { useSettings } from "@/stores/settings";
import { useVault } from "@/stores/vault";

const ACTIVITY_EVENTS = ["keydown", "pointerdown", "mousemove", "wheel"];

/** Bloquea el vault tras el período de inactividad configurado. */
export function useAutolock() {
  const minutes = useSettings((s) => s.autoLockMinutes);
  const status = useVault((s) => s.status);

  useEffect(() => {
    if (status !== "unlocked" || minutes <= 0) return;

    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void useVault.getState().lock(), minutes * 60_000);
    };

    arm();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, arm, { passive: true });
    }
    return () => {
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, arm);
      }
    };
  }, [status, minutes]);
}
