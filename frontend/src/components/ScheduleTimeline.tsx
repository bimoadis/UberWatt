'use client';

import React, { useState, useEffect } from 'react';
import { Lang, T } from '../i18n/translations';
import { REGIONS, buildGridData } from './ConsoleWidget';
import { DataPoint } from './SVGPriceChart';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ScheduleTimelineProps {
  lang: Lang;
  grid: string;
  be: number;
  mw: number;
}

export const ScheduleTimeline: React.FC<ScheduleTimelineProps> = ({
  lang,
  grid,
  be,
  mw,
}) => {
  const t = T[lang];
  const c = REGIONS[grid] || REGIONS.ercot;
  const [data, setData] = useState<DataPoint[]>([]);

  // Fetch real 48 half-hour blocks from Backend REST API
  useEffect(() => {
    async function fetchSchedule() {
      try {
        const res = await fetch(`${API_BASE_URL}/v1/grids/${grid}/day`);
        if (res.ok) {
          const apiBlocks = await res.json();
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
        // Fallback
      }
      setData(buildGridData(grid));
    }

    fetchSchedule();
  }, [grid]);

  const activePoints = data.length > 0 ? data : buildGridData(grid);
  const lo = Math.min(...activePoints.map((p) => p.price));
  const hi = Math.max(...activePoints.map((p) => p.price));

  const hhmm = (i: number) =>
    String(Math.floor(i / 2)).padStart(2, '0') + ':' + (i % 2 ? '30' : '00');
  const money = (v: number) => (v < 0 ? '−' : '') + c.ccy + Math.round(Math.abs(v));

  const lbl = {
    en: ['Run', 'Stop'],
    de: ['Laufen', 'Abschalten'],
    zh: ['开机', '停机'],
  }[lang];

  const filteredBlocks = activePoints.filter((p) => p.i % 2 === 0);

  return (
    <section id="schedule">
      <div className="wrap">
        <h2>{t.p3h}</h2>
        <p className="sub">{t.p3s}</p>
        <div className="tl">
          <div className="tl-head">
            {c.name} —{' '}
            {lang === 'zh' ? '半小时区块，' : lang === 'de' ? '30-Minuten-Blöcke, ' : '30-minute blocks, '}
            {c.tz}
          </div>
          <div>
            {filteredBlocks.map((p) => {
              const run = p.price < be;
              const w = Math.max(3, ((p.price - lo) / (hi - lo)) * 100);
              const delta = (run ? be - p.price : p.price - be) * mw * 0.5;

              return (
                <div key={p.i} className="tl-row">
                  <div className="time num">{hhmm(p.i)}</div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{
                        width: `${w}%`,
                        background: run
                          ? '#8CC63F'
                          : 'linear-gradient(90deg,#E07A45,#C4501C)',
                      }}
                    ></div>
                  </div>
                  <div>
                    <span className={`sig-badge ${run ? 'run' : 'stop'}`}>
                      {run ? lbl[0] : lbl[1]}
                    </span>
                  </div>
                  <div
                    className="val num"
                    style={{ color: run ? 'var(--green-d)' : 'var(--rust)' }}
                  >
                    {money(delta)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
