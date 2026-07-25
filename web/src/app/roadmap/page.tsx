import RoadmapMap from './RoadmapMap';
import styles from './Roadmap.module.css';

export const metadata = {
  title: 'Project map — Patternflow',
  description:
    'Where Patternflow has been and where it is going: the full lineage from web-art experiment to the v3.0.0 build release, across PCB, enclosure, firmware, pattern tools, guides, and community.',
};

export default function RoadmapPage() {
  return (
    <main className={styles.fullShell}>
      <RoadmapMap />
    </main>
  );
}
