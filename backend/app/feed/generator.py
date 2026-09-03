"""
ÜberWatt Agent Feed Generator
Generates terse, data-first public posts in EN, DE, and ZH from confirmed signal flips.
Includes Solana transaction signature links and exact industry terminology.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Optional


@dataclass
class AgentPost:
    post_id: str
    grid: str
    node: str
    signal: str  # 'RUN' | 'STOP' | 'INFO'
    timestamp_utc: str
    en: str
    de: str
    zh: str
    price: float
    currency: str
    breakeven: float
    solana_tx_sig: Optional[str]
    solana_digest: str
    archive_url: str


class AgentFeedGenerator:
    """
    Template engine for generating multi-lingual agent posts from confirmed signal flips.
    """

    @staticmethod
    def format_post(
        post_id: str,
        grid: str,
        node: str,
        signal: str,
        price: float,
        currency: str,
        breakeven: float,
        timestamp_utc: datetime,
        solana_tx_sig: Optional[str] = None,
        solana_digest: str = "",
    ) -> AgentPost:
        time_str = timestamp_utc.strftime("%H:%M UTC")
        ts_iso = timestamp_utc.isoformat()
        delta = abs(round(breakeven - price, 2))
        ccy = currency

        if signal == "RUN":
            if price < 0:
                en = f"{node} at −{ccy}{abs(price):.2f}/MWh. Below your breakeven by {ccy}{delta:.2f}. Full send."
                de = f"{node} bei −{abs(price):.2f} {ccy}/MWh. {delta:.2f} {ccy} unter deiner Gewinnschwelle. Volle Last."
                zh = f"{node} 报 −{abs(price):.2f} {ccy}/兆瓦时，比你的平衡点低 {delta:.2f} {ccy}。满负荷运行。"
            else:
                en = f"{node} price dropped to {ccy}{price:.2f}/MWh. {ccy}{delta:.2f} below breakeven ({ccy}{breakeven}). Start load."
                de = f"{node}-Preis auf {price:.2f} {ccy}/MWh gefallen. {delta:.2f} {ccy} unter Gewinnschwelle ({ccy}{breakeven}). Last starten."
                zh = f"{node} 电价跌至 {price:.2f} {ccy}/兆瓦时，低于平衡点 {delta:.2f} {ccy}。立即启动负荷。"

        elif signal == "STOP":
            en = f"{node} peak spike at {ccy}{price:.2f}/MWh. Every megawatt shut down now is worth more than hashing."
            de = f"{node}-Spitze bei {price:.2f} {ccy}/MWh. Jedes Megawatt, das du abschaltest, ist mehr wert als jedes, das du rechnest."
            zh = f"{node} 出现尖峰电价 {price:.2f} {ccy}/兆瓦时。此刻停下的每一兆瓦，都比算出的更值钱。"

        else:  # INFO / Context
            if grid == "cnnw":
                en = f"Northwest China grid reporting renewable curtailment (qifeng qiguang). Scale dwarfs other grids."
                de = f"Nordwestchina-Netz meldet Abregelung (qifeng qiguang). Die Größenordnung übertrifft andere Netze."
                zh = f"中国西北电网报告弃风弃光。规模远超其他电网。"
            else:
                en = f"{grid.upper()} transmission constrained. Wind/solar curtailment active."
                de = f"{grid.upper()} Netzengpass. Wind-/Solarabregelung aktiv."
                zh = f"{grid.upper()} 受输电通道限制，弃风弃光进行中。"

        archive_url = f"https://uberwatt.io/archive/signals/{solana_digest or post_id}"

        return AgentPost(
            post_id=post_id,
            grid=grid,
            node=node,
            signal=signal,
            timestamp_utc=ts_iso,
            en=en,
            de=de,
            zh=zh,
            price=price,
            currency=currency,
            breakeven=breakeven,
            solana_tx_sig=solana_tx_sig,
            solana_digest=solana_digest,
            archive_url=archive_url,
        )
