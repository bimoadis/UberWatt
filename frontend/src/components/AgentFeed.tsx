'use client';

import React, { useState, useEffect } from 'react';
import { Lang, T } from '../i18n/translations';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface AgentFeedProps {
  lang: Lang;
  grid: string;
  be: number;
}

interface PostItem {
  post_id: string;
  grid: string;
  node: string;
  signal: string;
  en: string;
  de: string;
  zh: string;
  solana_tx_sig?: string;
  solana_digest?: string;
}

export const AgentFeedSection: React.FC<AgentFeedProps> = ({ lang, grid, be }) => {
  const t = T[lang];

  const [bGrid, setBGrid] = useState('ERCOT');
  const [bTrig, setBTrig] = useState('below');
  const [bChan, setBChan] = useState('Webhook');
  const [posts, setPosts] = useState<PostItem[]>([]);

  // Fetch real posts from Backend REST API
  useEffect(() => {
    async function fetchFeed() {
      try {
        const res = await fetch(`${API_BASE_URL}/v1/feed?grid=${grid}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setPosts(data);
          return;
        }
      } catch (e) {
        // Fallback static posts if API offline
      }

      // Default fallback posts
      setPosts([
        {
          post_id: 'post-1',
          grid: grid,
          node: 'HB_WEST',
          signal: 'run',
          en: 'HB_WEST at −$18/MWh. Below your breakeven by $63. Full send.',
          de: 'HB_WEST bei −18 $/MWh. 63 $ unter deiner Gewinnschwelle. Volle Last.',
          zh: 'HB_WEST 报 −18 美元/兆瓦时，比你的平衡点低 63 美元。满负荷运行。',
          solana_tx_sig: 'sim_solana_tx_sig_hb_west',
        },
        {
          post_id: 'post-2',
          grid: grid,
          node: 'HB_WEST',
          signal: 'stop',
          en: 'Evening ramp. Price crossed $210. Every megawatt you shut down now is worth more than every megawatt you hash.',
          de: 'Abendrampe. Preis über 210 $. Jedes Megawatt, das du abschaltest, ist mehr wert als jedes, das du rechnest.',
          zh: '晚高峰爬坡，电价突破 210 美元。此刻你停下的每一兆瓦，都比你算出的每一兆瓦更值钱。',
          solana_tx_sig: 'sim_solana_tx_sig_hb_west_stop',
        },
      ]);
    }

    fetchFeed();
  }, [grid]);

  const tagTxtMap: Record<string, Record<Lang, string>> = {
    run: { en: 'Run', de: 'Laufen', zh: '开机' },
    stop: { en: 'Shut down', de: 'Abschalten', zh: '停机' },
    info: { en: 'Context', de: 'Kontext', zh: '背景' },
  };

  const alertTextMap = {
    en: {
      below: `${bGrid} price dropped below your breakeven of $${be}. Start your load now.`,
      negative: `${bGrid} price is negative. You are being paid to consume.`,
      spike: `${bGrid} peak spike. Shut down — the grid is worth more than your output right now.`,
      foot: 'delivered within 60s of detection · source link attached',
    },
    de: {
      below: `${bGrid}-Preis unter deine Gewinnschwelle von $${be} gefallen. Last jetzt starten.`,
      negative: `${bGrid}-Preis ist negativ. Du wirst fürs Verbrauchen bezahlt.`,
      spike: `${bGrid}-Preisspitze. Abschalten — das Netz ist gerade mehr wert als dein Output.`,
      foot: 'binnen 60 s nach Erkennung · Quellenlink beigefügt',
    },
    zh: {
      below: `${bGrid} 电价已跌破你 $${be} 的盈亏平衡点。立即启动负荷。`,
      negative: `${bGrid} 电价转负。用电即获得收益。`,
      spike: `${bGrid} 出现尖峰电价。停机——此刻电网的价值高于你的产出。`,
      foot: '检测后 60 秒内送达 · 附数据来源链接',
    },
  }[lang];

  return (
    <section id="feed">
      <div className="wrap">
        <h2>{t.p4h}</h2>
        <p className="sub">{t.p4s}</p>

        <div className="feed-shell">
          {/* Feed List */}
          <div className="feed">
            <div className="feed-bar">
              <span className="t">{t.live}</span>
            </div>
            <div>
              {posts.map((p, idx) => {
                const tagTxt = tagTxtMap[p.signal.toLowerCase()]?.[lang] || 'Info';
                const altText = lang === 'en' ? p.zh : p.en;

                return (
                  <div key={p.post_id || idx} className="post">
                    <div className="post-meta">
                      <span className="who">ÜberWatt</span>
                      <span className={`tag ${p.signal.toLowerCase()}`}>{tagTxt}</span>
                      <span className="num" style={{ marginLeft: 'auto' }}>
                        14:{10 + idx * 15}
                      </span>
                    </div>
                    <div className="body">{p[lang] || p.en}</div>
                    <div className="alt">{altText}</div>
                    <div className="data num">
                      <span>{grid.toUpperCase()}</span>
                      <span>source: operator feed</span>
                      {p.solana_tx_sig && (
                        <a
                          href={`https://explorer.solana.com/tx/${p.solana_tx_sig}?cluster=devnet`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--green-d)', fontWeight: 600, textDecoration: 'underline' }}
                        >
                          solana proof: {p.solana_tx_sig.slice(0, 16)}...
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Alert Builder */}
          <div className="builder">
            <h3>{t.bh}</h3>
            <p className="hint">{t.bhint}</p>

            <div className="field">
              <span className="lbl">{t.fGrid}</span>
              <div className="chips">
                {['ERCOT', 'CAISO', '中国西北', 'ENTSO-E'].map((g) => (
                  <button
                    key={g}
                    className="chip"
                    aria-pressed={bGrid === g}
                    onClick={() => setBGrid(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="lbl">{t.fTrig}</span>
              <div className="chips">
                <button
                  className="chip"
                  aria-pressed={bTrig === 'below'}
                  onClick={() => setBTrig('below')}
                >
                  {t.t1}
                </button>
                <button
                  className="chip"
                  aria-pressed={bTrig === 'negative'}
                  onClick={() => setBTrig('negative')}
                >
                  {t.t2}
                </button>
                <button
                  className="chip"
                  aria-pressed={bTrig === 'spike'}
                  onClick={() => setBTrig('spike')}
                >
                  {t.t3}
                </button>
              </div>
            </div>

            <div className="field">
              <span className="lbl">{t.fChan}</span>
              <div className="chips">
                {['Webhook', 'Telegram', 'PagerDuty'].map((ch) => (
                  <button
                    key={ch}
                    className="chip"
                    aria-pressed={bChan === ch}
                    onClick={() => setBChan(ch)}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>

            <div className="preview">
              <div className="ttl">{t.prev}</div>
              <div>
                <b>ÜberWatt → {bChan}</b>
                <br />
                {alertTextMap[bTrig as 'below' | 'negative' | 'spike']}
                <br />
                <span className="num" style={{ color: 'var(--ink-3)', fontSize: '12.5px' }}>
                  {alertTextMap.foot}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
