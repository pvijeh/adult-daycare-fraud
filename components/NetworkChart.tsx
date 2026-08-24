import type {
  NetworkCluster,
  NetworkNode,
  NetworkNodeType,
} from "@/lib/types";


type NetworkChartProps = {
  cluster: NetworkCluster;
};

type PositionedNode = NetworkNode & {
  x: number;
  y: number;
};

const typeOrder: NetworkNodeType[] = [
  "provider",
  "official",
  "phone",
  "address",
];

const typeStyles: Record<
  NetworkNodeType,
  { color: string; name: string; x: number }
> = {
  provider: { color: "#1f6bff", name: "Facility", x: 110 },
  official: { color: "#1f9d69", name: "Officer", x: 350 },
  phone: { color: "#ef476f", name: "Phone", x: 590 },
  address: { color: "#f59e0b", name: "Address", x: 830 },
};

function positionNodes(cluster: NetworkCluster): PositionedNode[] {
  return typeOrder.flatMap((type) => {
    const nodes = cluster.nodes.filter((node) => node.type === type);
    const spacing = 390 / Math.max(nodes.length, 1);
    return nodes.map((node, index) => ({
      ...node,
      x: typeStyles[type].x,
      y: 95 + spacing * (index + 0.5),
    }));
  });
}

function truncate(label: string): string {
  return label.length > 25 ? `${label.slice(0, 23)}…` : label;
}

export default function NetworkChart({ cluster }: NetworkChartProps) {
  const nodes = positionNodes(cluster);
  const positions = new Map(nodes.map((node) => [node.id, node]));

  return (
    <svg
      aria-label="Corporate relationship network"
      className="chart-svg network-svg"
      data-export-name="corporate-network"
      role="img"
      viewBox="0 0 940 540"
    >
      <rect width="940" height="540" fill="#ffffff" rx="18" />
      <text className="svg-title" x="28" y="34">
        Shared identifiers connect {cluster.providerCount} facilities
      </text>
      <text className="svg-subtitle" x="28" y="55">
        Follow each line from an NPI registration to an official, phone, or address
      </text>
      {typeOrder.map((type) => (
        <g key={type}>
          <circle cx={typeStyles[type].x - 50} cy="77" fill={typeStyles[type].color} r="5" />
          <text className="svg-legend" x={typeStyles[type].x - 40} y="81">
            {typeStyles[type].name}
          </text>
        </g>
      ))}
      {cluster.edges.map((edge) => {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) {
          return null;
        }
        return (
          <line
            key={`${edge.source}-${edge.target}`}
            opacity="0.52"
            stroke="#91a0b4"
            strokeWidth="1.5"
            x1={source.x}
            x2={target.x}
            y1={source.y}
            y2={target.y}
          />
        );
      })}
      {nodes.map((node) => (
        <g key={node.id}>
          <circle
            cx={node.x}
            cy={node.y}
            fill={typeStyles[node.type].color}
            r={node.type === "provider" ? 12 : 9}
            stroke="#ffffff"
            strokeWidth="3"
          >
            <title>{node.label}</title>
          </circle>
          <text
            className="svg-node-label"
            textAnchor="middle"
            x={node.x}
            y={node.y + 24}
          >
            {truncate(node.label)}
          </text>
        </g>
      ))}
    </svg>
  );
}
