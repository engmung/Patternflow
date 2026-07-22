"use client";

import { useState } from "react";
import { authClient, dummyEmailFor } from "@/lib/community/auth-client";
import { PASSWORD_MIN, USERNAME_RE } from "@/lib/community/validate";
import styles from "./Community.module.css";

// Username + password auth. Email is an optional recovery field only — when
// left empty a hidden dummy address satisfies Better Auth's schema.

type Props = {
  onClose: () => void;
  /** Called after a successful sign-in/up (session is established). */
  onAuthed?: () => void;
  /** Renders without its own overlay when embedded in another modal. */
  embedded?: boolean;
};

export default function AuthModal({ onClose, onAuthed, embedded = false }: Props) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [usernameInput, setUsernameInput] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const name = usernameInput.trim();
    setError(null);

    if (!USERNAME_RE.test(name)) {
      setError("Username: 3–20 characters, letters/digits/underscore only.");
      return;
    }
    if (password.length < PASSWORD_MIN) {
      setError(`Password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }

    setBusy(true);
    try {
      if (tab === "signup") {
        const recovery = email.trim();
        const result = await authClient.signUp.email({
          email: recovery.length > 0 ? recovery : dummyEmailFor(name),
          password,
          name,
          username: name,
        });
        if (result.error) {
          setError(result.error.message ?? "Sign-up failed.");
          return;
        }
      } else {
        const result = await authClient.signIn.username({ username: name, password });
        if (result.error) {
          setError(result.error.message ?? "Sign-in failed.");
          return;
        }
      }
      onAuthed?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <>
      <div className={styles.authTabs}>
        <button type="button" data-active={tab === "signin"} onClick={() => setTab("signin")}>
          Sign in
        </button>
        <button type="button" data-active={tab === "signup"} onClick={() => setTab("signup")}>
          Create account
        </button>
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Username</span>
        <input
          className={styles.textInput}
          value={usernameInput}
          autoComplete="username"
          spellCheck={false}
          onChange={(event) => setUsernameInput(event.target.value)}
        />
        {tab === "signup" && (
          <span className={styles.fieldHint}>3–20 characters: a–z, 0–9, underscore.</span>
        )}
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Password</span>
        <input
          className={styles.textInput}
          type="password"
          value={password}
          autoComplete={tab === "signup" ? "new-password" : "current-password"}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
        />
        {tab === "signup" && <span className={styles.fieldHint}>At least 8 characters.</span>}
      </label>

      {tab === "signup" && (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Email (optional, recovery only)</span>
          <input
            className={styles.textInput}
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
          />
          <span className={styles.fieldHint}>
            Without an email, a lost password cannot be recovered. No verification mail is sent.
          </span>
        </label>
      )}

      {error && <div className={styles.formError}>{error}</div>}

      <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void submit()}>
        {busy ? "…" : tab === "signup" ? "Create account" : "Sign in"}
      </button>
    </>
  );

  if (embedded) return <div className={styles.modalBody}>{body}</div>;

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span>Patternflow Community</span>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.modalBody}>{body}</div>
      </div>
    </div>
  );
}
