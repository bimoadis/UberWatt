'use client';

import React from 'react';
import { Lang, T } from '../i18n/translations';

interface FooterProps {
  lang: Lang;
}

export const Footer: React.FC<FooterProps> = ({ lang }) => {
  const t = T[lang];

  return (
    <footer>
      <div className="wrap">
        <div className="foot-note">
          <b>{t.warnB} </b>
          <span>{t.warnT}</span>
        </div>
        <div className="foot-bottom">
          <span>{t.ftag}</span>
          <span>{t.fsrc}</span>
          <span className="de">{t.fde}</span>
        </div>
      </div>
    </footer>
  );
};
