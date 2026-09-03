'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Lang } from '../i18n/translations';

export interface DataPoint {
  i: number;
  h: number;
  demand: number;
  solar: number;
  wind: number;
  re: number;
  net: number;
  curtail: number;
  price: number;
}

interface SVGPriceChartProps {
  lang: Lang;
  data: DataPoint[];
  view: 'price' | 'load';
  breakeven: number;
  selectedIndex: number;
  onScrub: (index: number) => void;
  currency: string;
}

export const SVGPriceChart: React.FC<SVGPriceChartProps> = ({
  lang,
  data,
  view,
  breakeven,
  selectedIndex,
  onScrub,
  currency,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string; visible: boolean }>({
    x: 0,
    y: 0,
    text: '',
    visible: false,
  });

  const isPrice = view === 'price';

  const W = 1000;
  const H = 360;
  const PL = 54;
  const PR = 16;
  const PT = 18;
  const PB = 30;

  const maxY = isPrice
    ? Math.max(breakeven * 1.4, ...data.map((p) => p.price)) * 1.08
    : Math.max(...data.map((p) => p.demand)) * 1.1;
  const minY = isPrice ? Math.min(0, ...data.map((p) => p.price)) * 1.2 : 0;

  const X = (i: number) => PL + (i / 47) * (W - PL - PR);
  const Y = (v: number) => PT + (1 - (v - minY) / (maxY - minY)) * (H - PT - PB);

  const hhmm = (i: number) =>
    String(Math.floor(i / 2)).padStart(2, '0') + ':' + (i % 2 ? '30' : '00');
  const fmtMoney = (v: number) => (v < 0 ? '−' : '') + currency + Math.round(Math.abs(v));

  // Grid steps
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(maxY, 1)))) / 2;
  const gridLines = [];
  for (let v = Math.ceil(minY / step) * step; v <= maxY; v += step) {
    gridLines.push(v);
  }

  // Path data strings
  let pricePathD = '';
  if (isPrice) {
    data.forEach((p, i) => {
      pricePathD += (i === 0 ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(p.price).toFixed(1);
    });
  }

  let demandPathD = '';
  let netPathD = '';
  if (!isPrice) {
    data.forEach((p, i) => {
      demandPathD += (i === 0 ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(p.demand).toFixed(1);
      netPathD += (i === 0 ? 'M' : 'L') + X(i).toFixed(1) + ' ' + Y(p.net).toFixed(1);
    });
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(47, Math.round((((cx / rect.width) * W - PL) / (W - PL - PR)) * 47)));
    onScrub(idx);

    const p = data[idx];
    const runText = p.price < breakeven ? (lang === 'zh' ? '开机' : lang === 'de' ? 'laufen' : 'run') : (lang === 'zh' ? '停机' : lang === 'de' ? 'abschalten' : 'shut down');

    setTooltip({
      x: e.clientX,
      y: e.clientY,
      text: `${hhmm(idx)} · ${fmtMoney(p.price)}/MWh (${runText})`,
      visible: true,
    });
  };

  const handlePointerLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  const lg = {
    en: ['Wholesale price', 'Your breakeven', 'Run — cheaper than your cost', 'Shut down — grid pays more'],
    de: ['Börsenpreis', 'Deine Gewinnschwelle', 'Laufen — billiger als deine Kosten', 'Abschalten — Netz zahlt mehr'],
    zh: ['批发电价', '你的盈亏平衡点', '开机 — 电价低于成本', '停机 — 电网出价更高'],
  }[lang];

  const lgL = {
    en: ['Total demand', 'Renewables available', 'Net load (the duck)', 'Curtailed'],
    de: ['Gesamtlast', 'Erneuerbare verfügbar', 'Netzlast (die Ente)', 'Abgeregelt'],
    zh: ['总用电需求', '可用可再生能源', '净负荷（鸭子曲线）', '被弃电量'],
  }[lang];

  const legendSet = isPrice
    ? [
        ['#1B5E20', lg[0]],
        ['#16241A', lg[1]],
        ['#7FB800', lg[2]],
        ['#C4501C', lg[3]],
      ]
    : [
        ['#3E5142', lgL[0]],
        ['#7FB800', lgL[1]],
        ['#1B5E20', lgL[2]],
        ['#C4501C', lgL[3]],
      ];

  const selectedPoint = data[selectedIndex] || data[0];
  const selectedVal = isPrice ? selectedPoint.price : selectedPoint.net;

  return (
    <div style={{ position: 'relative' }}>
      <div className="chart-area">
        <svg
          ref={svgRef}
          className="curve"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Wholesale price across the day against your breakeven cost"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          {/* Horizontal Grid lines */}
          {gridLines.map((v) => (
            <g key={v}>
              <line
                x1={PL}
                x2={W - PR}
                y1={Y(v)}
                y2={Y(v)}
                stroke={v === 0 ? '#556A59' : '#DCE8D2'}
                strokeWidth={v === 0 ? 1.2 : 1}
              />
              <text
                x={PL - 7}
                y={Y(v) + 3.6}
                textAnchor="end"
                fontSize={10.5}
                fill="#556A59"
                fontFamily="JetBrains Mono, monospace"
              >
                {Math.abs(v) >= 1000 ? v / 1000 + 'k' : v}
              </text>
            </g>
          ))}

          {/* Time Labels */}
          {[0, 12, 24, 36, 47].map((i) => (
            <text
              key={i}
              x={X(i)}
              y={H - 8}
              textAnchor={i === 0 ? 'start' : i === 47 ? 'end' : 'middle'}
              fontSize={10.5}
              fill="#556A59"
              fontFamily="JetBrains Mono, monospace"
            >
              {hhmm(i)}
            </text>
          ))}

          {/* Price View: Shading & Lines */}
          {isPrice && (
            <>
              {data.map((p, i) => {
                const x0 = X(Math.max(0, i - 0.5));
                const x1 = X(Math.min(47, i + 0.5));
                const run = p.price < breakeven;
                return (
                  <rect
                    key={i}
                    x={x0}
                    y={PT}
                    width={Math.max(0, x1 - x0)}
                    height={H - PT - PB}
                    fill={run ? '#7FB800' : '#C4501C'}
                    opacity={run ? 0.14 : 0.08}
                  />
                );
              })}
              {/* Breakeven Line */}
              <line
                x1={PL}
                x2={W - PR}
                y1={Y(breakeven)}
                y2={Y(breakeven)}
                stroke="#16241A"
                strokeWidth={1.8}
                strokeDasharray="6 4"
              />
              <text
                x={W - PR - 4}
                y={Y(breakeven) - 6}
                textAnchor="end"
                fontSize={11.5}
                fontWeight={700}
                fill="#16241A"
              >
                {lang === 'zh' ? '盈亏平衡点 ' : lang === 'de' ? 'Gewinnschwelle ' : 'breakeven '}
                {currency}
                {breakeven}
              </text>
              {/* Price Path */}
              <path d={pricePathD} fill="none" stroke="#1B5E20" strokeWidth={2.6} strokeLinejoin="round" />
            </>
          )}

          {/* Grid Load View */}
          {!isPrice && (
            <>
              <path d={demandPathD} fill="none" stroke="#3E5142" strokeWidth={1.6} opacity={0.6} />
              <path d={netPathD} fill="none" stroke="#1B5E20" strokeWidth={2.8} strokeLinejoin="round" />
            </>
          )}

          {/* Scrub Line & Marker */}
          <line
            x1={X(selectedIndex)}
            x2={X(selectedIndex)}
            y1={PT}
            y2={H - PB}
            stroke="#16241A"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.6}
          />
          <circle
            cx={X(selectedIndex)}
            cy={Y(selectedVal)}
            r={5.5}
            fill="#FBFDF8"
            stroke="#16241A"
            strokeWidth={2.4}
          />
        </svg>
      </div>

      {/* Legend */}
      <div className="legend">
        {legendSet.map(([c, t], i) => (
          <span key={i}>
            <i style={{ background: c }}></i>
            {t}
          </span>
        ))}
      </div>

      {/* Floating Tooltip */}
      {tooltip.visible && (
        <div
          className="tipbox"
          style={{
            position: 'fixed',
            left: tooltip.x + 14,
            top: tooltip.y + 14,
            opacity: 1,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
};
