'use client';

import React, { useState, useEffect } from 'react';
import { Lang, T } from '../i18n/translations';
import { SVGPriceChart, DataPoint } from './SVGPriceChart';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface GridConfig {
  key?: string;
  name: string;
  tz: string;
  ccy: string;
  base: number;
  am: number;
  pm: number;
  night: number;
  solar: number;
  wind: number;
  floor: number;
  cur: number;
  pk: number;
}

export const REGIONS: Record<string, GridConfig> = {
  ercot: { name: 'ERCOT · Texas', tz: 'CT', ccy: '$', base: 44000, am: 4200, pm: 15500, night: 5200, solar: 19000, wind: 12000, floor: 22000, cur: 0.55, pk: 340 },
  caiso: { name: 'CAISO · California', tz: 'PT', ccy: '$', base: 20500, am: 3200, pm: 9800, night: 2600, solar: 16500, wind: 2600, floor: 9000, cur: 0.34, pk: 420 },
  cnnw: { name: '中国西北 · Northwest China', tz: 'CST', ccy: '¥', base: 78000, am: 7000, pm: 14000, night: 8000, solar: 36000, wind: 34000, floor: 42000, cur: 0.42, pk: 520 },
  entsoe: { name: 'ENTSO-E · Germany', tz: 'CET', ccy: '€', base: 52000, am: 6500, pm: 12000, night: 7000, solar: 31000, wind: 16000, floor: 24000, cur: 0.32, pk: 260 },
  aemo: { name: 'AEMO · South Australia', tz: 'ACST', ccy: 'A$', base: 1250, am: 190, pm: 520, night: 180, solar: 1450, wind: 900, floor: 380, cur: 0.28, pk: 480 },
};

export function buildGridData(k: string): DataPoint[] {
  const c = REGIONS[k] || REGIONS.ercot;
  const out: DataPoint[] = [];
  for (let i = 0; i < 48; i++) {
    const h = i / 2;
    const demand =
      c.base +
      Math.exp(-Math.pow(h - 7.8, 2) / 7) * c.am +
      Math.exp(-Math.pow(h - 19.3, 2) / 8) * c.pm -
      Math.exp(-Math.pow(h - 3.4, 2) / 16) * c.night;
    const solar =
      h > 5.4 && h < 19.2 ? c.solar * Math.pow(Math.max(0, Math.cos(((h - 12.9) / 6.9) * (Math.PI / 2))), 2.6) : 0;
    const wind = c.wind * (0.55 + 0.45 * Math.sin(((h - 4) / 24) * 2 * Math.PI));
    const re = solar + wind;
    const net = demand - re;
    const curtail = Math.max(0, c.floor - net) * c.cur;
    let price: number;
    if (curtail > 0) price = -(curtail / c.floor) * 90 - 3;
    else price = 12 + Math.pow(Math.max(0, net - c.floor) / (c.base * 0.9), 3.2) * c.pk;
    out.push({ i, h, demand, solar, wind, re, net, curtail, price });
  }
  return out;
}

interface ConsoleWidgetProps {
  lang: Lang;
  be: number;
  mw: number;
  onChangeBe: (be: number) => void;
  onChangeMw: (mw: number) => void;
  grid: string;
  onChangeGrid: (grid: string) => void;
  selectedIndex: number;
  onSelectIndex: (idx: number) => void;
}

export const ConsoleWidget: React.FC<ConsoleWidgetProps> = ({
  lang,
  be,
  mw,
  onChangeBe,
  onChangeMw,
  grid,
  onChangeGrid,
  selectedIndex,
  onSelectIndex,
}) => {
  const [view, setView] = useState<'price' | 'load'>('price');
  const [data, setData] = useState<DataPoint[]>([]);
  const [apiSignal, setApiSignal] = useState<string>('RUN');
  const [apiPrice, setApiPrice] = useState<number>(23.41);

  const t = T[lang];
  const c = REGIONS[grid] || REGIONS.ercot;

  // Fetch real-time schedule & current state from Backend API
  useEffect(() => {
    async function fetchApiData() {
      try {
        // 1. Fetch current price & signal state from API
        const currRes = await fetch(`${API_BASE_URL}/v1/grids/${grid}/current`);
        if (currRes.ok) {
          const currData = await currRes.json();
          setApiSignal(currData.signal);
          setApiPrice(currData.price);
        }

        // 2. Fetch 48 half-hour schedule blocks from API
        const dayRes = await fetch(`${API_BASE_URL}/v1/grids/${grid}/day`);
        if (dayRes.ok) {
          const apiBlocks = await dayRes.json();
          const parsedPoints: DataPoint[] = apiBlocks.map((b: any, idx: number) => ({
            i: idx,
            h: idx / 2,
            demand: b.demand_mw,
            solar: 12000,
            wind: 8000,
            re: 20000,
            net: b.net_load_mw,
            curtail: b.curtailed_mw,
            price: b.price,
          }));
          setData(parsedPoints);
          return;
        }
      } catch (e) {
        // Fallback to local function if API server unreachable
      }
      setData(buildGridData(grid));
    }

    fetchApiData();
  }, [grid]);

  const activePoints = data.length > 0 ? data : buildGridData(grid);
  const currentPoint = activePoints[selectedIndex] || activePoints[0];
  const isRun = currentPoint.price < be;

  // Economics calculation
  let runH = 0;
  let stopH = 0;
  let edge = 0;
  let cheapest = activePoints[0];

  activePoints.forEach((p) => {
    if (p.price < be) {
      runH += 0.5;
    } else {
      stopH += 0.5;
      edge += (p.price - be) * mw * 0.5;
    }
    if (!cheapest || p.price < cheapest.price) cheapest = p;
  });

  const hhmm = (i: number) =>
    String(Math.floor(i / 2)).padStart(2, '0') + ':' + (i % 2 ? '30' : '00');
  const money = (v: number) => (v < 0 ? '−' : '') + c.ccy + Math.round(Math.abs(v));

  const pillText = isRun
    ? lang === 'zh'
      ? `${hhmm(selectedIndex)} 应开机 — ${money(currentPoint.price)}/MWh`
      : lang === 'de'
      ? `Jetzt laufen — ${money(currentPoint.price)}/MWh um ${hhmm(selectedIndex)}`
      : `Run now — ${money(currentPoint.price)}/MWh at ${hhmm(selectedIndex)}`
    : lang === 'zh'
    ? `${hhmm(selectedIndex)} 应停机 — ${money(currentPoint.price)}/MWh`
    : lang === 'de'
    ? `Abschalten — ${money(currentPoint.price)}/MWh um ${hhmm(selectedIndex)}`
    : `Shut down — ${money(currentPoint.price)}/MWh at ${hhmm(selectedIndex)}`;

  return (
    <div className="console">
      {/* Top Tabs */}
      <div className="console-top">
        <div className="tabs" role="tablist" aria-label="Grid">
          {Object.entries(REGIONS).map(([key, config]) => (
            <button
              key={key}
              className="tab"
              role="tab"
              aria-selected={grid === key}
              onClick={() => onChangeGrid(key)}
            >
              {config.name}
            </button>
          ))}
        </div>
        <div className={`status-pill ${isRun ? 'run' : 'stop'}`}>
          <span className="dot"></span>
          <span>{pillText}</span>
        </div>
      </div>

      {/* View Switcher Row */}
      <div className="viewrow">
        <div className="seg" role="group" aria-label="Chart view">
          <button
            aria-pressed={view === 'price'}
            onClick={() => setView('price')}
          >
            {t.vPrice}
          </button>
          <button
            aria-pressed={view === 'load'}
            onClick={() => setView('load')}
          >
            {t.vLoad}
          </button>
        </div>
        <span style={{ fontSize: '12.5px', color: 'var(--ink-3)' }}>{t.scrubHint}</span>
      </div>

      {/* Chart Component */}
      <SVGPriceChart
        lang={lang}
        data={activePoints}
        view={view}
        breakeven={be}
        selectedIndex={selectedIndex}
        onScrub={onSelectIndex}
        currency={c.ccy}
      />

      {/* Sliders Calculator */}
      <div className="calc">
        <div className="calc-head">{t.calcHead}</div>
        <div className="calc-hint">{t.calcHint}</div>
        <div className="sliders">
          <div className="sl">
            <label htmlFor="be">
              <span>{t.beL}</span>
              <b className="num">
                {c.ccy}
                {be}
              </b>
            </label>
            <input
              type="range"
              id="be"
              min="8"
              max="140"
              step="1"
              value={be}
              onChange={(e) => onChangeBe(Number(e.target.value))}
            />
          </div>
          <div className="sl">
            <label htmlFor="mw">
              <span>{t.mwL}</span>
              <b className="num">{mw} MW</b>
            </label>
            <input
              type="range"
              id="mw"
              min="1"
              max="400"
              step="1"
              value={mw}
              onChange={(e) => onChangeMw(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* 4 Readout Cells */}
      <div className="readout">
        <div className="cell">
          <div className="k">{t.r1}</div>
          <div className={`v num ${isRun ? 'good' : 'hot'}`}>
            {isRun ? (lang === 'zh' ? '开机' : lang === 'de' ? 'Laufen' : 'Run') : (lang === 'zh' ? '停机' : lang === 'de' ? 'Abschalten' : 'Shut down')}
          </div>
          <div className="s">
            {lang === 'zh'
              ? `电价 ${money(currentPoint.price)} / 平衡点 ${c.ccy}${be}`
              : lang === 'de'
              ? `Preis ${money(currentPoint.price)} vs ${c.ccy}${be}`
              : `price ${money(currentPoint.price)} vs ${c.ccy}${be}`}
          </div>
        </div>

        <div className="cell">
          <div className="k">{t.r2}</div>
          <div className="v num good">
            {runH} {lang === 'zh' ? '小时' : lang === 'de' ? 'Std' : 'h'}
          </div>
          <div className="s">
            {lang === 'zh'
              ? `${hhmm(cheapest.i)} 最便宜`
              : lang === 'de'
              ? `am billigsten um ${hhmm(cheapest.i)}`
              : `cheapest at ${hhmm(cheapest.i)}`}
          </div>
        </div>

        <div className="cell">
          <div className="k">{t.r3}</div>
          <div className="v num hot">
            {stopH} {lang === 'zh' ? '小时' : lang === 'de' ? 'Std' : 'h'}
          </div>
          <div className="s">
            {(lang === 'zh' ? '尖峰 ' : lang === 'de' ? 'Spitze ' : 'peak ') + money(Math.max(...activePoints.map((x) => x.price)))}
          </div>
        </div>

        <div className="cell">
          <div className="k">{t.r4}</div>
          <div className="v num good">{money(edge)}</div>
          <div className="s">
            {lang === 'zh'
              ? `按 ${mw} MW 可调度负荷计算`
              : lang === 'de'
              ? `bei ${mw} MW verschiebbarer Last`
              : `on ${mw} MW of flexible load`}
          </div>
        </div>
      </div>
    </div>
  );
};
