"""
SePay API client for checking bank transactions.
"""

import httpx
from typing import List, Dict, Optional


class SepayClient:
    """SePay API client."""
    
    BASE_URL = "https://my.sepay.vn/userapi"
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    async def get_transactions(self, limit: int = 20) -> List[Dict]:
        """
        Get recent bank transactions.
        """
        if not self.api_key:
            return []
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.BASE_URL}/transactions/list",
                    headers=self.headers,
                    params={"limit": limit}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return data.get("transactions", [])
                
                return []
        except Exception as e:
            print(f"❌ SePay API error: {e}")
            return []


# Singleton instance
def _make_client():
    try:
        from app.config import settings
        if settings.SEPAY_API_KEY:
            return SepayClient(settings.SEPAY_API_KEY)
    except Exception:
        pass
    return None

sepay_client = _make_client()