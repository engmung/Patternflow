'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import HeroJournalLink from "@/components/journal/HeroJournalLink";
import { captureEvent } from "@/lib/posthogEvents";
import { CROWD_SUPPLY_URL } from "@/lib/crowdSupply";
import { SHOP_URL } from "@/lib/shop";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

// How many people have made a Patternflow, by the nearest thing to a count
// there is: the community's membership, which tracks it closely. Rounded and
// said as "around", because it is an estimate.
const PEOPLE_WHO_MADE_ONE = 50;

// The film. The hero plays it muted with no controls, and a click on the frame
// opens it on YouTube in a new tab, with sound.
const FILM_ID = '1tkV8-AgdpA';
const FILM_URL = `https://www.youtube.com/watch?v=${FILM_ID}`;

// The player's state in a message from the YouTube player, or null if the
// message does not carry one. The player sends JSON strings, and says each
// state twice: as a state change, and as playerState in its regular report.
// 0 is ended, 1 is playing.
function playerState(raw: unknown): number | null {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof data !== 'object' || data === null) return null;
  const { event, info } = data as { event?: unknown; info?: unknown };
  if (event === 'onStateChange' && typeof info === 'number') return info;
  if (event === 'infoDelivery' && typeof info === 'object' && info !== null) {
    const state = (info as { playerState?: unknown }).playerState;
    if (typeof state === 'number') return state;
  }
  return null;
}

// One play of the video, from the start. The film's length is not written
// down here: the player says when it ends. It reports only to a page that has
// said it is listening, so the embed is told that every 250 ms from load until
// its first answer, as YouTube's own iframe API does. If it never answers, the
// film plays to its end screen and the poster does not come back.
function HeroEmbed({ onEnded }: { onEnded: () => void }) {
  const [isVideoVisible, setIsVideoVisible] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const heardRef = useRef(false);
  const captionsOffRef = useRef(false);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Show the video after 3 seconds (allowing it to initialize and hide controls)
    const showTimer = setTimeout(() => {
      setIsVideoVisible(true);
    }, 3000);

    const onMessage = (e: MessageEvent) => {
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      heardRef.current = true;
      const state = playerState(e.data);
      // The film's caption track turns itself on, and cc_load_policy=0 does
      // not stop it. The player loads captions when it starts playing, so
      // they are unloaded then, once per play.
      if (state === 1 && !captionsOffRef.current) {
        captionsOffRef.current = true;
        frameRef.current.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'unloadModule', args: ['captions'] }),
          'https://www.youtube.com',
        );
      }
      if (state === 0) {
        setIsVideoVisible(false);
        onEnded();
      }
    };
    window.addEventListener('message', onMessage);

    return () => {
      clearTimeout(showTimer);
      window.removeEventListener('message', onMessage);
      if (pingRef.current) clearInterval(pingRef.current);
    };
  }, [onEnded]);

  const listen = () => {
    if (pingRef.current) clearInterval(pingRef.current);
    let pings = 0;
    const ping = () => {
      if (heardRef.current || pings++ >= 40) {
        if (pingRef.current) clearInterval(pingRef.current);
        return;
      }
      frameRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
        'https://www.youtube.com',
      );
    };
    ping();
    pingRef.current = setInterval(ping, 250);
  };

  return (
    <iframe
      ref={frameRef}
      onLoad={listen}
      src={`https://www.youtube.com/embed/${FILM_ID}?autoplay=1&mute=1&controls=0&modestbranding=1&disablekb=1&playsinline=1&rel=0&cc_load_policy=0&enablejsapi=1`}
      title="Patternflow Demo Video"
      frameBorder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
        opacity: isVideoVisible ? 1 : 0,
        transition: 'opacity 0.6s ease-in-out',
      }}
    />
  );
}

// Mounted only while motion is welcome. Turning reduced motion off again
// mounts a fresh one, which hides for its first three seconds like the first.
// The embed takes no clicks, so the button over it is the one way to stop the
// video before it ends (WCAG 2.2.2). A click anywhere else on the frame goes
// to the link over the embed. Stop takes the embed away
// and the poster under it stays. Play mounts a fresh embed, which starts from
// the top, and so does Play after the video has ended.
function HeroVideo() {
  const [state, setState] = useState<'playing' | 'ended' | 'stopped'>('playing');
  const [take, setTake] = useState(0);
  const onEnded = useCallback(() => setState('ended'), []);
  const playing = state === 'playing';

  return (
    <>
      {state !== 'stopped' && <HeroEmbed key={take} onEnded={onEnded} />}
      <button
        type="button"
        className="hero-video-toggle"
        aria-label={playing ? 'Stop the video' : 'Play the video'}
        onClick={() => {
          if (playing) {
            setState('stopped');
          } else {
            setTake((n) => n + 1);
            setState('playing');
          }
        }}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
          {playing ? (
            <rect x="1" y="1" width="10" height="10" fill="currentColor" />
          ) : (
            <path d="M2 0.5 11.5 6 2 11.5Z" fill="currentColor" />
          )}
        </svg>
      </button>
    </>
  );
}

export default function Hero() {
  // The embed starts by itself, so someone who has asked their system for less
  // motion gets the poster and no embed at all. The server cannot know, so it
  // sends the poster alone and the client adds the video after hydration.
  const reducedMotion = useReducedMotion();

  return (
    <section className="hero">
      <HeroJournalLink />
      <div className="hero-copy">
        <h1>
          <em className="wordmark">Patternflow</em>
        </h1>
        <div className="kicker">An open-source LED synthesizer. Play light with your fingertips.</div>
        {/* The one thing the page never said: what you actually do with it.
            Sits above the video so it reads before the picture, not after. */}
        <p className="hero-spec">Four knobs. The pattern answers as you turn them.</p>
        <div style={{
          /* 14, not 24: the last few pixels that put the CTA row above the
             fold on an 820px-tall laptop. */
          marginBottom: '14px',
          overflow: 'hidden', 
          border: '1px solid var(--pf-rule)',
          position: 'relative',
          paddingBottom: '56.25%',
          height: 0,
          isolation: 'isolate'
        }}>
          {/* Static fallback and loading placeholder. The file is the 4032-wide
              camera original, 2.1 MB, drawn at 340px on a phone and 578px at
              most on a desktop, so it goes through the image optimizer at the
              column's width. The column is the viewport less the deck's 24px
              gutters up to 900px, and the copy's 580px cap above. It is the
              largest thing on the first screen, so it loads at once. */}
          <Image
            src="/product_v2.jpg"
            alt="Patternflow physical device"
            fill
            sizes="(max-width: 900px) calc(100vw - 48px), 580px"
            loading="eager"
            fetchPriority="high"
            style={{ objectFit: 'cover' }}
          />
          {/* The whole frame opens the film on YouTube, poster or video, and
              with reduced motion too. It lies over the embed and under the
              Stop button, which keeps its own click. */}
          <a
            className="hero-video-link"
            href={FILM_URL}
            target="_blank"
            rel="noopener"
            aria-label="Watch the film on YouTube"
            onClick={() => captureEvent('youtube_film_clicked', {
              surface: 'hero',
              destination: 'youtube',
            })}
          />
          {!reducedMotion && <HeroVideo />}
        </div>
        {/* L3 — the strongest line we have, per the manifesto: a description of
            how the system works, with nothing in it to disbelieve. */}
        <p className="lede">Every Patternflow plays every pattern we make.</p>
        {/* The second fact, in the same voice as the first: how many have. */}
        <p className="lede">Around {PEOPLE_WHO_MADE_ONE} people have made one so far.</p>
        {/* Get One leads: it is the action that costs the reader something, so
            it takes the solid weight. The note sits under it — not under both —
            so it is unambiguous which button ships worldwide. */}
        <div className="hero-cta-row" aria-label="Patternflow actions">
          <a
            className="hero-cta hero-cta-primary"
            href={CROWD_SUPPLY_URL}
            target="_blank"
            rel="noopener"
            onClick={() => captureEvent('crowd_supply_clicked', {
              surface: 'hero',
              destination: 'crowd_supply',
              via: 'direct',
            })}
          >
            Get One
          </a>
          <a
            className="hero-cta hero-cta-secondary"
            href="https://github.com/engmung/Patternflow"
            target="_blank"
            rel="noopener"
            onClick={() => captureEvent('github_cta_clicked', {
              surface: 'hero',
              destination: 'github_repository',
            })}
          >
            Build it — GitHub
          </a>
          <p className="hero-cta-note">Crowd Supply · ships worldwide</p>
        </div>
        {/* The nav's Shop box was too small to find. Under the two buttons, so
            it does not compete with Get One. */}
        <a
          className="hero-shop"
          href={SHOP_URL}
          target="_blank"
          rel="noopener"
          onClick={() => captureEvent('shop_clicked', {
            surface: 'hero',
            destination: 'shop',
          })}
        >
          {/* The Origin Grid poster, from the shop's own render. */}
          <Image
            className="hero-shop-poster"
            src="/shop/origin_grid_poster.png"
            alt=""
            width={90}
            height={120}
          />
          <span className="hero-shop-new">New</span>
          <span>Poster <span aria-hidden="true">↗</span></span>
        </a>
      </div>
    </section>
  );
}
