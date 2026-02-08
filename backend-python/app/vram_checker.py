# backend-python/app/vram_checker.py
import torch

def check_vram():
    if torch.cuda.is_available():
        vram = torch.cuda.get_device_properties(0).total_memory / 1e9  # GB
        return {"status": "success", "vram": f"{vram:.2f} GB"}
    return {"status": "error", "message": "CUDA is not available"}
