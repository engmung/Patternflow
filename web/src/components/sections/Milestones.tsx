import { milestones } from './milestones-data';

// What has grown out of Patternflow — right under the hero, where the buttons
// used to be. The globe on the left says where it is; this says what people
// have built on it. One line each, no dates, and the ones that have a page
// link to it.
//
// The list is hand-kept in milestones-data.ts. It is not a changelog (that is
// CHANGELOG.md) and not the journal (that is the author's own writing): it is
// the handful of things a stranger would want to know exist, and a
// contributor would want to see their name beside.
export default function Milestones() {
  return (
    <section className="milestones" aria-label="Milestones">
      <span className="milestones-label">Built on it</span>
      <ul className="milestones-list">
        {milestones.map((m) => (
          <li key={m.title} className="milestone">
            <span className="milestone-body">
              {/* Always a new tab, the site's own pages included: this column is
                  a tab of one view, and coming back to it is not one click. */}
              {m.href ? (
                <a href={m.href} target="_blank" rel="noopener">{m.title} ↗</a>
              ) : (
                m.title
              )}
              {m.who && <span className="milestone-who"> — {m.who}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
