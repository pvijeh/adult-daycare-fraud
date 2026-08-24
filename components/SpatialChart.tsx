import type { SpatialOutlier } from "@/lib/types";


type SpatialChartProps = {
  rows: SpatialOutlier[];
};


export default function SpatialChart({ rows }: SpatialChartProps) {
  const width = 760;
  const height = 430;
  const left = 76;
  const right = 34;
  const top = 105;
  const bottom = 62;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxArea = Math.max(...rows.map((row) => row.commercialArea), 1);
  const maxProviders = Math.max(...rows.map((row) => row.providerCount), 3);
  const x = (value: number) => left + (value / maxArea) * plotWidth;
  const y = (value: number) =>
    top + plotHeight - ((value - 2) / Math.max(maxProviders - 2, 1)) * plotHeight;

  return (
    <svg
      aria-label="Commercial area compared with provider licenses"
      className="chart-svg"
      data-export-name="spatial-outliers"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <rect width={width} height={height} fill="#ffffff" rx="18" />
      <text className="svg-title" x="28" y="34">
        Space versus license concentration
      </text>
      <text className="svg-subtitle" x="28" y="55">
        Buildings with three or more distinct provider registrations
      </text>
      {[0, 0.25, 0.5, 0.75, 1].map((step) => {
        const gridX = left + step * plotWidth;
        return (
          <g key={step}>
            <line
              stroke="#e5eaf2"
              strokeDasharray="4 5"
              x1={gridX}
              x2={gridX}
              y1={top}
              y2={top + plotHeight}
            />
            <text className="svg-axis-label" textAnchor="middle" x={gridX} y={height - 35}>
              {Math.round(maxArea * step).toLocaleString()}
            </text>
          </g>
        );
      })}
      <line stroke="#9aa8ba" x1={left} x2={left} y1={top} y2={top + plotHeight} />
      <line
        stroke="#9aa8ba"
        x1={left}
        x2={left + plotWidth}
        y1={top + plotHeight}
        y2={top + plotHeight}
      />
      {rows.map((row, index) => (
        <g key={`${row.cleanAddress}-${row.zipCode}`}>
          <circle
            cx={x(row.commercialArea)}
            cy={y(row.providerCount)}
            fill={["#ff7a4d", "#f33f62", "#8c52ff", "#1f9d8a"][index % 4]}
            opacity="0.88"
            r={10 + row.providerCount * 2}
            stroke="#ffffff"
            strokeWidth="3"
          >
            <title>
              {`${row.cleanAddress}: ${row.providerCount} licenses, ${row.commercialArea.toLocaleString()} commercial sq ft`}
            </title>
          </circle>
          <text
            className="svg-point-label"
            textAnchor="middle"
            x={x(row.commercialArea)}
            y={y(row.providerCount) - 18}
          >
            {row.zipCode}
          </text>
        </g>
      ))}
      <text className="svg-axis-title" textAnchor="middle" x={left + plotWidth / 2} y={height - 8}>
        Commercial area (square feet)
      </text>
      <text
        className="svg-axis-title"
        textAnchor="middle"
        transform={`rotate(-90 18 ${top + plotHeight / 2})`}
        x="18"
        y={top + plotHeight / 2}
      >
        Distinct licenses
      </text>
    </svg>
  );
}
