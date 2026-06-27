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
          Thanks for following Patternflow. The finished product is now in pre-launch on Crowd Supply — we&apos;ll let you know when the campaign opens.
        </p>
        <Link href="/">Back to Patternflow</Link>
      </div>
    </main>
  );
}
