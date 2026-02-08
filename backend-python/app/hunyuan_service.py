import sys
import os
import base64
import uuid
# thêm path tới hunyuan3d
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HUNYUAN_PATH = os.path.join(BASE_DIR, "models", "hunyuan3d-2.1")
sys.path.insert(0, HUNYUAN_PATH)
from model_worker import ModelWorker

# KHỞI TẠO WORKER 1 LẦN
worker = ModelWorker(
    device="cuda",   # đổi cpu nếu test
    save_dir="output"
)

def convert3d_from_image_file(image_file):
    """
    image_file: file object (FastAPI UploadFile hoặc file-like)
    return: path file glb
    """

    # đọc bytes
    image_bytes = image_file.read()

    # encode base64
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")

    uid = str(uuid.uuid4())[:8]

    params = {
        "image": image_base64
    }

    output_path, _ = worker.generate(uid, params)

    return output_path
