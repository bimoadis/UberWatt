'use client';

import React, { useState, useEffect } from 'react';
import { Lang, T } from '../i18n/translations';

interface TokenSectionProps {
  lang: Lang;
}

const ALLOC = [
  {
    v: 78,
    c: '#1B5E20',
    n: { en: 'Fair launch', de: 'Fairer Start', zh: '公平发行' },
    d: {
      en: 'Sold through the bonding curve. No presale, no insider allocation before public trading opens.',
      de: 'Über die Bonding Curve verkauft. Kein Vorverkauf, keine Insider-Zuteilung vor dem öffentlichen Handel.',
      zh: '通过联合曲线发行。无预售，公开交易开始前不向内部人分配。',
    },
  },
  {
    v: 8,
    c: '#2E7D32',
    n: { en: 'Contributor pool', de: 'Beitragspool', zh: '贡献者池' },
    d: {
      en: 'Paid to people who submit and verify missed windows. Vests over time, not unlocked at launch.',
      de: 'Für alle, die übersehene Fenster einreichen und prüfen. Vestet über die Zeit, nicht beim Start freigeschaltet.',
      zh: '发放给提交与核实遗漏窗口的人。按时间线性解锁，不在发行时释放。',
    },
  },
  {
    v: 9,
    c: '#7FB800',
    n: { en: 'Treasury', de: 'Schatzkammer', zh: '金库' },
    d: {
      en: 'Grid data access, hosting, and the engineering to integrate each new operator. Spending published monthly.',
      de: 'Datenzugang, Hosting und die Entwicklung für jeden neuen Betreiber. Ausgaben monatlich veröffentlicht.',
      zh: '电网数据接入、服务器，以及接入每张新电网的工程投入。支出按月公开。',
    },
  },
  {
    v: 5,
    c: '#C4501C',
    n: { en: 'Team', de: 'Team', zh: '团队' },
    d: {
      en: 'Locked, long vesting. Kept deliberately small — a large team allocation is the fastest way to lose trust here.',
      de: 'Gesperrt, lange Vesting-Frist. Bewusst klein gehalten — eine große Team-Zuteilung ist der schnellste Weg, Vertrauen zu verlieren.',
      zh: '锁仓，长期线性释放。刻意压得很小——团队份额过大是这里失去信任最快的方式。',
    },
  },
];

export const TokenSection: React.FC<TokenSectionProps> = ({ lang }) => {
  const t = T[lang];
  const [selectedAlloc, setSelectedAlloc] = useState(0);

  // Weekly Burn Countdown logic (Sunday 00:00 UTC)
  const [clock, setClock] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    const updateBurnClock = () => {
      const now = new Date();
      const nextSunday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      nextSunday.setUTCDate(nextSunday.getUTCDate() + ((7 - nextSunday.getUTCDay()) % 7 || 7));

      let totalSec = Math.max(0, Math.floor((nextSunday.getTime() - now.getTime()) / 1000));
      const d = Math.floor(totalSec / 86400);
      totalSec -= d * 86400;
      const h = Math.floor(totalSec / 3600);
      totalSec -= h * 3600;
      const m = Math.floor(totalSec / 60);
      totalSec -= m * 60;
      const s = totalSec;

      setClock({ d, h, m, s });
    };

    updateBurnClock();
    const interval = setInterval(updateBurnClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="token">
      <div className="wrap">
        <h2>$WATT</h2>
        <p className="sub">{t.p6s}</p>

        <div className="tok-grid">
          {/* Utility Matrix Table */}
          <table className="util">
            <thead>
              <tr>
                <th>{t.th1}</th>
                <th>{t.th2}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t.u1a}</td>
                <td>
                  {t.u1b}
                  <small>{t.u1c}</small>
                </td>
              </tr>
              <tr>
                <td>{t.u2a}</td>
                <td>
                  {t.u2b}
                  <small>{t.u2c}</small>
                </td>
              </tr>
              <tr>
                <td>{t.u3a}</td>
                <td>{t.u3b}</td>
              </tr>
              <tr>
                <td>{t.u4a}</td>
                <td>
                  {t.u4b}
                  <small>{t.u4c}</small>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Allocation & Burn Widget */}
          <div>
            <div className="alloc">
              <h3>{t.allocH}</h3>
              {/* Bar */}
              <div className="abar">
                {ALLOC.map((a, i) => (
                  <div
                    key={i}
                    style={{ flex: a.v, background: a.c }}
                    className={selectedAlloc === i ? 'on' : ''}
                    onClick={() => setSelectedAlloc(i)}
                    title={`${a.n[lang]} ${a.v}%`}
                  ></div>
                ))}
              </div>

              {/* List */}
              <div className="alist">
                {ALLOC.map((a, i) => (
                  <button
                    key={i}
                    className={`aitem ${selectedAlloc === i ? 'on' : ''}`}
                    onClick={() => setSelectedAlloc(i)}
                  >
                    <i style={{ background: a.c }}></i>
                    <span>{a.n[lang]}</span>
                    <b>{a.v}%</b>
                    <span className="note">{a.d[lang]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Burn Clock */}
            <div className="burn">
              <div className="name">Ewige Wiederkehr</div>
              <div className="de-sub de">{t.burnSub}</div>
              <div className="clock">
                <div>
                  <div className="n">{clock.d}</div>
                  <div className="u">{t.ud}</div>
                </div>
                <div>
                  <div className="n">{String(clock.h).padStart(2, '0')}</div>
                  <div className="u">{t.uh}</div>
                </div>
                <div>
                  <div className="n">{String(clock.m).padStart(2, '0')}</div>
                  <div className="u">{t.um}</div>
                </div>
                <div>
                  <div className="n">{String(clock.s).padStart(2, '0')}</div>
                  <div className="u">{t.us}</div>
                </div>
              </div>
              <p>{t.burnP}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
