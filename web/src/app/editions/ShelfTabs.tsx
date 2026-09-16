import Link from "next/link";
import styles from "./Editions.module.css";

// The two views of the same thing, as a pair of tabs where the page title
// would be: "Firmware" is the shelf (what you install), "Features" is the
// catalogue (what you are choosing between). The current one IS the h1; the
// other is a link in the same size, dimmed. Two routes still — deep links
// and search keep working — this just makes the other one impossible to
// miss, which a sentence in the lede was not.
const TABS = [
  { id: "firmware", href: "/editions", label: "Firmware" },
  { id: "features", href: "/features", label: "Features" },
] as const;

export type ShelfTab = (typeof TABS)[number]["id"];

export default function ShelfTabs({ active }: { active: ShelfTab }) {
  return (
    <nav className={styles.tabs} aria-label="Firmware and features">
      {TABS.map((t) =>
        t.id === active ? (
          <h1 key={t.id} className={styles.title} aria-current="page">
            {t.label}
          </h1>
        ) : (
          <Link
            key={t.id}
            href={t.href}
            className={`${styles.title} ${styles.tabLink}`}
          >
            {t.label}
          </Link>
        ),
      )}
    </nav>
  );
}
