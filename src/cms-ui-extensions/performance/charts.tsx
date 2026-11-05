import {Button, Group, Text} from '@optiaxiom/react';
import {useEffect, useRef, useState, type KeyboardEvent, type PointerEvent} from 'react';

// Small hand-built charts for the Performance sidebar, following the dataviz method:
// one hue (validated: #2a78d6 light on #ffffff, #3987e5 dark on #1a1a19, both PASS),
// 2px line + ~10% area wash, an 8px end dot with a 2px surface ring, hairline solid
// grid, text in text tokens only, a crosshair tooltip, and a table view so the tooltip
// never gates a value.

export const CHART_STYLE = `
.viz-root {
  --viz-surface: #ffffff;
  --viz-series: #2a78d6;
  --viz-grid: #e6e5e1;
  --viz-text: #0b0b0b;
  --viz-text-secondary: #52514e;
  --viz-text-muted: #7a7975;
  --viz-tooltip-bg: #0b0b0b;
  --viz-tooltip-text: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root:where(:not([data-theme="light"])) .viz-root {
    --viz-surface: #1a1a19;
    --viz-series: #3987e5;
    --viz-grid: #34332f;
    --viz-text: #ffffff;
    --viz-text-secondary: #c3c2b7;
    --viz-text-muted: #9a998f;
    --viz-tooltip-bg: #ffffff;
    --viz-tooltip-text: #0b0b0b;
  }
}
:root[data-theme="dark"] .viz-root {
  --viz-surface: #1a1a19;
  --viz-series: #3987e5;
  --viz-grid: #34332f;
  --viz-text: #ffffff;
  --viz-text-secondary: #c3c2b7;
  --viz-text-muted: #9a998f;
  --viz-tooltip-bg: #ffffff;
  --viz-tooltip-text: #0b0b0b;
}
`;

/** 1,284 / 12.9K / 4.2M */
export function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return Math.round(n).toLocaleString('en-US');
}

const DAY = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', timeZone: 'UTC'});
const shortDate = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`));

/** A clean axis top: 1, 2 or 5 times a power of ten, at or above the max. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 5, 10]) if (step * power >= max) return step * power;
  return 10 * power;
}

export function StatTile({
  label,
  value,
  previous,
  format = compact,
  upIsGood = true,
}: {
  label: string;
  value: number;
  previous: number;
  format?: (n: number) => string;
  upIsGood?: boolean;
}) {
  const change = previous > 0 ? (value - previous) / previous : null;
  const good = change === null || change === 0 ? null : change > 0 === upIsGood;
  return (
    <Group flexDirection="column" gap="2" style={{minWidth: 0}}>
      <Text color="fg.secondary" fontSize="xs">
        {label}
      </Text>
      <Text fontSize="lg" fontWeight="600">
        {format(value)}
      </Text>
      <Text color={good === null ? 'fg.tertiary' : good ? 'fg.success' : 'fg.error'} fontSize="xs">
        {change === null
          ? 'no earlier data'
          : `${change > 0 ? '▲' : change < 0 ? '▼' : '='} ${Math.abs(change * 100).toFixed(0)}% vs previous 28 days`}
      </Text>
    </Group>
  );
}

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(160, Math.floor(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return {ref, width};
}

const HEIGHT = 132;
const PAD = {top: 10, right: 40, bottom: 20, left: 34};

/** Daily views: one series, so no legend - the heading above names it. */
export function TrendChart({points}: {points: Array<{date: string; views: number}>}) {
  const {ref, width} = useWidth(280);
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  if (points.length < 2) return null;

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const top = niceMax(Math.max(...points.map((p) => p.views)));
  const x = (i: number) => PAD.left + (i * plotW) / (points.length - 1);
  const y = (v: number) => PAD.top + plotH * (1 - v / top);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.views).toFixed(1)}`).join('');
  const area = `${line}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
  const last = points.length - 1;
  const ticks = [0, top / 2, top];

  const nearest = (clientX: number, rect: DOMRect) => {
    const i = Math.round(((clientX - rect.left - PAD.left) / plotW) * last);
    return Math.min(last, Math.max(0, i));
  };
  const onPointer = (e: PointerEvent<SVGRectElement>) =>
    setActive(nearest(e.clientX, (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect()));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setActive((i) => Math.min(last, Math.max(0, (i ?? last) + (e.key === 'ArrowRight' ? 1 : -1))));
  };

  const point = active === null ? null : points[active];
  const tooltipLeft = active === null ? 0 : Math.min(Math.max(x(active) - 50, 0), width - 100);

  return (
    <Group flexDirection="column" gap="4">
      {asTable ? (
        <table style={{borderCollapse: 'collapse', fontSize: 12, width: '100%'}}>
          <thead>
            <tr>
              <th style={{textAlign: 'left', fontWeight: 600, padding: '2px 0'}}>Day</th>
              <th style={{textAlign: 'right', fontWeight: 600, padding: '2px 0'}}>Views</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <td style={{padding: '2px 0'}}>{shortDate(p.date)}</td>
                <td style={{padding: '2px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>
                  {p.views.toLocaleString('en-US')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div
          aria-label={`Daily page views, ${shortDate(points[0].date)} to ${shortDate(points[last].date)}. Use the arrow keys to read each day.`}
          onBlur={() => setActive(null)}
          onFocus={() => setActive(last)}
          onKeyDown={onKey}
          ref={ref}
          role="img"
          style={{position: 'relative', width: '100%', outlineOffset: 2}}
          tabIndex={0}
        >
          <svg height={HEIGHT} style={{display: 'block'}} width={width}>
            {ticks.map((t) => (
              <g key={t}>
                <line stroke="var(--viz-grid)" strokeWidth={1} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
                <text fill="var(--viz-text-muted)" fontSize={10} textAnchor="end" x={PAD.left - 6} y={y(t) + 3}>
                  {compact(t)}
                </text>
              </g>
            ))}
            <path d={area} fill="var(--viz-series)" fillOpacity={0.1} />
            <path d={line} fill="none" stroke="var(--viz-series)" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
            <circle cx={x(last)} cy={y(points[last].views)} fill="var(--viz-series)" r={4} stroke="var(--viz-surface)" strokeWidth={2} />
            <text fill="var(--viz-text)" fontSize={11} fontWeight={600} x={x(last) + 8} y={y(points[last].views) + 4}>
              {compact(points[last].views)}
            </text>
            <text fill="var(--viz-text-muted)" fontSize={10} x={PAD.left} y={HEIGHT - 4}>
              {shortDate(points[0].date)}
            </text>
            <text fill="var(--viz-text-muted)" fontSize={10} textAnchor="end" x={width - PAD.right} y={HEIGHT - 4}>
              {shortDate(points[last].date)}
            </text>
            {point && active !== null && (
              <g pointerEvents="none">
                <line stroke="var(--viz-text-muted)" strokeWidth={1} x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} />
                <circle cx={x(active)} cy={y(point.views)} fill="var(--viz-series)" r={4} stroke="var(--viz-surface)" strokeWidth={2} />
              </g>
            )}
            <rect
              fill="transparent"
              height={plotH + PAD.top}
              onPointerLeave={() => setActive(null)}
              onPointerMove={onPointer}
              width={plotW + 16}
              x={PAD.left - 8}
              y={0}
            />
          </svg>
          {point && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: tooltipLeft,
                width: 100,
                padding: '4px 8px',
                borderRadius: 4,
                background: 'var(--viz-tooltip-bg)',
                color: 'var(--viz-tooltip-text)',
                fontSize: 12,
                lineHeight: 1.3,
                pointerEvents: 'none',
              }}
            >
              <div style={{fontWeight: 600}}>{point.views.toLocaleString('en-US')} views</div>
              <div style={{opacity: 0.75}}>{shortDate(point.date)}</div>
            </div>
          )}
        </div>
      )}
      <Button appearance="subtle" onClick={() => setAsTable((v) => !v)} size="sm">
        {asTable ? 'Show as chart' : 'Show as table'}
      </Button>
    </Group>
  );
}

/**
 * Horizontal bars for one measure over nominal categories: one color for every bar (no
 * value ramp), <=24px thick, square at the baseline with a 4px rounded data-end, the
 * value at the tip and the label above it in text tokens.
 */
export function BarList({rows, unit}: {rows: Array<{label: string; value: number}>; unit: string}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Group flexDirection="column" gap="8">
      {rows.map((r) => (
        <div key={r.label} title={`${r.label}: ${r.value.toLocaleString('en-US')} ${unit}`}>
          <div style={{color: 'var(--viz-text-secondary)', fontSize: 12, overflowWrap: 'anywhere'}}>{r.label}</div>
          <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
            <div
              style={{
                width: `${Math.max(2, (r.value / max) * 78)}%`,
                height: 8,
                background: 'var(--viz-series)',
                borderRadius: '0 4px 4px 0',
              }}
            />
            <span style={{color: 'var(--viz-text)', fontSize: 12, fontWeight: 600}}>{compact(r.value)}</span>
          </div>
        </div>
      ))}
    </Group>
  );
}
