"""
Payment router: Create payment, check status (polling).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional
import re

from app.models.base_db import get_db
from app.models.user import User
from app.models.payment import Payment, PaymentStatus
from app.security.security import get_current_user
from app.utils.payment_crypto import encode_payment_id, decode_payment_id
from app.services.sepay_client import sepay_client
from app.config import settings

router = APIRouter(prefix="/payment", tags=["Payment"])

# =========================================
# PAYMENT PACKAGES
# =========================================

PACKAGES = {
    "basic": {"tokens": 100, "price_vnd": 50000},
    "pro": {"tokens": 500, "price_vnd": 200000},
    "premium": {"tokens": 1000, "price_vnd": 350000},
}

# =========================================
# SCHEMAS
# =========================================

class CreatePaymentRequest(BaseModel):
    """Request to create payment."""
    package_id: str  # "basic", "pro", "premium"


class PaymentResponse(BaseModel):
    """Payment response."""
    id: int
    hex_id: str
    package_id: str
    amount_vnd: float
    tokens: int
    status: str
    transfer_content: str  # Nội dung chuyển khoản
    qr_code_url: Optional[str] = None
    expires_at: datetime
    
    class Config:
        from_attributes = True


class PaymentStatusResponse(BaseModel):
    """Payment status check response."""
    status: str
    paid: bool
    message: str


# =========================================
# ENDPOINTS
# =========================================

@router.post("/create", response_model=PaymentResponse)
async def create_payment(
    request: CreatePaymentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new payment request.
    
    Returns hex_id and transfer instructions.
    """
    # Validate package
    if request.package_id not in PACKAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid package_id. Available: {list(PACKAGES.keys())}"
        )
    
    package = PACKAGES[request.package_id]
    
    # Create payment record
    payment = Payment(
        user_id=current_user.id,
        package_id=request.package_id,
        amount_vnd=package["price_vnd"],
        tokens=package["tokens"],
        status='pending',  # ✅ String, không phải PaymentStatus.PENDING
        expires_at=datetime.utcnow() + timedelta(minutes=60)  # 60 minutes expiry
    )
    
    db.add(payment)
    db.commit()
    db.refresh(payment)
    
    # Generate hex_id
    payment.hex_id = encode_payment_id(payment.id)
    db.commit()
    
    # Transfer content
    transfer_content = f"{settings.NAME_WEB}NAPTOKEN {payment.hex_id}"
    
    return PaymentResponse(
        id=payment.id,
        hex_id=payment.hex_id,
        package_id=payment.package_id,
        amount_vnd=payment.amount_vnd,
        tokens=payment.tokens,
        status=payment.status,  # ✅ Đã là string rồi, không cần .value
        transfer_content=transfer_content,
        qr_code_url=None,  # TODO: Generate QR code
        expires_at=payment.expires_at
    )


@router.get("/status/{payment_id}", response_model=PaymentStatusResponse)
async def check_payment_status(
    payment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Check payment status (polling endpoint).
    
    This endpoint:
    1. Fetches SePay transactions
    2. Searches for matching transfer
    3. Updates payment status if found
    4. Credits tokens to user
    """
    # Get payment
    payment = db.query(Payment).filter(
        Payment.id == payment_id,
        Payment.user_id == current_user.id
    ).first()
    
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found"
        )
    
    # Already completed
    if payment.status == 'completed':  # ✅ So sánh string
        return PaymentStatusResponse(
            status="completed",
            paid=True,
            message="Payment already completed"
        )
    
    # Check expiry
    if datetime.utcnow() > payment.expires_at and payment.status == 'pending':
        payment.status = 'expired'  # ✅ Gán string
        db.commit()
        return PaymentStatusResponse(
            status="expired",
            paid=False,
            message="Payment expired"
        )
    
    # ✅ CHECK SEPAY TRANSACTIONS
    if sepay_client:
        matched, tx_id = await check_sepay_transactions(payment, db)
        
        if matched:
            # ✅ PAYMENT SUCCESSFUL
            payment.status = 'completed'  # ✅ Gán string
            payment.sepay_transaction_id = tx_id
            payment.paid_at = datetime.utcnow()
            
            # ✅ CREDIT TOKENS TO USER
            current_user.tokens = (current_user.tokens or 0) + payment.tokens
            
            db.commit()
            
            return PaymentStatusResponse(
                status="completed",
                paid=True,
                message=f"Payment successful! {payment.tokens} tokens added."
            )
    
    # Still pending
    return PaymentStatusResponse(
        status="pending",
        paid=False,
        message="Waiting for payment..."
    )


# =========================================
# SEPAY TRANSACTION CHECKER
# =========================================

async def check_sepay_transactions(payment: Payment, db: Session) -> tuple[bool, Optional[str]]:
    """
    Check if payment exists in SePay transactions.
    
    Returns (matched: bool, transaction_id: str)
    """
    if not sepay_client:
        return False, None
    
    # Get transactions from SePay
    transactions = await sepay_client.get_transactions(limit=20)
    
    # Build regex pattern
    prefix = f"{settings.NAME_WEB}NAPTOKEN"
    pattern = rf"{prefix}\s*([A-Fa-f0-9]+)"
    
    target_hex = payment.hex_id
    
    for tx in transactions:
        content = tx.get("content", "").upper()
        amount = float(tx.get("amount_in", 0))
        
        # Search for hex code in content
        match = re.search(pattern, content, re.IGNORECASE)
        
        if match:
            found_hex = match.group(1).upper()
            
            # Check if hex matches and amount is sufficient
            if found_hex == target_hex and amount >= payment.amount_vnd:
                return True, tx.get("id")
    
    return False, None


@router.get("/packages")
async def get_packages():
    """Get available payment packages."""
    return {
        "packages": [
            {
                "id": pkg_id,
                "tokens": info["tokens"],
                "price_vnd": info["price_vnd"],
                "price_formatted": f"{info['price_vnd']:,.0f} VNĐ"
            }
            for pkg_id, info in PACKAGES.items()
        ]
    }


@router.get("/tokens")
async def get_user_tokens(current_user: User = Depends(get_current_user)):
    """Get current user's token balance."""
    return {"tokens": current_user.tokens or 0}


@router.get("/history")
async def get_payment_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get payment history for current user."""
    payments = db.query(Payment).filter(
        Payment.user_id == current_user.id
    ).order_by(Payment.created_at.desc()).all()
    
    return {
        "payments": [
            {
                "id": p.id,
                "package_id": p.package_id,
                "amount_vnd": p.amount_vnd,
                "tokens": p.tokens,
                "status": p.status,
                "hex_id": p.hex_id,
                "created_at": p.created_at,
                "expires_at": p.expires_at,
                "paid_at": p.paid_at
            }
            for p in payments
        ],
        "total": len(payments)
    }
# Thêm endpoint này vào cuối file payment.py

@router.post("/simulate/{payment_id}")
async def simulate_payment(
    payment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    [ADMIN ONLY] Simulate successful payment for testing.
    """
    # Check admin role
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # Get payment
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found"
        )
    
    if payment.status == 'completed':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment already completed"
        )
    
    # Update payment
    payment.status = 'completed'
    payment.paid_at = datetime.utcnow()
    payment.sepay_transaction_id = f"SIMULATED_{payment.id}"
    
    # Credit tokens to user
    user = db.query(User).filter(User.id == payment.user_id).first()
    if user:
        user.tokens = (user.tokens or 0) + payment.tokens
    
    db.commit()
    
    return {
        "success": True,
        "message": "Payment simulated successfully",
        "payment": {
            "id": payment.id,
            "status": payment.status,
            "tokens_added": payment.tokens
        },
        "user": {
            "id": user.id,
            "tokens": user.tokens
        }
    }