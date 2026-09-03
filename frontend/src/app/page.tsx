'use client';

import React, { useState, useEffect } from 'react';
import { Lang, T } from '../i18n/translations';
import { Header } from '../components/Header';
import { ConsoleWidget } from '../components/ConsoleWidget';
import { ScheduleTimeline } from '../components/ScheduleTimeline';
import { AgentFeedSection } from '../components/AgentFeed';
import { TokenSection } from '../components/TokenSection';
import { Footer } from '../components/Footer';

export default function Home() {
  const [lang, setLang] = useState<Lang>('en');
  const [grid, setGrid] = useState<string>('ercot');
  const [be, setBe] = useState<number>(45);
  const [mw, setMw] = useState<number>(50);
  const [selectedIndex, setSelectedIndex] = useState<number>(26);

  // Data Staleness & Poller Monitoring State
  const [isStale, setIsStale] = useState<boolean>(false);
  const [pollerStatus, setPollerStatus] = useState<string>('HEALTHY');

  // Set html lang attribute dynamically
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Poll backend grid status & check for data staleness (> 15 minutes / 900s)
  useEffect(() => {
    async function checkGridHealth() {
      try {
        const res = await fetch(`http://localhost:8000/v1/grids/${grid}/current`);
        if (res.ok) {
          const data = await res.json();
          const fetchedAt = new Date(data.fetched_at).getTime();
          const now = Date.now();
          const ageSeconds = (now - fetchedAt) / 1000;

          // Rule: If last tick older than 15 minutes (900s), flag as stale
          if (ageSeconds > 900 || data.is_stale) {
            setIsStale(true);
          } else {
            setIsStale(false);
          }
          return;
        }
      } catch (e) {
        // Fallback: If network fails, do not throw error
      }
    }

    checkGridHealth();
    const interval = setInterval(checkGridHealth, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, [grid]);

  const t = T[lang];

  return (
    <>
      <Header lang={lang} onSelectLang={setLang} isStale={isStale} />

      <main id="top" style={isStale ? { opacity: 0.85, filter: 'grayscale(15%)' } : {}}>
        {/* Hero Section */}
        <div className="wrap hero">
          <h1>{t.h1}</h1>
          <p className="lede">{t.lede}</p>
          <p className="sig de">{t.sig}</p>

          <div className="who-for">
            <span>{t.w1}</span>
            <span>{t.w2}</span>
            <span>{t.w3}</span>
            <span>{t.w4}</span>
          </div>

          {/* Console Widget */}
          <ConsoleWidget
            lang={lang}
            be={be}
            mw={mw}
            onChangeBe={setBe}
            onChangeMw={setMw}
            grid={grid}
            onChangeGrid={setGrid}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
          />
        </div>

        {/* Problem Section */}
        <section id="problem">
          <div className="wrap">
            <h2>{t.p2h}</h2>
            <p className="sub">{t.p2s}</p>
            <div className="strip">
              <div>
                <div className="big num">6,120 GWh</div>
                <p>{t.s1p}</p>
              </div>
              <div>
                <div className="big num">2,480 hrs</div>
                <p>{t.s2p}</p>
              </div>
              <div>
                <div className="big num">11 min</div>
                <p>{t.s3p}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Schedule Timeline Section */}
        <ScheduleTimeline lang={lang} grid={grid} be={be} mw={mw} />

        {/* Agent Feed & Alert Builder Section */}
        <AgentFeedSection lang={lang} grid={grid} be={be} />

        {/* Looking Ahead / Future Outlook Section */}
        <section id="future">
          <div className="wrap">
            <h2>{t.p5h}</h2>
            <p className="sub">{t.p5s}</p>
            <div className="future">
              <span className="flag">{t.flag}</span>
              <h3>{t.fh}</h3>
              <p>{t.fp1}</p>
              <p>{t.fp2}</p>

              <div className="contrast">
                <div>
                  <h4>{t.c1h}</h4>
                  <ul>
                    <li>{t.c1a}</li>
                    <li>{t.c1b}</li>
                    <li>{t.c1c}</li>
                    <li>{t.c1d}</li>
                  </ul>
                </div>
                <div>
                  <h4>{t.c2h}</h4>
                  <ul>
                    <li>{t.c2a}</li>
                    <li>{t.c2b}</li>
                    <li>{t.c2c}</li>
                    <li>{t.c2d}</li>
                  </ul>
                </div>
              </div>

              <p style={{ marginTop: '20px' }}>{t.fp3}</p>
            </div>
          </div>
        </section>

        {/* Token $WATT Section */}
        <TokenSection lang={lang} />

        {/* Roadmap Section */}
        <section id="roadmap">
          <div className="wrap">
            <h2>{t.rmH}</h2>
            <p className="sub">{t.rmS}</p>
            <div className="road">
              <div>
                <div className="step num">{t.st1}</div>
                <h4>{t.r1h}</h4>
                <p>{t.r1p}</p>
                <span className="now">{t.inprog}</span>
              </div>
              <div>
                <div className="step num">{t.st2}</div>
                <h4>{t.r2h}</h4>
                <p>{t.r2p}</p>
              </div>
              <div>
                <div className="step num">{t.st3}</div>
                <h4>{t.r3h}</h4>
                <p>{t.r3p}</p>
              </div>
              <div>
                <div className="step num">{t.st4}</div>
                <h4>{t.r4h}</h4>
                <p>{t.r4p}</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer lang={lang} />
    </>
  );
}
