'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import poster from '../../../public/media/demo-poster.webp';

export const DEMO_VIDEO_SRC = '/media/demo.webm';

const VISIBLE_RATIO = 0.5;

/** `idle` until the demo is half on screen; then it autoplays, or shows controls for reduced motion. */
type Mode = 'idle' | 'autoplay' | 'controls';

/**
 * The 20-second product demo: muted, looping, inline.
 *
 * The poster is a real, responsive image (high fetch priority, sized per device), so it paints quickly
 * when it is the largest thing on screen. The video is only attached once half of the frame is
 * visible, then laid over the poster, so it never downloads for visitors who don't scroll to it.
 * The frame has a fixed aspect ratio: no layout shift. Reduced-motion users get controls instead
 * of autoplay.
 */
export function DemoVideo() {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Mode>('idle');

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.intersectionRatio < VISIBLE_RATIO) {
          video.current?.pause();
          return;
        }
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setMode(reduced ? 'controls' : 'autoplay');
        if (!reduced && video.current?.currentSrc) void video.current.play().catch(() => undefined);
      },
      { threshold: VISIBLE_RATIO },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={frame}
      className="relative aspect-[8/5] overflow-hidden rounded-xl border bg-surface shadow-xl"
      data-testid="demo"
      data-mode={mode}
    >
      <Image
        src={poster}
        alt="The DashDB editor: a blog schema on the canvas and a generated migration with a safety warning"
        sizes="(min-width: 1024px) 1024px, 100vw"
        // High priority: on phones the poster sits at the fold and can be the LCP element.
        loading="eager"
        fetchPriority="high"
        className="h-full w-full object-cover"
      />
      {mode !== 'idle' && (
        <video
          ref={video}
          src={DEMO_VIDEO_SRC}
          width={poster.width}
          height={poster.height}
          poster={poster.src}
          muted
          loop
          playsInline
          autoPlay={mode === 'autoplay'}
          controls={mode === 'controls'}
          aria-label="A 20-second demo: adding a column, renaming one, adding a table and generating a migration in DashDB"
          className="absolute inset-0 h-full w-full object-cover"
          data-testid="demo-video"
        />
      )}
    </div>
  );
}
