"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import AuthModal from "./AuthModal";
import styles from "./Community.module.css";

// Header widget: signed-out → "Sign in" button; signed-in → username link
// (own pattern list) + sign out.

export default function AuthStatus() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [authOpen, setAuthOpen] = useState(false);

  const username =
    (session?.user as { username?: string; displayUsername?: string } | undefined)?.username ?? null;
  const displayName =
    (session?.user as { displayUsername?: string } | undefined)?.displayUsername ??
    username ??
    session?.user.name ??
    null;

  return (
    <>
      {session ? (
        <div className={styles.headerNav}>
          <Link href={`/community/u/${username ?? ""}`} className={styles.userChip}>
            @{displayName}
          </Link>
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              void authClient.signOut().then(() => router.refresh());
            }}
          >
            Sign out
          </button>
        </div>
      ) : (
        <button type="button" className={styles.btn} onClick={() => setAuthOpen(true)}>
          Sign in
        </button>
      )}

      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} onAuthed={() => router.refresh()} />
      )}
    </>
  );
}
