"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import AuthModal from "./AuthModal";
import SignOutLink from "./SignOutLink";
import styles from "./Community.module.css";

// Header widget: signed-out → "Sign in" button; signed-in → username link
// (own pattern list) + sign out.
//
// The browser asks for its own session after the page arrives, 0.6–0.9 s on
// a phone. Until it has the answer the widget draws the user the layout read
// on the server. Drawing "Sign in" while it waited put a signed-in reader's
// header on two lines and then pulled it back to one, on every page.

export type HeaderUser = {
  name: string;
  username?: string | null;
  displayUsername?: string | null;
};

export default function AuthStatus({ serverUser = null }: { serverUser?: HeaderUser | null }) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [authOpen, setAuthOpen] = useState(false);
  // Only until the first answer. Better Auth marks every later refetch of a
  // signed-out session pending as well, and by then the server's user may be
  // the one who just signed out in another tab.
  const [answered, setAnswered] = useState(!isPending);
  if (!isPending && !answered) setAnswered(true);

  const user: HeaderUser | null = answered ? (session?.user ?? null) : serverUser;
  const username = user?.username ?? null;
  const displayName = user?.displayUsername ?? username ?? user?.name ?? null;

  return (
    <>
      {user ? (
        <div className={styles.headerNav}>
          <Link href={`/community/u/${username ?? ""}`} className={styles.userChip}>
            @{displayName}
          </Link>
          {/* Hidden on a phone, where it lives on your own profile instead —
              see SignOutLink. */}
          <SignOutLink />
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
