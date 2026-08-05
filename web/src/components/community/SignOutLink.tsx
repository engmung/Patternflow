"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import styles from "./Community.module.css";

// Signing out is necessary and almost never wanted, so it stays a faint mono
// link rather than taking a button's weight.
//
// It renders in two places and is visible in exactly one of them at a time:
// beside the handle in the header on a desktop, and on your own profile on a
// phone — where the header has no room for it and the "You" tab is where
// people look for account things anyway. The media query in the stylesheet
// picks; both call the same endpoint.

export default function SignOutLink({ className }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className ? `${styles.signOutLink} ${className}` : styles.signOutLink}
      onClick={() => {
        void authClient.signOut().then(() => router.refresh());
      }}
    >
      sign out
    </button>
  );
}
