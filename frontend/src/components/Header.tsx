'use client';

import React from 'react';
import { Lang, T } from '../i18n/translations';

interface HeaderProps {
  lang: Lang;
  onSelectLang: (lang: Lang) => void;
  isStale?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ lang, onSelectLang, isStale = false }) => {
  const t = T[lang];

  return (
    <header>
      <div className="wrap nav">
        <a className="brand" href="#top">
          <span className="mk"></span>ÜBERWATT
        </a>
        <nav className="navlinks">
          <a href="#problem">{t.nav1}</a>
          <a href="#schedule">{t.nav2}</a>
          <a href="#feed">{t.nav3}</a>
          <a href="#future">{t.nav4}</a>
          <a href="#token">{t.nav5}</a>
        </nav>
        <div className="langsel" role="group" aria-label="Language">
          <button
            onClick={() => onSelectLang('en')}
            aria-pressed={lang === 'en'}
          >
            EN
          </button>
          <button
            onClick={() => onSelectLang('de')}
            aria-pressed={lang === 'de'}
          >
            DE
          </button>
          <button
            onClick={() => onSelectLang('zh')}
            aria-pressed={lang === 'zh'}
          >
            中文
          </button>
        </div>
        <span
          className="demo-flag"
          style={isStale ? { background: '#FBEEE7', color: '#C4501C', borderColor: '#E8B79E' } : {}}
        >
          {isStale ? 'Data Staleness Alert — Feed Delayed' : t.demo}
        </span>
      </div>
    </header>
  );
};
