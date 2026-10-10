type Axis = { axis: string; value: number };

const SIZE = 240;
const CENTER = SIZE / 2;
const MAX_RADIUS = 84;
const RINGS = [0.25, 0.5, 0.75, 1];

function pointFor(index: number, total: number, radius: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / total;
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle)
  };
}

function polygonPoints(total: number, radius: number, values?: number[]) {
  return Array.from({ length: total }, (_, index) => {
    const r = values ? (Math.max(0, Math.min(100, values[index])) / 100) * radius : radius;
    const point = pointFor(index, total, r);
    return `${point.x},${point.y}`;
  }).join(" ");
}

export default function RadarChart({ axes, color = "#78906d" }: { axes: Axis[]; color?: string }) {
  const total = axes.length;
  const values = axes.map((axis) => axis.value);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto w-full max-w-[280px]">
      {RINGS.map((ring) => (
        <polygon
          key={ring}
          points={polygonPoints(total, MAX_RADIUS * ring)}
          fill="none"
          stroke="#d8ddd2"
          strokeWidth={1}
        />
      ))}
      {axes.map((_, index) => {
        const point = pointFor(index, total, MAX_RADIUS);
        return <line key={index} x1={CENTER} y1={CENTER} x2={point.x} y2={point.y} stroke="#d8ddd2" strokeWidth={1} />;
      })}
      <polygon points={polygonPoints(total, MAX_RADIUS, values)} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={2} />
      {axes.map((axis, index) => {
        const labelPoint = pointFor(index, total, MAX_RADIUS + 26);
        return (
          <text
            key={axis.axis}
            x={labelPoint.x}
            y={labelPoint.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-slate-600 text-[11px] font-bold"
          >
            {axis.axis}
          </text>
        );
      })}
    </svg>
  );
}
