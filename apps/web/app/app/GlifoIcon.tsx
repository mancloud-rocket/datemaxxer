'use client';

import { useEffect, useRef } from 'react';
import { buildGlifo } from '../../lib/glifos';

export function GlifoIcon(props: { slug: string; size?: number; stroke?: number; className?: string }) {
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.innerHTML = '';
    const svg = buildGlifo(props.slug, { size: props.size, stroke: props.stroke });
    el.appendChild(svg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.slug, props.size, props.stroke]);

  return <span ref={root} className={props.className} style={{ display: 'inline-flex' }} />;
}
