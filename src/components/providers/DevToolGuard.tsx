/* ============================================
   DevTool Guard – Prevents developer tool access
   Admins are automatically excluded.
   ============================================ */

"use client";

import { useAuthStore } from "@/stores/auth";
import { useEffect, useState } from "react";

export function DevToolGuard() {
  const user = useAuthStore((s) => s.user);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAdmin =
    user?.isAdmin ||
    user?.role === "admin" ||
    user?.role === "owner" ||
    user?.role === "moderator";

  useEffect(() => {
    if (!mounted) return;
    if (process.env.NODE_ENV !== "production") return;

    if (isAdmin) {
      import("disable-devtool").then((mod) => {
        try {
          if (mod.default) {
             mod.default.isSuspend = true;
          }
        } catch {}
      });
      return;
    }

    let cleanup: (() => void) | undefined;

    const init = async () => {
      try {
        const DisableDevtool = (await import("disable-devtool")).default;

        DisableDevtool({
          disableMenu: false,
          clearLog: true,
          interval: 200,
          disableCopy: false,
          disableCut: false,
          disablePaste: false,
          disableSelect: false,
          ondevtoolopen: (_type, _next) => {
            window.close();
            try {
              document.documentElement.innerHTML = "";
              document.title = "";
            } catch {}
            window.location.replace("about:blank");
          },
        });

        cleanup = () => {
          try {
            DisableDevtool.isSuspend = true;
          } catch {}
        };
      } catch (e) {
        console.error("[DevToolGuard] Failed to initialize:", e);
      }
    };

    init();

    return () => {
      cleanup?.();
    };
  }, [mounted, isAdmin]);

  return null;
}
