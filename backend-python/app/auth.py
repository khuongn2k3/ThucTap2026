import jwt
from fastapi import Header, HTTPException
import os

def verify_jwt(authorization: str = Header(...)):
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(
            token,
            os.getenv("JWT_SECRET"),
            algorithms=["HS256"]
        )
        return payload
    except:
        raise HTTPException(status_code=401, detail="Invalid token")
