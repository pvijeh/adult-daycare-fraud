import type { DensityRow } from "@/lib/types";


type DensityChartProps = {
  rows: DensityRow[];
};


export default function DensityChart({ rows }: DensityChartProps) {
  const ranked = rows
    .filter((row) => row.providersPerThousandSeniors !== null)
    .slice(0, 10);
  const maxRate = Math.max(
    ...ranked.map((row) => row.providersPerThousandSeniors ?? 0),
    1,
  );
  const chartWidth = 760;
  const chartHeight = 390;
  const plotLeft = 76;
  const plotWidth = 620;
  const barHeight = 23;
  const gap = 10;

  return (
    <svg
      aria-label="Top ZIP codes by adult day care provider density"
      className="chart-svg"
      data-export-name="zip-density"
      role="img"
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
    >
      <rect width={chartWidth} height={chartHeight} fill="#ffffff" rx="18" />
      <text className="svg-title" x="28" y="34">
        Highest provider density
      </text>
      <text className="svg-subtitle" x="28" y="55">
        Adult day care providers per 1,000 residents age 65+
      </text>
      {ranked.map((row, index) => {
        const rate = row.providersPerThousandSeniors ?? 0;
        const y = 82 + index * (barHeight + gap);
        const width = Math.max((rate / maxRate) * plotWidth, 2);
        return (
          <g key={row.zcta}>
            <text className="svg-axis-label" textAnchor="end" x={plotLeft - 12} y={y + 16}>
              {row.zcta}
            </text>
            <rect
              fill="url(#densityGradient)"
              height={barHeight}
              rx="5"
              width={width}
              x={plotLeft}
              y={y}
            >
              <title>
                {`${row.zcta}: ${rate.toFixed(2)} per 1,000 seniors, ${row.providerCount} providers`}
              </title>
            </rect>
            <text className="svg-value" x={plotLeft + width + 9} y={y + 16}>
              {rate.toFixed(2)}
            </text>
          </g>
        );
      })}
      <defs>
        <linearGradient id="densityGradient" x1="0" x2="1">
          <stop offset="0%" stopColor="#1f6bff" />
          <stop offset="100%" stopColor="#57c8ff" />
        </linearGradient>
      </defs>
    </svg>
  );
}
