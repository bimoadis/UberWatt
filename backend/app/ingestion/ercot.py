"""
ÜberWatt ERCOT Poller Engine (Milestone 1 Ingestion Worker)
Handles OAuth ROPC Token Acquisition and SCED 5-Minute Settlement Price Fetching.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
import httpx

from app.engine.signal_engine import PriceTick

logger = logging.getLogger(__name__)


class ERCOTPoller:
    """
    Poller for ERCOT Public API (SCED 5-minute settlement point prices).
    Auth requirements per DEV BRIEF:
    - Authorization: Bearer <id_token> (ROPC OAuth2, tokens expire in 1hr, NO REFRESH TOKEN EXISTS)
    - Ocp-Apim-Subscription-Key: <subscription_key>
    """

    def __init__(
        self,
        base_url: str = "https://api.ercot.com",
        subscription_key: str = "",
        username: str = "",
        password: str = "",
        primary_node: str = "HB_WEST",
    ):
        self.base_url = base_url.rstrip("/")
        self.subscription_key = subscription_key
        self.username = username
        self.password = password
        self.primary_node = primary_node

        self.token: Optional[str] = None
        self.token_expires_at: Optional[datetime] = None

    async def authenticate(self) -> str:
        """
        Obtains a fresh Bearer token using OAuth2 ROPC POST.
        Tokens expire in 1 hour; this method acquires a new one.
        """
        auth_url = f"{self.base_url}/oauth2/token"
        payload = {
            "grant_type": "password",
            "username": self.username,
            "password": self.password,
            "client_id": "ercot-public-api",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(auth_url, data=payload)
                response.raise_for_status()
                data = response.json()
                self.token = data.get("id_token") or data.get("access_token")
                # Tokens expire in 3600 seconds. We set expiration to 50 minutes to be safe.
                self.token_expires_at = datetime.now(timezone.utc)
                logger.info("Successfully authenticated with ERCOT API.")
                return self.token
            except Exception as e:
                logger.error(f"Failed to authenticate with ERCOT API: {e}")
                raise

    async def get_valid_token(self) -> str:
        """
        Ensures a valid token exists, requesting a new one if missing/expired.
        """
        if not self.token or not self.token_expires_at:
            return await self.authenticate()

        # Re-authenticate if token is older than 50 minutes
        age_seconds = (datetime.now(timezone.utc) - self.token_expires_at).total_seconds()
        if age_seconds > 3000:
            logger.info("ERCOT token expiring soon; re-authenticating.")
            return await self.authenticate()

        return self.token

    async def fetch_latest_price_tick(self, node: Optional[str] = None) -> PriceTick:
        """
        Fetches the latest SCED 5-minute settlement point price for the specified node.
        Normalizes response into a standardized PriceTick object.
        """
        target_node = node or self.primary_node
        endpoint = f"{self.base_url}/api/public-reports/np6-905-cd/spp_node_zone_hub"
        params = {"settlementPoint": target_node}

        token = await self.get_valid_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Ocp-Apim-Subscription-Key": self.subscription_key,
        }

        fetched_at = datetime.now(timezone.utc)
        full_source_url = f"{endpoint}?settlementPoint={target_node}"

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                response = await client.get(endpoint, headers=headers, params=params)

                # Handle token expiry fallback
                if response.status_code == 401:
                    logger.warning("ERCOT API returned 401; re-authenticating...")
                    token = await self.authenticate()
                    headers["Authorization"] = f"Bearer {token}"
                    response = await client.get(endpoint, headers=headers, params=params)

                response.raise_for_status()
                payload = response.json()

                # Parse latest tick from payload
                tick_data = self._parse_ercot_payload(payload, target_node, full_source_url, fetched_at)
                return tick_data

            except Exception as e:
                logger.error(f"ERCOT Poller fetch error for node {target_node}: {e}")
                raise

    def _parse_ercot_payload(
        self, payload: Dict[str, Any], node: str, source_url: str, fetched_at: datetime
    ) -> PriceTick:
        """
        Parses ERCOT JSON/CSV payload into a normalized PriceTick object.
        """
        # ERCOT SCED API response format mapping
        items = payload.get("data", []) or payload.get("items", [])
        if not items:
            raise ValueError(f"No price tick items returned in ERCOT payload for node {node}")

        latest = items[-1]

        # Extract interval timestamp (UTC) and settlement price
        interval_str = latest.get("intervalEnding") or latest.get("deliveryTime") or latest.get("timestamp")
        price_val = float(latest.get("settlementPointPrice") or latest.get("price") or 0.0)

        try:
            interval_start = datetime.fromisoformat(interval_str.replace("Z", "+00:00"))
        except Exception:
            interval_start = datetime.now(timezone.utc)

        return PriceTick(
            grid="ercot",
            node=node,
            interval_start=interval_start,
            interval_minutes=5,
            price=price_val,
            currency="USD",
            source_url=source_url,
            fetched_at=fetched_at,
        )
