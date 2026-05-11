'use client';

import { captureEvent } from '@/lib/posthogEvents';
import Link from 'next/link';
import { useEffect } from 'react';

export default function WaitlistThanksPage() {
  useEffect(() => {
    captureEvent('kit_waitlist_submitted', {
      surface: 'tally_redirect',
    });
  }, []);

  return (
    <main className="waitlist-thanks">
      <div>
        <p className="mono">Waitlist</p>
        <h1>You&apos;re on the list.</h1>
        <p>
          Thanks for following Patternflow. The kit path will open after the next build round is ready.
        </p>
        <Link href="/">Back to Patternflow</Link>
      </div>
    </main>
  );
}
