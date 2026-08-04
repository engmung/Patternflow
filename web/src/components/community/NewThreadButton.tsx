"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/community/auth-client";
import type { TerritoryListItem } from "@/lib/community/queries";
import AuthModal from "./AuthModal";
import NewThreadModal from "./NewThreadModal";
import styles from "./Community.module.css";

// "New thread", anywhere the workshop needs one outside the drawer (which has
// its own). The button is the whole component: the modal it opens and the
// sign-in gate it falls back to are the same ones the drawer uses, so the two
// entrances cannot drift apart.

export default function NewThreadButton({
  territories,
  initialCode,
}: {
  territories: TerritoryListItem[];
  initialCode: string;
}) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.btn}
        onClick={() => (session ? setOpen(true) : setAuthOpen(true))}
      >
        New thread
      </button>

      {authOpen && (
        <AuthModal onClose={() => setAuthOpen(false)} onAuthed={() => router.refresh()} />
      )}
      {open && (
        <NewThreadModal
          territories={territories}
          initialCode={initialCode}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
