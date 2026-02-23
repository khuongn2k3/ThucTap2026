"""
Test script for Hunyuan3D API — Multi-Image Support
Usage:
  # Test 1 ảnh
  python test_hunyuan3d.py front.png

  # Test nhiều ảnh (multi-view)
  python test_hunyuan3d.py front.png side.png back.png top.png
"""
import requests
import base64
import time
import json
from pathlib import Path


API_BASE_URL = "http://localhost:8000/api/v1"


# ============================================================
# Test 1: Worker Status
# ============================================================

def test_worker_status():
    print("\n" + "="*60)
    print("TEST 1: Worker Status")
    print("="*60)

    response = requests.get(f"{API_BASE_URL}/worker-status")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.json()


# ============================================================
# Test 2: Upload nhiều ảnh dạng multipart/form-data
# ============================================================

def test_file_upload(image_paths: list):
    """Upload 1-4 ảnh dạng multipart — endpoint /convert-3d/upload"""
    print("\n" + "="*60)
    print(f"TEST 2: Multi-File Upload ({len(image_paths)} ảnh)")
    print("="*60)

    # Mở tất cả file, build list tuples cho requests
    open_files = []
    file_handles = []

    try:
        for path in image_paths:
            fh = open(path, 'rb')
            file_handles.append(fh)
            open_files.append(
                ('files', (Path(path).name, fh, 'image/png'))
            )

        data = {
            'remove_background': 'true',
            'generate_texture': 'true'
        }

        print(f"Uploading: {[Path(p).name for p in image_paths]}")
        response = requests.post(
            f"{API_BASE_URL}/convert-3d/upload",
            files=open_files,
            data=data
        )
    finally:
        for fh in file_handles:
            fh.close()

    print(f"Status Code: {response.status_code}")

    if response.status_code != 200:
        print(f"Error: {response.text}")
        return None

    result = response.json()
    print(f"Response: {json.dumps(result, indent=2)}")
    return result.get("job_id")


# ============================================================
# Test 3: Upload nhiều ảnh dạng base64 JSON
# ============================================================

def test_base64_upload(image_paths: list):
    """Upload 1-4 ảnh dạng base64 JSON — endpoint /convert-3d"""
    print("\n" + "="*60)
    print(f"TEST 3: Multi-Base64 Upload ({len(image_paths)} ảnh)")
    print("="*60)

    images_base64 = []
    input_image_urls = []

    for path in image_paths:
        with open(path, 'rb') as f:
            data = f.read()
        images_base64.append(base64.b64encode(data).decode('utf-8'))
        # URL giả — trong thực tế lấy từ bước upload riêng
        input_image_urls.append(f"http://localhost:8000/uploads/{Path(path).name}")
        print(f"  Encoded: {Path(path).name} ({len(data):,} bytes)")

    payload = {
        "images_base64": images_base64,
        "input_image_urls": input_image_urls,
        "remove_background": True,
        "generate_texture": True
    }

    response = requests.post(
        f"{API_BASE_URL}/convert-3d",
        json=payload
    )

    print(f"Status Code: {response.status_code}")

    if response.status_code != 200:
        print(f"Error: {response.text}")
        return None

    result = response.json()
    print(f"Response: {json.dumps(result, indent=2)}")
    return result.get("job_id")


# ============================================================
# Test 4: Poll job status
# ============================================================

def test_job_status(job_id: str, max_wait: int = 600):
    """Poll /job-status/{job_id} đến khi completed hoặc failed"""
    print("\n" + "="*60)
    print("TEST 4: Job Status Polling")
    print("="*60)
    print(f"Job ID: {job_id}")

    start_time = time.time()

    while True:
        elapsed = time.time() - start_time

        if elapsed > max_wait:
            print(f"\n⏰ Timeout sau {max_wait}s")
            return None

        response = requests.get(f"{API_BASE_URL}/job-status/{job_id}")

        if response.status_code != 200:
            print(f"\n❌ HTTP {response.status_code}: {response.text}")
            return None

        result = response.json()
        status = result.get("status")

        print(f"\r⏱️  [{elapsed:.1f}s] Status: {status}   ", end="", flush=True)

        if status == "completed":
            print(f"\n✅ Completed!")
            print(f"  output_model_url: {result.get('output_model_url')}")
            return result

        elif status == "failed":
            print(f"\n❌ Failed!")
            print(f"  error: {result.get('error_message')}")
            return result

        elif status == "not_found":
            print(f"\n❌ Job not found")
            return result

        time.sleep(3)


# ============================================================
# Test 5: Download model
# ============================================================

def test_download(job_id: str, output_path: str = None):
    """Download file GLB từ /download/{job_id}.glb"""
    print("\n" + "="*60)
    print("TEST 5: Download Model")
    print("="*60)

    if output_path is None:
        output_path = f"output_{job_id[:8]}.glb"

    response = requests.get(f"{API_BASE_URL}/download/{job_id}.glb")

    if response.status_code == 200:
        with open(output_path, 'wb') as f:
            f.write(response.content)
        size_kb = len(response.content) / 1024
        print(f"✅ Saved: {output_path} ({size_kb:.1f} KB)")
        return output_path
    else:
        print(f"❌ Download failed: {response.status_code}")
        print(f"   {response.text}")
        return None


# ============================================================
# Test 6: Delete job
# ============================================================

def test_delete_job(job_id: str):
    print("\n" + "="*60)
    print("TEST 6: Delete Job")
    print("="*60)

    response = requests.delete(f"{API_BASE_URL}/job/{job_id}")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")


# ============================================================
# Full test suite
# ============================================================

def run_full_test(image_paths: list):
    """Chạy toàn bộ test suite với 1-4 ảnh"""
    print("\n" + "🚀" * 30)
    print(f"HUNYUAN3D API TEST SUITE — {len(image_paths)} ảnh")
    print("🚀" * 30)

    try:
        # Test 1: Worker status
        worker_status = test_worker_status()
        if not worker_status.get("initialized"):
            print("\n⚠️  Worker chưa init. Đang khởi động...")
            init_resp = requests.post(f"{API_BASE_URL}/worker/initialize")
            print(f"Init: {init_resp.json()}")
            time.sleep(5)

        # Test 2: File upload (multipart) — cách được khuyến nghị
        job_id = test_file_upload(image_paths)

        # Hoặc dùng base64:
        # job_id = test_base64_upload(image_paths)

        if not job_id:
            print("\n❌ Không lấy được job_id. Dừng test.")
            return

        # Test 4: Poll status
        result = test_job_status(job_id, max_wait=600)

        if result and result.get("status") == "completed":
            # Test 5: Download
            test_download(job_id)

            # Test 6: Cleanup (uncomment nếu muốn xóa sau test)
            # test_delete_job(job_id)

        print("\n" + "✅" * 30)
        print("TEST SUITE COMPLETED")
        print("✅" * 30)

    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()


# ============================================================
# Entry point
# ============================================================

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage:")
        print("  python test_hunyuan3d.py <image1> [image2] [image3] [image4]")
        print("")
        print("Examples:")
        print("  python test_hunyuan3d.py front.png")
        print("  python test_hunyuan3d.py front.png side.png back.png")
        sys.exit(1)

    paths = sys.argv[1:]

    # Validate paths
    for p in paths:
        if not Path(p).exists():
            print(f"❌ File không tồn tại: {p}")
            sys.exit(1)

    if len(paths) > 4:
        print(f"❌ Tối đa 4 ảnh, bạn truyền {len(paths)}")
        sys.exit(1)

    run_full_test(paths)