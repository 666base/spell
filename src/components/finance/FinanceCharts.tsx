import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  CHART_COLORS,
  SANKEY_BALANCE_ID,
  SANKEY_HEIGHT,
  SANKEY_SAVED_ID,
  cashFlowSankey,
  formatMoney,
  formatPercentChange,
  formatShare,
  heatmapSummary,
  heatmapWeekLabels,
  layoutSankey,
  layoutScatter,
  percentChange,
  recurringScatter,
  shiftMonth,
  spendingByCategory,
  type ScatterPoint,
} from "../../lib/finance";
import { cn } from "../../lib/utils";
import type { FinanceWorkspace } from "../../types/note";

function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const apply = () => {
      const next = Math.round(node.clientWidth);
      setWidth(next > 0 ? next : 640);
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

function deltaTone(change: number | null | undefined, invert = false) {
  if (change == null || change === 0) return "flat";
  return (invert ? change < 0 : change > 0) ? "up" : "down";
}

function ChartHead({
  title,
  value,
  change,
  invertChange = false,
  meta,
  legend,
}: {
  title: string;
  value: string;
  change?: number | null;
  invertChange?: boolean;
  meta?: string;
  legend?: ReactNode;
}) {
  return (
    <header className="money-card-head">
      <div>
        <h2 className="money-card-title">{title}</h2>
        <p className="money-card-value">{value}</p>
        {change != null && (
          <p className={cn("money-kpi-delta", `is-${deltaTone(change, invertChange)}`)}>
            {formatPercentChange(change)}
          </p>
        )}
      </div>
      {(meta || legend) && (
        <div className="money-card-aside">
          {legend}
          {meta && <p className="money-card-meta">{meta}</p>}
        </div>
      )}
    </header>
  );
}

export function CashFlowCard({
  workspace,
  month,
  currency,
  onSelectCategory,
}: {
  workspace: FinanceWorkspace;
  month: string;
  currency: string;
  onSelectCategory: (name: string) => void;
}) {
  const [frameRef, width] = useChartWidth();
  const [hover, setHover] = useState<string | null>(null);
  const chart = cashFlowSankey(workspace, month);
  const laid = layoutSankey(chart, width);
  const previous = cashFlowSankey(workspace, shiftMonth(month, -1)).income;
  const hoveredNode = laid.nodes.find((node) => node.id === hover);
  const hoveredLink = laid.links.find((link) => `${link.source}>${link.target}` === hover);
  const headline = hoveredLink
    ? formatMoney(hoveredLink.amountCents, currency)
    : hoveredNode
      ? formatMoney(hoveredNode.amountCents, currency)
      : formatMoney(chart.income, currency);
  const change = percentChange(chart.income, previous);

  const isActive = (id: string) => {
    if (!hover) return true;
    if (hover === id) return true;
    if (hover.includes(">")) {
      const [source, target] = hover.split(">");
      return id === source || id === target || hover === `${source}>${target}`;
    }
    return laid.links.some((link) => {
      const key = `${link.source}>${link.target}`;
      return (link.source === hover || link.target === hover) && (id === link.source || id === link.target || id === key);
    });
  };

  return (
    <section className="money-card money-card-flow">
      <ChartHead
        title="Cash flow"
        value={headline}
        change={change}
        meta="This month"
        legend={(
          <p className="money-card-legend">
            <span className="money-dot is-income">Income</span>
            <span className="money-dot is-spend">Spending</span>
          </p>
        )}
      />
      {chart.nodes.length === 0 ? (
        <p className="money-card-empty">No cash flow this month</p>
      ) : (
        <div ref={frameRef} className="money-sankey-frame">
          {width > 0 && (
          <svg
            key={month}
            className={cn("money-sankey", hover && "is-hovering")}
            viewBox={`0 0 ${width} ${SANKEY_HEIGHT}`}
            role="img"
            aria-label="Cash flow from income sources to spending"
            onMouseLeave={() => setHover(null)}
          >
            {laid.links.map((link) => {
              const id = `${link.source}>${link.target}`;
              return (
                <path
                  key={id}
                  className={cn("money-sankey-link", isActive(id) && "is-active")}
                  d={link.d}
                  fill={link.color}
                  onMouseEnter={() => setHover(id)}
                />
              );
            })}
            {laid.nodes.map((node) => {
              const clickable = node.id !== SANKEY_SAVED_ID && node.id !== SANKEY_BALANCE_ID;
              return (
                <g
                  key={node.id}
                  className={cn("money-sankey-node", isActive(node.id) && "is-active")}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  aria-label={`${node.name} ${formatMoney(node.amountCents, currency)}`}
                  onMouseEnter={() => setHover(node.id)}
                  onClick={() => clickable && onSelectCategory(node.name)}
                  onKeyDown={(event) => {
                    if (!clickable) return;
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelectCategory(node.name);
                  }}
                >
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx="3"
                    fill={node.side === "source" ? node.color : "var(--color-text-muted)"}
                  />
                  <text
                    className="money-sankey-label"
                    x={node.side === "source" ? node.x - 8 : node.x + node.width + 8}
                    y={node.y + node.height / 2}
                    textAnchor={node.side === "source" ? "end" : "start"}
                    dominantBaseline="middle"
                  >
                    {node.side === "source"
                      ? node.name
                      : `${node.name} · ${formatShare(node.amountCents, Math.max(chart.income, chart.expenses))}`}
                  </text>
                </g>
              );
            })}
          </svg>
          )}
        </div>
      )}
    </section>
  );
}

export function CategoryCard({
  slices,
  currency,
  total,
  change,
  selected,
  onSelect,
}: {
  slices: ReturnType<typeof spendingByCategory>;
  currency: string;
  total: number;
  change: number | null;
  selected: string;
  onSelect: (name: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const rings = slices.slice(0, 5);
  const peak = Math.max(1, ...rings.map((slice) => slice.amountCents));
  const hovered = hover ?? (selected !== "all" ? selected : null);

  return (
    <section className="money-card money-card-category">
      <ChartHead
        title="Spending by category"
        value={formatMoney(total, currency)}
        change={change}
        invertChange
        meta="This month"
      />
      {rings.length === 0 ? (
        <div className="money-category">
          <svg viewBox="0 0 40 40" className="money-rings" aria-hidden="true">
            <circle cx="20" cy="20" r="15.5" className="money-ring-track" />
          </svg>
          <p className="money-card-empty">No spending this month</p>
        </div>
      ) : (
        <div className="money-category">
          <svg viewBox="0 0 40 40" className={cn("money-rings", hovered && "is-hovering")} aria-hidden="true">
            {rings.map((slice, index) => {
              const radius = 7 + index * 2.8;
              const circumference = 2 * Math.PI * radius;
              const length = (slice.amountCents / peak) * circumference;
              return (
                <g key={slice.name}>
                  <circle cx="20" cy="20" r={radius} className="money-ring-track" />
                  <circle
                    className={cn(
                      "money-ring-arc",
                      (hovered == null || hovered === slice.name) && "is-active",
                      selected === slice.name && "is-selected",
                    )}
                    cx="20"
                    cy="20"
                    r={radius}
                    stroke={CHART_COLORS[index % CHART_COLORS.length]}
                    strokeDasharray={`${length} ${circumference}`}
                    style={{ ["--ring-track" as string]: `${circumference}` }}
                    transform="rotate(-90 20 20)"
                    onClick={() => onSelect(slice.name)}
                  />
                </g>
              );
            })}
          </svg>
          <ul className="money-category-list">
            {rings.map((slice, index) => (
              <li key={slice.name}>
                <button
                  type="button"
                  className={cn("money-category-item", selected === slice.name && "is-selected")}
                  aria-pressed={selected === slice.name}
                  onClick={() => onSelect(slice.name)}
                  onMouseEnter={() => setHover(slice.name)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span
                    className="money-dot-swatch"
                    style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                  />
                  <span className="money-category-name">{slice.name}</span>
                  <span className="money-category-amount">{formatMoney(slice.amountCents, currency)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function RecurringCard({
  workspace,
  currency,
  burn,
  onSelect,
  onAdd,
}: {
  workspace: FinanceWorkspace;
  currency: string;
  burn: number;
  onSelect: (id: string) => void;
  onAdd?: () => void;
}) {
  const [frameRef, width] = useChartWidth();
  const [hover, setHover] = useState<ScatterPoint | null>(null);
  const points = recurringScatter(workspace);
  const laid = layoutScatter(points, width, 188);
  const height = 188;

  return (
    <section className="money-card money-card-scatter">
      <ChartHead
        title="Recurring"
        value={hover ? hover.name : formatMoney(burn, currency)}
        meta={hover ? formatMoney(hover.y, currency) + " / mo" : "Monthly"}
      />
      {points.length === 0 ? (
        onAdd ? (
          <button type="button" className="money-card-empty is-action" onClick={onAdd}>
            Add a subscription
          </button>
        ) : (
          <p className="money-card-empty">No subscriptions yet</p>
        )
      ) : (
        <div ref={frameRef} className="money-scatter-frame">
          {width > 0 && (
          <svg
            className={cn("money-scatter", hover && "is-hovering")}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label="Subscriptions by due date and monthly cost"
            onMouseLeave={() => setHover(null)}
          >
            {laid.yTicks.map((tick) => (
              <g key={`y-${tick.value}`}>
                <line
                  className="money-scatter-grid"
                  x1={laid.pad.left}
                  x2={width - laid.pad.right}
                  y1={tick.y}
                  y2={tick.y}
                />
                <text
                  className="money-scatter-axis"
                  x={laid.pad.left - 6}
                  y={tick.y}
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {tick.value === 0 ? "0" : formatMoney(Math.round(tick.value), currency).replace(/[.,]00$/, "")}
                </text>
              </g>
            ))}
            {laid.xTicks.map((tick) => (
              <text
                key={`x-${tick.value}`}
                className="money-scatter-axis"
                x={tick.x}
                y={height - 8}
                textAnchor="middle"
              >
                {tick.value === 0 ? "Due" : `${tick.value > 0 ? "" : "−"}${Math.abs(tick.value)}d`}
              </text>
            ))}
            {laid.points.map((point, index) => (
              <g
                key={point.id}
                className={cn("money-scatter-dot", (!hover || hover.id === point.id) && "is-active")}
                role="button"
                tabIndex={0}
                aria-label={`${point.name}, ${formatMoney(point.y, currency)} per month, due in ${point.x} days`}
                onMouseEnter={() => setHover(point)}
                onClick={() => onSelect(point.id)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelect(point.id);
                }}
              >
                <circle
                  cx={point.cx}
                  cy={point.cy}
                  r={point.r}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                />
              </g>
            ))}
          </svg>
          )}
        </div>
      )}
    </section>
  );
}

export function HeatmapCard({
  workspace,
  currency,
  selectedDay,
  onSelectDay,
}: {
  workspace: FinanceWorkspace;
  currency: string;
  selectedDay: string | null;
  onSelectDay: (date: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const { cells, total, change } = heatmapSummary(workspace);
  const peak = Math.max(0, ...cells.map((cell) => cell.amountCents));
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weeks = heatmapWeekLabels(12);
  const focus = hover ?? selectedDay;
  const focused = cells.find((cell) => cell.date === focus);
  const focusDay = focus ? new Date(`${focus}T12:00:00`).getDay() : -1;
  const mondayIndex = focusDay === 0 ? 6 : focusDay - 1;
  const focusWeek = focus ? Math.floor(cells.findIndex((cell) => cell.date === focus) / 7) : -1;

  return (
    <section className="money-card money-card-heat">
      <ChartHead
        title="Daily spending"
        value={formatMoney(focused?.amountCents ?? total, currency)}
        change={hover ? undefined : change}
        invertChange
        meta={focus ?? "Last 12 weeks"}
      />
      <div className="money-heat">
        <ul className="money-heat-days">
          {days.map((day, index) => (
            <li key={day} className={cn(index === mondayIndex && "is-active")}>{day}</li>
          ))}
        </ul>
        <div>
          <div className="money-heat-grid" role="list" aria-label="Daily spending for the last 12 weeks">
            {cells.map((cell) => {
              const level = peak === 0 || cell.amountCents === 0
                ? 0
                : Math.min(4, Math.ceil((cell.amountCents / peak) * 4));
              return (
                <button
                  key={cell.date}
                  type="button"
                  className={cn("money-heat-cell", selectedDay === cell.date && "is-selected")}
                  data-level={level}
                  aria-pressed={selectedDay === cell.date}
                  aria-label={`${cell.date}: ${formatMoney(cell.amountCents, currency)}`}
                  onMouseEnter={() => setHover(cell.date)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => {
                    if (cell.amountCents <= 0) return;
                    onSelectDay(cell.date);
                  }}
                />
              );
            })}
          </div>
          <ul className="money-heat-weeks">
            {weeks.map((week) => (
              <li key={week.index} className={cn(week.index === focusWeek && "is-active")}>{week.label}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="money-heat-scale">
        <span>Less</span>
        <span className="money-heat-cell" data-level="0" />
        <span className="money-heat-cell" data-level="1" />
        <span className="money-heat-cell" data-level="2" />
        <span className="money-heat-cell" data-level="3" />
        <span className="money-heat-cell" data-level="4" />
        <span>More</span>
      </p>
    </section>
  );
}
