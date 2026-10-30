import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';
import { MARK_SIZE, markGeometry } from './logo-geometry';

function MarkShapes() {
  const { card, header, rows, edge, node } = markGeometry;
  return (
    <>
      <rect
        x={card.x}
        y={card.y}
        width={card.width}
        height={card.height}
        rx={card.rx}
        className="stroke-current"
        strokeWidth={card.strokeWidth}
        fill="none"
      />
      <path d={header} className="fill-primary" />
      {rows.map(([x1, x2, y]) => (
        <line
          key={y}
          x1={x1}
          x2={x2}
          y1={y}
          y2={y}
          className="stroke-text-muted"
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      <line
        x1={edge.x1}
        x2={edge.x2}
        y1={edge.y}
        y2={edge.y}
        className="stroke-current"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={node.cx} cy={node.cy} r={node.r} className="fill-accent" />
    </>
  );
}

type LogoProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'>;

/** The table-node glyph on its own (favicon-style). Decorative unless given an aria-label. */
export function LogoMark({ className, ...props }: LogoProps) {
  const labelled = props['aria-label'] !== undefined;
  return (
    <svg
      viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`}
      className={cn('size-8 text-text', className)}
      role={labelled ? 'img' : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
      {...props}
    >
      <MarkShapes />
    </svg>
  );
}

/** The "DashDB" wordmark with the glyph. */
export function Logo({ className, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 116 32"
      className={cn('h-8 w-auto text-text', className)}
      role="img"
      aria-label="DashDB"
      focusable="false"
      {...props}
    >
      <MarkShapes />
      <text
        x={38}
        y={22.5}
        className="fill-current font-sans"
        fontSize={19}
        fontWeight={650}
        letterSpacing="-0.02em"
      >
        DashDB
      </text>
    </svg>
  );
}
