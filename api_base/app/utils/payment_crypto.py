"""
Payment ID encryption using XOR obfuscation.
"""

#  CHANGE THIS KEY FOR YOUR PROJECT!
SECRET_XOR_KEY = 0x5EAFB


def encode_payment_id(payment_id: int) -> str:
    """
    Encode payment ID to hex string using XOR.
    
    Example: 123 -> "5EA94"
    """
    return hex(payment_id ^ SECRET_XOR_KEY)[2:].upper()


def decode_payment_id(hex_str: str) -> int:
    """
    Decode hex string back to payment ID.
    
    Example: "5EA94" -> 123
    """
    try:
        return int(hex_str, 16) ^ SECRET_XOR_KEY
    except ValueError:
        raise ValueError(f"Invalid hex string: {hex_str}")