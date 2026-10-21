"use client";

import { getSignedInUser } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    void getSignedInUser()
      .then((user) => {
        if (active) {
          router.replace(user ? "/dashboard" : "/login");
        }
      })
      .catch(() => {
        if (active) {
          router.replace("/login");
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="ledger flex flex-1 items-center justify-center px-5">
      <p className="text-sm text-ink/60">Abrindo…</p>
    </div>
  );
}
