"""
Hunyuan3D-2mv Service — core improvements + SSE progress queue:
  1. Pipeline VRAM swapping (only one pipeline loaded at a time)
  2. Unload shape pipeline from VRAM immediately when texture is not requested
  3. Unload texture pipeline from VRAM immediately after Stage 2 completes
  4. Per-stage resource tracking (VRAM, RAM) and wall-clock timing
  5. asyncio.Queue per-job → real-time SSE progress push to frontend
"""
import sys
import uuid
import base64
import asyncio
import time
from pathlib import Path
from typing import Optional, Dict, Any

from PIL import Image
from io import BytesIO
from sqlalchemy.orm import Session

from app.config import settings
from app.models.task import ModelJob
from app.utils.fix_glb_mediatype import fix_glb_file

# ── sys.path ────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent.parent
MV_DIR   = BASE_DIR / "hunyuan3d-2mv"

if str(MV_DIR) not in sys.path:
    sys.path.insert(0, str(MV_DIR))

try:
    from hy3dgen.rembg import BackgroundRemover
    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
    from hy3dgen.texgen import Hunyuan3DPaintPipeline
    HUNYUAN3D_MV_AVAILABLE = True
    print(f"Hunyuan3D-2mv imported from {MV_DIR}")
except ImportError as e:
    print(f"⚠️  Hunyuan3D-2mv import failed: {e}")
    BackgroundRemover = None
    Hunyuan3DDiTFlowMatchingPipeline = None
    Hunyuan3DPaintPipeline = None
    HUNYUAN3D_MV_AVAILABLE = False

# Minimum free VRAM required before a job is allowed to run
SHAPE_VRAM_REQUIRED_GB   = 14.0
TEXTURE_VRAM_REQUIRED_GB = 14.0


# ════════════════════════════════════════════════════════════════════════════
# Helpers: resource monitoring
# ════════════════════════════════════════════════════════════════════════════

def _get_resources() -> Dict[str, float]:
    """Return current VRAM and RAM usage as a dict (values in GB)."""
    info: Dict[str, float] = {}

    # VRAM
    try:
        import torch
        if torch.cuda.is_available():
            vram_used  = torch.cuda.memory_allocated() / 1024**3
            vram_peak  = torch.cuda.max_memory_allocated() / 1024**3
            vram_total = torch.cuda.get_device_properties(0).total_memory / 1024**3
            info["vram_used_gb"]  = round(vram_used,  2)
            info["vram_peak_gb"]  = round(vram_peak,  2)
            info["vram_free_gb"]  = round(vram_total - vram_used, 2)
            info["vram_total_gb"] = round(vram_total, 2)
        else:
            info["vram_used_gb"] = info["vram_peak_gb"] = info["vram_free_gb"] = info["vram_total_gb"] = 0.0
    except Exception:
        info["vram_used_gb"] = info["vram_peak_gb"] = info["vram_free_gb"] = info["vram_total_gb"] = -1.0

    # RAM
    try:
        import psutil
        ram = psutil.virtual_memory()
        info["ram_used_gb"]  = round(ram.used  / 1024**3, 2)
        info["ram_free_gb"]  = round(ram.available / 1024**3, 2)
        info["ram_total_gb"] = round(ram.total / 1024**3, 2)
    except Exception:
        info["ram_used_gb"] = info["ram_free_gb"] = info["ram_total_gb"] = -1.0

    return info


def _reset_vram_peak():
    """Reset peak VRAM counter. Call before each stage for accurate peak measurement."""
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
    except Exception:
        pass


def _log_resources(label: str, before: Dict, after: Dict, duration: float):
    """Log resource usage comparison (before vs after) for a stage."""
    print(f"\n{'─'*55}")
    print(f"📊 {label}")
    print(f"   ⏱️  Duration    : {duration:.1f}s ({duration/60:.1f} min)")
    print(f"   🎮 VRAM used  : {before['vram_used_gb']:.2f}GB → {after['vram_used_gb']:.2f}GB "
          f"(+{after['vram_used_gb']-before['vram_used_gb']:.2f}GB)")
    print(f"   🎮 VRAM peak  : {after['vram_peak_gb']:.2f}GB")
    print(f"   🎮 VRAM free  : {before['vram_free_gb']:.2f}GB → {after['vram_free_gb']:.2f}GB")
    print(f"   🧠 RAM used   : {before['ram_used_gb']:.2f}GB → {after['ram_used_gb']:.2f}GB "
          f"(+{after['ram_used_gb']-before['ram_used_gb']:.2f}GB)")
    print(f"{'─'*55}\n")


def _build_metrics(before: Dict, after: Dict, duration: float) -> Dict[str, Any]:
    """Build a metrics dict for inclusion in the API response."""
    return {
        "duration_seconds":   round(duration, 2),
        "duration_minutes":   round(duration / 60, 2),
        "vram_before_gb":     before["vram_used_gb"],
        "vram_after_gb":      after["vram_used_gb"],
        "vram_peak_gb":       after["vram_peak_gb"],
        "vram_delta_gb":      round(after["vram_used_gb"] - before["vram_used_gb"], 2),
        "vram_free_after_gb": after["vram_free_gb"],
        "ram_before_gb":      before["ram_used_gb"],
        "ram_after_gb":       after["ram_used_gb"],
        "ram_delta_gb":       round(after["ram_used_gb"] - before["ram_used_gb"], 2),
    }


def _build_mesh_metrics(glb_path: Path, n_samples: int = 10_000) -> Dict[str, Any]:
    """
    Xuất toàn bộ thông số chất lượng mesh từ file GLB sau mỗi stage.

    Trả về dict gồm:
      Topology  : vertex_count, face_count, edge_count, is_watertight, is_winding_consistent
      Geometry  : surface_area, volume (nếu watertight), bounding_box (size + volume),
                  centroid, aspect_ratio
      Chất lượng: euler_number, num_components, degenerate_faces,
                  duplicate_faces, unreferenced_vertices
      Texture   : has_texture, has_uv, texture_count (chỉ có sau Stage 2)
    """
    result: Dict[str, Any] = {}
    try:
        import trimesh
        import numpy as np

        scene_or_mesh = trimesh.load(str(glb_path), force="scene")

        # Gom tất cả geometry trong scene thành 1 mesh tổng hợp
        if hasattr(scene_or_mesh, "geometry") and scene_or_mesh.geometry:
            meshes = list(scene_or_mesh.geometry.values())
            if len(meshes) == 1:
                mesh = meshes[0]
            else:
                mesh = trimesh.util.concatenate(meshes)
        elif isinstance(scene_or_mesh, trimesh.Trimesh):
            mesh = scene_or_mesh
        else:
            result["mesh_metrics_error"] = "Không parse được mesh từ GLB"
            return result

        # ── Topology ──────────────────────────────────────────────────
        result["vertex_count"]            = int(len(mesh.vertices))
        result["face_count"]              = int(len(mesh.faces))
        result["edge_count"]              = int(len(mesh.edges_unique))
        result["is_watertight"]           = bool(mesh.is_watertight)
        result["is_winding_consistent"]   = bool(mesh.is_winding_consistent)

        # ── Geometry ──────────────────────────────────────────────────
        result["surface_area"]            = round(float(mesh.area), 6)
        result["volume"]                  = round(float(mesh.volume), 6) if mesh.is_watertight else None

        bb = mesh.bounding_box
        bb_extents = mesh.bounding_box.extents.tolist()
        result["bounding_box"] = {
            "size_x": round(bb_extents[0], 6),
            "size_y": round(bb_extents[1], 6),
            "size_z": round(bb_extents[2], 6),
            "volume": round(float(np.prod(bb_extents)), 6),
        }
        result["centroid"] = [round(float(v), 6) for v in mesh.centroid]
        if bb_extents and min(bb_extents) > 0:
            result["aspect_ratio"] = round(max(bb_extents) / min(bb_extents), 4)

        # ── Chất lượng mesh ───────────────────────────────────────────
        result["euler_number"]            = int(mesh.euler_number)
        # num_components, degenerate_faces, duplicate_faces, unreferenced_vertices
        # đã bỏ — quá nặng với mesh lớn (400k+ faces gây OOM)

        # ── Texture / UV (đọc từ GLB JSON header) ─────────────────────
        try:
            import struct, json as _json
            data = glb_path.read_bytes()
            if len(data) > 20 and struct.unpack_from('<I', data, 0)[0] == 0x46546C67:
                json_len = struct.unpack_from('<I', data, 12)[0]
                glb_json = _json.loads(data[20:20 + json_len].decode('utf-8', errors='ignore'))
                result["has_texture"]     = bool(glb_json.get("textures"))
                result["texture_count"]   = len(glb_json.get("textures", []))
                result["has_uv"]          = any(
                    "TEXCOORD_0" in prim.get("attributes", {})
                    for m in glb_json.get("meshes", [])
                    for prim in m.get("primitives", [])
                )
        except Exception:
            result["has_texture"] = None
            result["texture_count"] = None
            result["has_uv"] = None

        print(
            f"📐 Mesh metrics: {result['vertex_count']:,} verts | "
            f"{result['face_count']:,} faces | "
            f"watertight={result['is_watertight']} | "
            f"area={result['surface_area']:.4f} | "
            f"volume={result['volume']}"
        )

    except Exception as e:
        result["mesh_metrics_error"] = str(e)
        print(f"⚠️  _build_mesh_metrics failed: {e}")

    return result


# ════════════════════════════════════════════════════════════════════════════
# Service
# ════════════════════════════════════════════════════════════════════════════

class Hunyuan3DMvService:
    _instance    = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._initialized:
            self.shape_pipeline: Optional[object] = None
            self.tex_pipeline:   Optional[object] = None
            self.rembg:          Optional[object] = None
            self.task_cache: Dict[str, Dict[str, Any]] = {}
            self._tex_thread_active: bool = False  # Bug2 fix: track whether texture thread is active

            # Job queue — replaces hard locking
            # Each item is a dict describing one pending job
            self._pending_queue: asyncio.Queue = asyncio.Queue()
            self._worker_task: Optional[asyncio.Task] = None

            # ── ETA stats — rolling average duration (seconds) ───────────
            # Tracked separately for shape and texture (different runtimes)
            # Each entry: deque capped at 10 most recent samples
            from collections import deque
            self._duration_stats: Dict[str, Any] = {
                "shape":   deque(maxlen=10),
                "texture": deque(maxlen=10),
            }
            # Fallback defaults when no real data is available yet
            self._duration_defaults: Dict[str, float] = {
                "shape":   90.0,
                "texture": 90.0,
            }

            # ── SSE Queue registry ───────────────────────────────────────
            # Map job_id → asyncio.Queue
            # Queue item format: dict with keys: event, data
            # event: "progress" | "completed" | "failed" | "heartbeat" | "cancelled"
            self._sse_queues: Dict[str, asyncio.Queue] = {}

            # ── Cancel registry ──────────────────────────────────────────
            # Set chứa job_id đã được yêu cầu hủy.
            # Worker và background tasks check set này để:
            #   - Pending: bỏ qua khi pull từ queue (không tốn VRAM)
            #   - Processing: unload pipeline ngay sau khi inference xong
            self._cancelled_jobs: set = set()

            self._initialized = True
            print("Hunyuan3D-2mv Service initialized (singleton)")
            self._load_eta_stats()

    # ────────────────────────────────────────────────────────────────────────
    # SSE Queue helpers
    # ────────────────────────────────────────────────────────────────────────

    def create_queue(self, job_id: str) -> asyncio.Queue:
        """Tạo queue mới cho job. Gọi từ coroutine (event loop thread)."""
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._sse_queues[job_id] = q
        return q

    def get_queue(self, job_id: str) -> Optional[asyncio.Queue]:
        """Lấy queue của job nếu còn tồn tại."""
        return self._sse_queues.get(job_id)

    def release_queue(self, job_id: str):
        """Xóa queue sau khi SSE connection đóng."""
        self._sse_queues.pop(job_id, None)

    async def request_cancel(self, job_id: str):
        """
        Yêu cầu hủy một job.

        Hành vi tùy theo trạng thái job:
        • **pending** (đang chờ trong queue): bị bỏ qua khi worker pull ra,
          không tốn VRAM, giải phóng ngay lập tức.
        • **processing** (pipeline đang chạy trên GPU): không thể ngắt GPU
          kernel giữa chừng — nhưng ngay khi inference step hiện tại kết thúc,
          pipeline sẽ bị unload và VRAM được giải phóng, thay vì tiếp tục
          lưu file / tạo thumbnail / gallery submission như bình thường.

        Trong cả hai trường hợp, DB status đã được set thành 'cancelled'
        bởi admin endpoint trước khi method này được gọi.
        """
        self._cancelled_jobs.add(job_id)
        if job_id in self.task_cache:
            self.task_cache[job_id]["cancel_requested"] = True

        # Push SSE để frontend biết ngay (nếu user đang xem job)
        await self._push_event_async(job_id, "cancelled", {
            "job_id":  job_id,
            "message": "Job đã bị hủy bởi admin",
        })
        print(f"Cancel requested: {job_id}")

    @staticmethod
    def _safe_put_nowait(q, item: dict):
        """Gọi từ call_soon_threadsafe — catch QueueFull silently."""
        try:
            q.put_nowait(item)
        except asyncio.QueueFull:
            pass  # queue full → drop event, không crash

    def _push_event(self, job_id: str, event: str, data: Dict[str, Any],
                    loop: asyncio.AbstractEventLoop = None):
        """
        Push event vào queue của job.
        SAFE để gọi từ thread (run_in_executor) bằng call_soon_threadsafe.
        Phải truyền `loop` (lấy từ asyncio.get_running_loop() trong coroutine).
        Nếu gọi từ coroutine thì dùng _push_event_async thay thế.
        """
        pct = data.get("percent", "")
        msg = data.get("message", "")
        pct_str = f" {pct}%" if pct != "" else ""
        print(f"[SSE] {job_id[:12]} | {event}{pct_str} | {msg}")
        q = self._sse_queues.get(job_id)
        if q is None:
            return  # client chưa connect SSE hoặc đã disconnect
        if loop is None:
            return  # không có loop → bỏ qua, tránh crash thread
        item = {"event": event, "data": data}
        try:
            # Dùng _safe_put_nowait để QueueFull không leak ra stderr
            loop.call_soon_threadsafe(self._safe_put_nowait, q, item)
        except Exception:
            pass  # loop đã đóng → bỏ qua

    async def _push_event_async(self, job_id: str, event: str, data: Dict[str, Any]):
        """Push event từ coroutine (async context)."""
        q = self._sse_queues.get(job_id)
        pct = data.get("percent", "")
        msg = data.get("message", "")
        pct_str = f" {pct}%" if pct != "" else ""
        print(f"[SSE] {job_id[:12]} | {event}{pct_str} | {msg}")
        if q is None:
            return
        try:
            await q.put({"event": event, "data": data})
        except Exception:
            pass

    # ────────────────────────────────────────────────────────────────────────
    # ETA helpers
    # ────────────────────────────────────────────────────────────────────────

    def _eta_stats_path(self) -> Path:
        return Path(settings.DOWNLOAD_DIR) / "eta_stats.json"

    def _load_eta_stats(self):
        """Đọc stats từ file JSON khi khởi động."""
        try:
            path = self._eta_stats_path()
            if path.exists():
                import json
                data = json.loads(path.read_text())
                from collections import deque
                for stage in ("shape", "texture"):
                    samples = data.get(stage, [])
                    self._duration_stats[stage] = deque(samples[-10:], maxlen=10)
                print(f"📊 ETA stats loaded: shape={list(self._duration_stats['shape'])}, texture={list(self._duration_stats['texture'])}")
        except Exception as e:
            print(f"⚠️  ETA stats load failed: {e}")

    def _save_eta_stats(self):
        """Ghi stats ra file JSON sau mỗi lần cập nhật."""
        try:
            import json
            data = {
                "shape":   list(self._duration_stats["shape"]),
                "texture": list(self._duration_stats["texture"]),
            }
            self._eta_stats_path().write_text(json.dumps(data, indent=2))
        except Exception as e:
            print(f"⚠️  ETA stats save failed: {e}")

    def _record_duration(self, stage: str, duration: float):
        """Lưu duration thực tế vào rolling stats sau khi job xong."""
        if stage in self._duration_stats:
            self._duration_stats[stage].append(round(duration, 1))
            self._save_eta_stats()

    def _get_eta(self, stage: str) -> float:
        """Trả về ETA ước tính (giây) dựa trên trung bình rolling."""
        samples = self._duration_stats.get(stage)
        if samples:
            return round(sum(samples) / len(samples), 1)
        return self._duration_defaults.get(stage, 90.0)

    # ────────────────────────────────────────────────────────────────────────
    # Job queue worker
    # ────────────────────────────────────────────────────────────────────────

    def _ensure_worker(self):
        """Khởi động worker nếu chưa chạy."""
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._queue_worker())

    async def _queue_worker(self):
        """
        Worker chạy ngầm, lấy job từ queue ra chạy lần lượt.
        Trước mỗi job kiểm tra VRAM còn đủ không — đủ thì chạy, không thì chờ.
        """
        while True:
            try:
                descriptor = await asyncio.wait_for(
                    self._pending_queue.get(), timeout=60.0
                )
            except asyncio.TimeoutError:
                # Không có job nào trong 60s → dừng worker, sẽ khởi động lại khi có job mới
                self._worker_task = None
                return

            job_id   = descriptor["job_id"]
            job_type = descriptor["type"]  # "shape" hoặc "texture"
            required = SHAPE_VRAM_REQUIRED_GB if job_type == "shape" else TEXTURE_VRAM_REQUIRED_GB

            # 🛑 Job đã bị hủy trong lúc chờ queue → bỏ qua, không tốn VRAM
            if job_id in self._cancelled_jobs:
                self._cancelled_jobs.discard(job_id)
                self.task_cache.pop(job_id, None)
                print(f"⏭️  [{job_id}] Job đã bị hủy khi còn pending — bỏ qua, VRAM không bị dùng")
                continue

            # Kiểm tra VRAM trước khi chạy
            while True:
                res = _get_resources()
                free = res.get("vram_free_gb", 99.0)
                # free <= 0 nghĩa là không có GPU → cứ chạy (CPU mode)
                if free >= required or free <= 0:
                    break
                await self._push_event_async(job_id, "progress", {
                    "stage": job_type, "step": "waiting_vram",
                    "message": f"Chờ VRAM... (cần {required}GB, còn {free:.1f}GB)",
                })
                await asyncio.sleep(10)

            # Tạo event để biết khi nào job xong → mới lấy job tiếp theo
            done_event = asyncio.Event()

            if job_type == "shape":
                asyncio.create_task(self._run_shape_bg(
                    **descriptor["kwargs"], done_event=done_event
                ))
            else:
                asyncio.create_task(self._run_texture_bg(
                    **descriptor["kwargs"], done_event=done_event
                ))

            # Chờ job hiện tại xong mới xử lý job tiếp theo
            await done_event.wait()

    # ────────────────────────────────────────────────────────────────────────
    # ────────────────────────────────────────────────────────────────────────

    def unload_shape_pipeline(self):
        """Public method — gọi từ router khi user uncheck texture sau Stage 1."""
        self._unload_shape()

    def _unload_shape(self):
        """Xóa shape pipeline khỏi VRAM."""
        if self.shape_pipeline is not None:
            import torch
            del self.shape_pipeline
            self.shape_pipeline = None
            torch.cuda.empty_cache()
            print("🗑️  Shape pipeline unloaded from VRAM")

    def _unload_texture(self):
        """Xóa texture pipeline khỏi VRAM."""
        import torch, gc
        # Bug2 fix: không xóa pipeline khi thread đang dùng → tránh zombie thread crash
        if getattr(self, '_tex_thread_active', False):
            print("⚠️  Texture thread đang chạy, bỏ qua unload để tránh zombie thread")
            return
        if self.tex_pipeline is not None:
            del self.tex_pipeline
            self.tex_pipeline = None
            print("🗑️  Texture pipeline unloaded from VRAM")
        gc.collect()
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()


    # ────────────────────────────────────────────────────────────────────────
    # Load pipeline
    # ────────────────────────────────────────────────────────────────────────

    async def initialize_shape_pipeline(self):
        if not HUNYUAN3D_MV_AVAILABLE:
            raise RuntimeError(f"Hunyuan3D-2mv chưa cài. Kiểm tra: {MV_DIR}")
        if self.shape_pipeline is not None:
            return
        self._unload_texture()
        print("🚀 Loading shape pipeline (hunyuan3d-dit-v2-mv-fast)...")
        await asyncio.get_running_loop().run_in_executor(None, self._load_shape)
        print("Shape pipeline ready!")

    async def initialize_tex_pipeline(self):
        if not HUNYUAN3D_MV_AVAILABLE:
            raise RuntimeError(f"Hunyuan3D-2mv chưa cài. Kiểm tra: {MV_DIR}")
        if self.tex_pipeline is not None:
            return
        self._unload_shape()
        print("🚀 Loading texture pipeline (hunyuan3d-paint-v2-0-turbo)...")
        await asyncio.get_running_loop().run_in_executor(None, self._load_tex)
        print("Texture pipeline ready!")

    def _load_shape(self):
        self.shape_pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            str(MV_DIR / 'hunyuan3d-dit-v2-mv-fast'),
            subfolder='',
            variant='fp16',
            device=settings.HUNYUAN3D_DEVICE  
        )
        self.rembg = BackgroundRemover()

    def _load_tex(self):
        try:
            from hy3dgen.texgen import pipelines as tex_pipelines
            tex_pipelines.List = list
        except Exception:
            pass

        self.tex_pipeline = Hunyuan3DPaintPipeline.from_pretrained(
            str(MV_DIR),
            subfolder='hunyuan3d-paint-v2-0',
        )

        # Đảm bảo rembg luôn có khi texture pipeline được load.
        # Fix: nếu Stage 2 chạy sau server restart (không qua Stage 1 trong session này)
        # thì self.rembg = None → bỏ qua remove background → texture sai.
        if self.rembg is None:
            self.rembg = BackgroundRemover()
            print("BackgroundRemover loaded alongside texture pipeline")
	

    # ────────────────────────────────────────────────────────────────────────
    # STAGE 1 — Shape generation
    # ────────────────────────────────────────────────────────────────────────

    async def generate_shape(
        self,
        db: Session,
        images_base64: Dict[str, str],
        input_image_url: str,
        remove_background: bool = True,
        num_inference_steps: int = 50,
        octree_resolution: int = 380,
        polycount: Optional[int] = None,
        guidance_scale: float = 5.0,
        user_id: Optional[int] = None,
        model_name: Optional[str] = None,

        front_image_url: Optional[str] = None,
        left_image_url: Optional[str] = None,
        right_image_url: Optional[str] = None,
        back_image_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        if "front" not in images_base64:
            raise ValueError("Thiếu ảnh 'front'")

        job_id = str(uuid.uuid4())
        job = ModelJob(
            user_id=user_id, job_id=job_id,
            status='pending', input_image_url=input_image_url,
            model_name=model_name, has_texture=False,

            front_image_url=front_image_url,
            left_image_url=left_image_url,
            right_image_url=right_image_url,
            back_image_url=back_image_url,
        )
        db.add(job); db.commit(); db.refresh(job)
        print(f"[Stage 1] Shape job created: {job_id}")

        self.task_cache[job_id] = {"status": "pending", "stage": "shape"}
        self.create_queue(job_id)

        # Tính vị trí trong queue để thông báo cho user
        queue_position = self._pending_queue.qsize() + 1

        # Đẩy vào queue — worker sẽ tự lấy ra chạy khi VRAM đủ
        await self._pending_queue.put({
            "type": "shape",
            "job_id": job_id,
            "kwargs": {
                "job_id":               job_id,
                "images_base64":        images_base64,
                "remove_background":    remove_background,
                "num_inference_steps":  num_inference_steps,
                "octree_resolution":    octree_resolution,
                "polycount":            polycount,
                "guidance_scale":       guidance_scale,
            },
        })

        await self._push_event_async(job_id, "progress", {
            "stage": "shape", "step": "queued",
            "message": f"Đang xếp hàng (vị trí {queue_position})...",
            "queue_position": queue_position,
        })

        # Khởi động worker nếu chưa chạy
        self._ensure_worker()

        return {
            "job_id": job_id, "status": "pending", "stage": "shape",
            "message": "Stage 1 (shape) đã vào hàng chờ",
            "eta_shape":   self._get_eta("shape"),
            "eta_texture": self._get_eta("texture"),
        }

    async def _run_shape_bg(self, job_id, images_base64, remove_background,
                             num_inference_steps, octree_resolution, polycount, guidance_scale,
                             done_event: asyncio.Event = None):
        from app.models.base_db import SessionLocal
        db = SessionLocal()
        try:
            self._set_status(db, job_id, "processing")

            # Push ETA ngay khi bắt đầu — trước khi load pipeline
            await self._push_event_async(job_id, "progress", {
                "stage": "shape", "step": "start",
                "message": "Stage 1 bắt đầu — đang chuẩn bị pipeline...",
                "eta_seconds": self._get_eta("shape"),
            })

            # Load pipeline nếu chưa có (swap: unload texture trước)
            if self.shape_pipeline is None:
                self._unload_texture()
                print("🚀 Loading shape pipeline...")
                loop_load = asyncio.get_running_loop()
                await loop_load.run_in_executor(None, self._load_shape)
                print("Shape pipeline ready!")

            pil_images = self._decode_images(images_base64, remove_background)

            _reset_vram_peak()
            res_before = _get_resources()
            print(f"\n🔷 [{job_id}] Stage 1 START")

            await self._push_event_async(job_id, "progress", {
                "stage": "shape", "step": "pipeline",
                "message": f"Đang chạy shape pipeline ({num_inference_steps} steps)...",
                "vram_free_gb": res_before.get("vram_free_gb"),
            })

            # [BUG1+3 FIX] lấy running loop trong coroutine → truyền vào thread
            loop = asyncio.get_running_loop()
            t_start = time.time()
            # _do_shape chạy trong thread — dùng _push_event (thread-safe) với loop
            output_path = await asyncio.wait_for(
                loop.run_in_executor(
                    None, self._do_shape,
                    job_id, pil_images, num_inference_steps, octree_resolution, polycount, guidance_scale, loop
                ),
                timeout=900  # 15 phút — đủ cho octree=512 + steps=100
            )
            duration = time.time() - t_start

            res_after = _get_resources()
            _log_resources(f"[{job_id}] Stage 1 DONE", res_before, res_after, duration)
            metrics = _build_metrics(res_before, res_after, duration)
            self._record_duration("shape", duration)

            # 🛑 Check cancel: inference xong nhưng job đã bị hủy trong lúc GPU chạy
            # Giải phóng VRAM ngay, bỏ qua save/thumbnail/gallery
            if job_id in self._cancelled_jobs:
                self._cancelled_jobs.discard(job_id)
                self._unload_shape()
                self.task_cache.pop(job_id, None)
                print(f"[{job_id}] Shape inference xong nhưng job đã bị hủy — unload VRAM, bỏ qua save")
                await self._push_event_async(job_id, "cancelled", {
                    "stage": "shape",
                    "message": "Job đã bị hủy, VRAM đã giải phóng",
                    "vram_freed": True,
                })
                return  # finally sẽ set done_event → worker tiếp tục job kế

            output_url = f"{settings.EXTERNAL_URL}/api/v1/download/{job_id}/white"

            job = db.query(ModelJob).filter(ModelJob.job_id == job_id).first()

            try:
                from app.services.thumbnail_renderer import render_thumbnail
                thumb_bytes = render_thumbnail(str(output_path))
                if thumb_bytes:
                    thumb_dir = Path(settings.UPLOAD_TEMP_DIR) / "thumbnails"
                    thumb_dir.mkdir(parents=True, exist_ok=True)
                    thumb_path = thumb_dir / f"{job_id}.webp"
                    thumb_path.write_bytes(thumb_bytes)
                    thumb_url = f"{settings.EXTERNAL_URL}/uploads/thumbnails/{job_id}.webp"
                    if job:
                        # Backup ảnh gốc vào front_image_url trước khi overwrite
                        if not job.front_image_url and job.input_image_url:
                            job.front_image_url = job.input_image_url
                        job.input_image_url = thumb_url
                        db.commit()
                    print(f"🖼️  [{job_id}] Stage 1 thumbnail OK → {thumb_url}")
                else:
                    print(f"⚠️  [{job_id}] Stage 1 thumbnail trả về None, bỏ qua")
            except Exception as thumb_err:
                print(f"⚠️  [{job_id}] Stage 1 thumbnail thất bại (bỏ qua, job vẫn OK): {thumb_err}")

            if job:
                job.status = 'completed'
                job.output_model_url = output_url
                job.has_texture = False
                try:
                    _, _, faces, vertices = self._parse_glb_flags(output_path)
                    if faces is not None: job.faces = faces
                    if vertices is not None: job.vertices = vertices
                except Exception:
                    pass
                db.commit()

            submission_id = None
            try:
                from app.models.gallery_submission import GallerySubmission
                import uuid as _uuid_mod
                if job and job.user_id:
                    sub = GallerySubmission(
                        uuid=str(_uuid_mod.uuid4()),
                        user_id=job.user_id,
                        model_name="Generated Model",
                        image_url=job.input_image_url,
                        model_url=output_url,
                        faces=job.faces,
                        vertices=job.vertices,
                        is_public=False,
                        source="convert3d",
                    )
                    db.add(sub)
                    db.commit()
                    db.refresh(sub)
                    submission_id = sub.id
                    job.submission_id = submission_id
                    db.commit()
            except Exception as sub_err:
                print(f"⚠️  Auto-submission warning (Stage 1): {sub_err}")

            if job:
                job.metrics = metrics
                db.commit()

            self.task_cache.pop(job_id, None)

            # SSE: thông báo hoàn tất
            await self._push_event_async(job_id, "completed", {
                "stage": "shape",
                "output_model_url": output_url,
                "submission_id": submission_id,
                "metrics": metrics,
                "message": f"Stage 1 xong! ({duration:.0f}s)",
            })

        except Exception as e:
            import traceback; traceback.print_exc()
            job = db.query(ModelJob).filter(ModelJob.job_id == job_id).first()
            if job:
                job.status = 'failed'; job.error_message = str(e); db.commit()
            self.task_cache.pop(job_id, None)
            self._unload_shape()

            # SSE: thông báo lỗi
            await self._push_event_async(job_id, "failed", {
                "stage": "shape", "error": str(e),
                "message": f"Stage 1 thất bại: {e}",
            })
            print(f"[Stage 1] {job_id} failed: {e}")
        finally:
            db.close()
            if done_event:
                done_event.set()  # Báo cho worker biết job xong → lấy job tiếp theo

    def _do_shape(self, job_id, pil_images, num_inference_steps, octree_resolution,
                  polycount=None, guidance_scale=5.0,
                  loop: asyncio.AbstractEventLoop = None) -> Path:
        """Chạy trong thread pool. Dùng _push_event (thread-safe) để push SSE."""
        import torch
        print(f"[{job_id}] Running shape pipeline (guidance_scale={guidance_scale})...")

        # Push progress từ thread — thread-safe qua call_soon_threadsafe
        self._push_event(job_id, "progress", {
            "stage": "shape", "step": "diffusion",
            "message": "Diffusion model đang chạy...",
        }, loop=loop)

        mesh = self.shape_pipeline(
            image=pil_images,
            num_inference_steps=num_inference_steps,
            octree_resolution=octree_resolution,
            guidance_scale=guidance_scale,
            num_chunks=20000,
            generator=torch.manual_seed(12345),
            output_type='trimesh',
        )[0]

        if polycount and polycount > 0:
            self._push_event(job_id, "progress", {
                "stage": "shape", "step": "decimate",
                "message": f"Decimating mesh → {polycount:,} faces...",
            }, loop=loop)
            mesh = self._decimate_mesh(job_id, mesh, polycount)

        self._push_event(job_id, "progress", {
            "stage": "shape", "step": "save",
            "message": "Đang lưu white mesh...",
        }, loop=loop)

        save_dir = Path(settings.DOWNLOAD_DIR)
        save_dir.mkdir(parents=True, exist_ok=True)
        output_path = save_dir / f"{job_id}.white.glb"
        mesh.export(str(output_path))
        print(f"[{job_id}] White mesh saved → {output_path}")
        return output_path

    def _decimate_mesh(self, job_id: str, mesh, target_faces: int):
        """Giảm số polygon về target_faces dùng pymeshlab quadric edge collapse."""
        try:
            import pymeshlab
            import tempfile, os

            with tempfile.NamedTemporaryFile(suffix=".obj", delete=False) as tmp_in:
                tmp_in_path = tmp_in.name
            with tempfile.NamedTemporaryFile(suffix=".obj", delete=False) as tmp_out:
                tmp_out_path = tmp_out.name

            mesh.export(tmp_in_path)
            current_faces = len(mesh.faces)
            print(f"🔧 [{job_id}] Decimating: {current_faces:,} → {target_faces:,} faces")

            ms = pymeshlab.MeshSet()
            ms.load_new_mesh(tmp_in_path)
            ms.simplification_quadric_edge_collapse_decimation(
                targetfacenum=target_faces,
                preservenormal=True,
                preservetopology=True,
            )
            ms.save_current_mesh(tmp_out_path)

            import trimesh
            import numpy as np
            # process=False để không merge vertices — giữ nguyên topology sau decimate
            decimated = trimesh.load(tmp_out_path, process=False)

            # pymeshlab đôi khi không ghi vn vào OBJ sau decimate
            # → NORMAL attribute mất khi export GLB → shader render đen/sai
            # Fix: force tính lại vertex normals nếu bị mất hoặc toàn 0
            vn = decimated.vertex_normals  # trigger trimesh lazy computation
            if vn is None or not np.any(vn):
                print(f"⚠️  [{job_id}] No normals after decimate — recomputing from faces")
                decimated.fix_normals()
            _ = decimated.vertex_normals.copy()  # ensure normals flushed to buffer

            actual_faces = len(decimated.faces)
            print(f"[{job_id}] Decimation done: {actual_faces:,} faces | "
                  f"has_normals={np.any(decimated.vertex_normals)}")

            os.unlink(tmp_in_path)
            os.unlink(tmp_out_path)
            return decimated

        except ImportError:
            print(f"⚠️  [{job_id}] pymeshlab không có, bỏ qua decimation")
            return mesh
        except Exception as e:
            print(f"⚠️  [{job_id}] Decimation failed: {e}, dùng mesh gốc")
            return mesh

    # ────────────────────────────────────────────────────────────────────────
    # STAGE 2 — Texture generation
    # ────────────────────────────────────────────────────────────────────────

    async def generate_texture(
        self,
        db: Session,
        shape_job_id: str,
        front_image_base64: str,
        texture_4k: bool = False,
        user_id: Optional[int] = None,
        images_base64: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        shape_job = db.query(ModelJob).filter(
            ModelJob.job_id == shape_job_id,
            ModelJob.user_id == user_id,
        ).first()
        if not shape_job or shape_job.status != 'completed':
            # Không phân biệt "không tồn tại" vs "không phải của bạn" → tránh lộ thông tin
            current_status = shape_job.status if shape_job else 'not_found'
            raise ValueError(
                f"Stage 1 chưa hoàn tất (status={current_status}). "
                "Hãy đợi Stage 1 completed trước khi chạy Stage 2."
            )

        white_mesh_path = Path(settings.DOWNLOAD_DIR) / f"{shape_job_id}.white.glb"
        if not white_mesh_path.exists():
            raise FileNotFoundError(
                f"White mesh của job '{shape_job_id}' không tìm thấy. "
                "Hãy chạy Stage 1 trước và đợi status=completed."
            )

        input_image_url = shape_job.input_image_url
        model_name = shape_job.model_name

        tex_job_id = str(uuid.uuid4())
        tex_job = ModelJob(
            user_id=user_id, job_id=tex_job_id,
            status='pending', input_image_url=input_image_url,
            has_texture=False, model_name=model_name,
        )
        db.add(tex_job); db.commit(); db.refresh(tex_job)
        print(f"[Stage 2] Texture job created: {tex_job_id} (shape: {shape_job_id})")

        self.task_cache[tex_job_id] = {
            "status": "pending", "stage": "texture", "shape_job_id": shape_job_id,
        }
        self.create_queue(tex_job_id)

        queue_position = self._pending_queue.qsize() + 1

        await self._pending_queue.put({
            "type": "texture",
            "job_id": tex_job_id,
            "kwargs": {
                "tex_job_id":           tex_job_id,
                "shape_job_id":         shape_job_id,
                "front_image_base64":   front_image_base64,
                "texture_4k":           texture_4k,
                "images_base64":        images_base64,
            },
        })

        await self._push_event_async(tex_job_id, "progress", {
            "stage": "texture", "step": "queued",
            "message": f"Đang xếp hàng (vị trí {queue_position})...",
            "queue_position": queue_position,
        })

        self._ensure_worker()

        return {
            "job_id": tex_job_id, "shape_job_id": shape_job_id,
            "status": "pending", "stage": "texture",
            "message": "Stage 2 (texture) đã vào hàng chờ",
            "eta_texture": self._get_eta("texture"),
        }

    async def _run_texture_bg(self, tex_job_id, shape_job_id, front_image_base64, texture_4k=False,
                               images_base64: Optional[Dict[str, str]] = None,
                               done_event: asyncio.Event = None):
        from app.models.base_db import SessionLocal
        db = SessionLocal()
        try:
            self._set_status(db, tex_job_id, "processing")

            # Push ETA ngay khi bắt đầu — trước khi load pipeline
            await self._push_event_async(tex_job_id, "progress", {
                "stage": "texture", "step": "start", "percent": 5,
                "message": "Stage 2 bắt đầu — đang chuẩn bị pipeline...",
                "eta_seconds": self._get_eta("texture"),
            })

            # Load pipeline nếu chưa có (swap: unload shape trước)
            if self.tex_pipeline is None:
                self._unload_shape()
                print("🚀 Loading texture pipeline...")
                loop_load = asyncio.get_running_loop()
                await asyncio.wait_for(
                    loop_load.run_in_executor(None, self._load_tex),
                    timeout=300  # Bug1 fix: timeout 5 phút cho load model
                )
                print("Texture pipeline ready!")

            # Decode front image + rembg nếu còn background
            front_image = Image.open(BytesIO(base64.b64decode(front_image_base64))).convert("RGBA")
            if self.rembg is not None:
                try:
                    front_image = self.rembg(front_image)
                    print(f"[{tex_job_id}] Front image background removed")
                except Exception as rb_err:
                    print(f"⚠️  [{tex_job_id}] rembg failed, dùng ảnh gốc: {rb_err}")

            # Decode các góc phụ nếu có (left/right/back)
            extra_images: Dict[str, Image.Image] = {}
            if images_base64:
                for view, b64 in images_base64.items():
                    if view == "front":
                        continue
                    try:
                        img = Image.open(BytesIO(base64.b64decode(b64))).convert("RGBA")
                        if self.rembg is not None:
                            try:
                                img = self.rembg(img)
                            except Exception:
                                pass
                        extra_images[view] = img
                    except Exception as e:
                        print(f"⚠️  [{tex_job_id}] Decode {view} image failed: {e}")

            _reset_vram_peak()
            res_before = _get_resources()
            print(f"\n🎨 [{tex_job_id}] Stage 2 START (4K={texture_4k})")

            await self._push_event_async(tex_job_id, "progress", {
                "stage": "texture", "step": "pipeline", "percent": 20,
                "message": f"Đang chạy texture pipeline (4K={texture_4k})...",
                "vram_free_gb": res_before.get("vram_free_gb"),
            })

            # [BUG1+3 FIX] lấy running loop trong coroutine → truyền vào thread
            loop = asyncio.get_running_loop()
            t_start = time.time()
            self._tex_thread_active = True  # Bug2 fix: đánh dấu thread đang chạy
            try:
                output_path = await loop.run_in_executor(
                    None, self._do_texture,
		    tex_job_id, shape_job_id, front_image, texture_4k, loop, extra_images
                )
            finally:
                self._tex_thread_active = False
            duration = time.time() - t_start

            res_after = _get_resources()
            _log_resources(f"[{tex_job_id}] Stage 2 DONE", res_before, res_after, duration)
            metrics = _build_metrics(res_before, res_after, duration)
            self._record_duration("texture", duration)

            # 🛑 Check cancel: texture inference xong nhưng job đã bị hủy
            # Unload pipeline ngay, bỏ qua lưu file và gallery
            if tex_job_id in self._cancelled_jobs:
                self._cancelled_jobs.discard(tex_job_id)
                self._unload_texture()
                self.task_cache.pop(tex_job_id, None)
                print(f"[{tex_job_id}] Texture inference xong nhưng job đã bị hủy — unload VRAM, bỏ qua save")
                await self._push_event_async(tex_job_id, "cancelled", {
                    "stage": "texture",
                    "message": "Job đã bị hủy, VRAM đã giải phóng",
                    "vram_freed": True,
                })
                return  # finally sẽ set done_event → worker tiếp tục job kế

            self._unload_texture()

            try:
                fix_result = fix_glb_file(str(output_path))
                if fix_result['status'] == 'fixed':
                    print(f"🔧 GLB fixed: {fix_result['message']}")
            except Exception as fe:
                print(f"⚠️  GLB fix warning: {fe}")

            output_url = f"{settings.EXTERNAL_URL}/api/v1/download/{tex_job_id}/textured"

            has_texture, has_skeleton, faces, vertices = self._parse_glb_flags(output_path)

            job = db.query(ModelJob).filter(ModelJob.job_id == tex_job_id).first()

            try:
                from app.services.thumbnail_renderer import render_thumbnail
                thumb_bytes = render_thumbnail(str(output_path))
                if thumb_bytes:
                    thumb_dir = Path(settings.UPLOAD_TEMP_DIR) / "thumbnails"
                    thumb_dir.mkdir(parents=True, exist_ok=True)
                    thumb_path = thumb_dir / f"{tex_job_id}.webp"
                    thumb_path.write_bytes(thumb_bytes)
                    thumb_url = f"{settings.EXTERNAL_URL}/uploads/thumbnails/{tex_job_id}.webp"
                    if job:
                        job.input_image_url = thumb_url
                        db.commit()
                    print(f"🖼️  [{tex_job_id}] Stage 2 thumbnail OK → {thumb_url}")
                else:
                    print(f"⚠️  [{tex_job_id}] Stage 2 thumbnail trả về None, bỏ qua")
            except Exception as thumb_err:
                print(f"⚠️  [{tex_job_id}] Stage 2 thumbnail thất bại (bỏ qua, job vẫn OK): {thumb_err}")

            if job:
                job.status = 'completed'
                job.output_model_url = output_url
                job.has_texture = has_texture
                job.has_skeleton = has_skeleton
                if faces is not None: job.faces = faces
                if vertices is not None: job.vertices = vertices
                db.commit()

            submission_id = None
            try:
                from app.models.gallery_submission import GallerySubmission
                import uuid as _uuid_mod
                if job and job.user_id:
                    stage1_job = db.query(ModelJob).filter(ModelJob.job_id == shape_job_id).first()
                    stage1_submission_id = stage1_job.submission_id if stage1_job else None
                    if stage1_submission_id is None:
                        stage1_submission_id = self.task_cache.get(shape_job_id, {}).get("submission_id")
                    if stage1_submission_id:
                        sub = db.query(GallerySubmission).filter(GallerySubmission.id == stage1_submission_id).first()
                        if sub:
                            sub.model_url = output_url
                            if faces is not None: sub.faces = faces
                            if vertices is not None: sub.vertices = vertices
                            db.commit()
                            submission_id = sub.id
                    if not submission_id:
                        sub = GallerySubmission(
                            uuid=str(_uuid_mod.uuid4()),
                            user_id=job.user_id,
                            model_name="Generated Model",
                            image_url=job.input_image_url,
                            model_url=output_url,
                            faces=faces,
                            vertices=vertices,
                            is_public=False,
                            source="convert3d",
                        )
                        db.add(sub)
                        db.commit()
                        db.refresh(sub)
                        submission_id = sub.id
                    if submission_id and job:
                        job.submission_id = submission_id
                        db.commit()
            except Exception as sub_err:
                print(f"⚠️  Auto-submission warning: {sub_err}")

            if job:
                job.metrics = metrics
                db.commit()

            self.task_cache.pop(tex_job_id, None)

            # SSE: thông báo hoàn tất
            await self._push_event_async(tex_job_id, "completed", {
                "stage": "texture",
                "output_model_url": output_url,
                "submission_id": submission_id,
                "metrics": metrics,
                "message": f"Stage 2 xong! ({duration:.0f}s)",
            })

            print(f"[Stage 2] {tex_job_id} done | texture={has_texture}")

        except (Exception, asyncio.TimeoutError) as e:
            import traceback; traceback.print_exc()
            self.task_cache.pop(tex_job_id, None)
            self._unload_texture()

            # Kiểm tra nếu file output đã tồn tại → job thực ra thành công dù timeout
            fallback_path = Path(settings.DOWNLOAD_DIR) / f"{tex_job_id}.glb"
            job = db.query(ModelJob).filter(ModelJob.job_id == tex_job_id).first()

            if fallback_path.exists():
                print(f"⚠️  [Stage 2] Timeout nhưng file GLB tồn tại → mark completed")
                output_url = f"{settings.EXTERNAL_URL}/api/v1/download/{tex_job_id}/textured"
                if job:
                    job.status = 'completed'
                    job.output_model_url = output_url
                    db.commit()
                await self._push_event_async(tex_job_id, "completed", {
                    "stage": "texture",
                    "output_model_url": output_url,
                    "message": "Stage 2 xong (recovered after timeout)!",
                })
                print(f"[Stage 2] {tex_job_id} recovered → completed")
            else:
                if job:
                    job.status = 'failed'; job.error_message = str(e); db.commit()
                await self._push_event_async(tex_job_id, "failed", {
                    "stage": "texture", "error": str(e),
                    "message": f"Stage 2 thất bại: {e}",
                })
                print(f"[Stage 2] {tex_job_id} failed: {e}")
        finally:
            db.close()
            if done_event:
                done_event.set()  # Báo cho worker biết job xong → lấy job tiếp theo

    def _do_texture(self, tex_job_id, shape_job_id, front_image, texture_4k=False,
                    loop: asyncio.AbstractEventLoop = None,
                    extra_images: Optional[Dict[str, Image.Image]] = None) -> Path:
        """Chạy trong thread pool. Dùng _push_event (thread-safe)."""
        import trimesh
        white_mesh_path = Path(settings.DOWNLOAD_DIR) / f"{shape_job_id}.white.glb"
        print(f"[{tex_job_id}] Loading white mesh + running texture pipeline...")

        self._push_event(tex_job_id, "progress", {
            "stage": "texture", "step": "paint", "percent": 25,
            "message": "Đang sơn texture lên mesh...",
        }, loop=loop)

        mesh = trimesh.load(str(white_mesh_path))

        # Gom tất cả views: front + các góc phụ nếu có
        all_images = [front_image]
        if extra_images:
            for view in ["right", "back", "left"]:
                if view in extra_images:
                    all_images.append(extra_images[view])
            print(f"[{tex_job_id}] Texture với {len(all_images)} view(s): front + {list(extra_images.keys())}")
        else:
            print(f"[{tex_job_id}] Texture với 1 view (front only)")

        self._push_event(tex_job_id, "progress", {
            "stage": "texture", "step": "diffusion", "percent": 30,
            "message": "Diffusion multiview đang chạy (30 steps)...",
        }, loop=loop)

        # Gọi pipeline với đầy đủ param
        try:
            
            if len(all_images) > 1:
                mesh = self.tex_pipeline(
                    mesh,
                    image=all_images,
		    
                )
            else:
                mesh = self.tex_pipeline(
                    mesh,
                    image=front_image,
		    
                )
        except TypeError:
            
            print(f"⚠️  [{tex_job_id}] Pipeline không hỗ trợ multi-view hoặc extra params, fallback single image")
            mesh = self.tex_pipeline(mesh, image=front_image)

        self._push_event(tex_job_id, "progress", {
            "stage": "texture", "step": "export", "percent": 80,
            "message": "Đang export GLB...",
        }, loop=loop)

        save_dir = Path(settings.DOWNLOAD_DIR)
        output_path = save_dir / f"{tex_job_id}.glb"
        mesh.export(str(output_path))
        print(f"[{tex_job_id}] Textured mesh saved → {output_path}")

        if texture_4k:
            self._push_event(tex_job_id, "progress", {
                "stage": "texture", "step": "upscale", "percent": 90,
                "message": "Đang upscale texture lên 4K...",
            }, loop=loop)
            output_path = self._upscale_glb_textures(tex_job_id, output_path)

        return output_path

    def _upscale_glb_textures(self, job_id: str, glb_path: Path) -> Path:
        """Đọc GLB → upscale texture bằng Real-ESRGAN x4 → ghi lại GLB."""
        try:
            import struct, json as _json, io
            import numpy as np
            from PIL import Image as PILImage

            print(f"[{job_id}] 4K upscale: loading GLB textures...")
            data = glb_path.read_bytes()

            if len(data) < 20 or struct.unpack_from('<I', data, 0)[0] != 0x46546C67:
                print(f"⚠️  [{job_id}] Not a valid GLB, skip upscale")
                return glb_path

            json_len  = struct.unpack_from('<I', data, 12)[0]
            json_data = _json.loads(data[20:20 + json_len].decode('utf-8', errors='ignore'))
            images = json_data.get('images', [])
            if not images:
                print(f"⚠️  [{job_id}] No textures found in GLB, skip upscale")
                return glb_path

            bin_offset = 20 + json_len + 8
            bin_data = bytearray(data[bin_offset:])

            from realesrgan import RealESRGANer
            from basicsr.archs.rrdbnet_arch import RRDBNet

            model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64,
                            num_block=23, num_grow_ch=32, scale=4)

            ckpt_candidates = [
                BASE_DIR / "weights" / "RealESRGAN_x4plus.pth",
                Path(settings.DOWNLOAD_DIR).parent / "weights" / "RealESRGAN_x4plus.pth",
                Path("weights/RealESRGAN_x4plus.pth"),
            ]
            ckpt_path = next((p for p in ckpt_candidates if p.exists()), None)
            if ckpt_path is None:
                print(f"⚠️  [{job_id}] RealESRGAN weights không tìm thấy, skip 4K")
                return glb_path

            import torch as _torch_check
            use_half = _torch_check.cuda.is_available()
            upsampler = RealESRGANer(scale=4, model_path=str(ckpt_path), model=model,
                                     tile=512, tile_pad=10, pre_pad=0, half=use_half)

            buffer_views = json_data.get('bufferViews', [])
            blob_map: dict = {}
            for bv_idx, bv in enumerate(buffer_views):
                offset = bv.get('byteOffset', 0)
                length = bv['byteLength']
                blob_map[bv_idx] = bytes(bin_data[offset:offset + length])

            upscaled_count = 0
            for img_info in images:
                bv_idx = img_info.get('bufferView')
                if bv_idx is None:
                    continue
                pil_img = PILImage.open(io.BytesIO(blob_map[bv_idx])).convert('RGB')
                orig_w, orig_h = pil_img.size
                if max(orig_w, orig_h) >= 4096:
                    continue
                print(f"   Upscaling image bv{bv_idx}: {orig_w}x{orig_h} → 4K...")
                upscaled_np, _ = upsampler.enhance(np.array(pil_img), outscale=4)
                upscaled_pil = PILImage.fromarray(upscaled_np)
                if max(upscaled_pil.size) > 4096:
                    uw, uh = upscaled_pil.size
                    scale  = 4096 / max(uw, uh)
                    upscaled_pil = upscaled_pil.resize(
                        (int(uw * scale), int(uh * scale)), PILImage.LANCZOS
                    )
                buf = io.BytesIO()
                upscaled_pil.save(buf, format='PNG', optimize=True)
                blob_map[bv_idx] = buf.getvalue()
                upscaled_count += 1

            del upsampler
            import torch as _torch; _torch.cuda.empty_cache()

            if upscaled_count == 0:
                return glb_path

            new_bin = bytearray()
            for bv_idx, bv in enumerate(buffer_views):
                while len(new_bin) % 4 != 0:
                    new_bin += b'\x00'
                bv['byteOffset'] = len(new_bin)
                bv['byteLength'] = len(blob_map[bv_idx])
                new_bin += blob_map[bv_idx]

            if json_data.get('buffers'):
                json_data['buffers'][0]['byteLength'] = len(new_bin)

            json_bytes = _json.dumps(json_data).encode('utf-8')
            while len(json_bytes) % 4 != 0:
                json_bytes += b' '
            bin_bytes = bytes(new_bin)
            while len(bin_bytes) % 4 != 0:
                bin_bytes += b'\x00'

            json_chunk = struct.pack('<II', len(json_bytes), 0x4E4F534A) + json_bytes
            bin_chunk  = struct.pack('<II', len(bin_bytes),  0x004E4942) + bin_bytes
            total_len  = 12 + len(json_chunk) + len(bin_chunk)
            header     = struct.pack('<III', 0x46546C67, 2, total_len)

            output_4k_path = glb_path.parent / f"{glb_path.stem}_4k.glb"
            output_4k_path.write_bytes(header + json_chunk + bin_chunk)
            print(f"[{job_id}] 4K upscale done → {output_4k_path} ({upscaled_count} textures)")
            return output_4k_path

        except Exception as e:
            import traceback; traceback.print_exc()
            print(f"⚠️  [{job_id}] 4K upscale failed: {e}, dùng texture gốc")
            return glb_path

    # ────────────────────────────────────────────────────────────────────────
    # Helpers
    # ────────────────────────────────────────────────────────────────────────

    def _decode_images(self, images_base64: Dict[str, str], remove_background: bool) -> Dict[str, Image.Image]:
        result: Dict[str, Image.Image] = {}
        for key, b64 in images_base64.items():
            img = Image.open(BytesIO(base64.b64decode(b64))).convert("RGBA")
            if remove_background and self.rembg is not None:
                if img.split()[3].getbbox() == img.getbbox():
                    img = self.rembg(img)
            result[key] = img
        return result

    def _set_status(self, db: Session, job_id: str, status: str):
        job = db.query(ModelJob).filter(ModelJob.job_id == job_id).first()
        if job:
            job.status = status; db.commit()
        if job_id in self.task_cache:
            self.task_cache[job_id]["status"] = status
        print(f"🔄 Job {job_id} → {status}")

    def _parse_glb_flags(self, path: Path):
        has_texture = has_skeleton = False
        faces = vertices = None
        try:
            import struct, json
            data = path.read_bytes()
            if len(data) > 20 and struct.unpack_from('<I', data, 0)[0] == 0x46546C67:
                json_len = struct.unpack_from('<I', data, 12)[0]
                glb_json = json.loads(data[20:20 + json_len].decode('utf-8', errors='ignore'))
                has_skeleton = bool(glb_json.get('skins'))
                has_texture  = bool(
                    glb_json.get('textures') or
                    any(m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
                        for m in glb_json.get('materials', []))
                )
                if glb_json.get('meshes') and glb_json.get('accessors'):
                    total_v = total_f = 0
                    for mesh in glb_json['meshes']:
                        for prim in mesh.get('primitives', []):
                            pos_idx = prim.get('attributes', {}).get('POSITION')
                            if pos_idx is not None:
                                total_v += glb_json['accessors'][pos_idx].get('count', 0)
                            idx = prim.get('indices')
                            if idx is not None:
                                total_f += glb_json['accessors'][idx].get('count', 0) // 3
                            elif pos_idx is not None:
                                total_f += glb_json['accessors'][pos_idx].get('count', 0) // 3
                    if total_v > 0: vertices = total_v
                    if total_f > 0: faces = total_f
        except Exception as e:
            print(f"⚠️  GLB parse: {e}")
        return has_texture, has_skeleton, faces, vertices

    # ────────────────────────────────────────────────────────────────────────
    # Status / worker info
    # ────────────────────────────────────────────────────────────────────────

    async def get_job_status(self, db: Session, job_id: str) -> Dict[str, Any]:
        cache = self.task_cache.get(job_id, {})
        if cache.get("status") in ("pending", "processing"):
            return {"job_id": job_id, "status": cache["status"], "stage": cache.get("stage")}

        job = db.query(ModelJob).filter(ModelJob.job_id == job_id).first()
        if not job:
            return {"job_id": job_id, "status": "not_found", "error_message": "Job không tồn tại"}

        resp: Dict[str, Any] = {
            "job_id":          job.job_id,
            "status":          job.status,
            "stage":           cache.get("stage", "unknown"),
            "input_image_url": job.input_image_url,
            "thumbnail_url":   job.input_image_url,
            "has_texture":     job.has_texture,
            "has_skeleton":    job.has_skeleton,
            "created_at":      job.created_at.isoformat() if job.created_at else None,
            "updated_at":      job.updated_at.isoformat() if job.updated_at else None,
            "model_name":      job.model_name,          # <--- thêm dòng này
        }
        if job.status == "completed":
            resp["output_model_url"] = job.output_model_url
            resp["metrics"] = job.metrics or {}
            resp["submission_id"] = job.submission_id or cache.get("submission_id")
            resp["faces"] = job.faces
            resp["vertices"] = job.vertices
        elif job.status == "failed":
            resp["error_message"] = job.error_message
        elif job.status == "cancelled":
            resp["error_message"] = job.error_message
        return resp

    async def delete_job(self, db: Session, job_id: str, user_id: Optional[int] = None) -> Dict[str, Any]:
        query = db.query(ModelJob).filter(ModelJob.job_id == job_id)
        if user_id:
            query = query.filter(ModelJob.user_id == user_id)
        job = query.first()
        if not job:
            return {"status": "error", "error": "Job not found or unauthorized"}

        # ── Delete model files ──────────────────────────────────────────
        for filename in [f"{job_id}.white.glb", f"{job_id}.glb", f"{job_id}_4k.glb"]:
            file_path = Path(settings.DOWNLOAD_DIR) / filename
            if file_path.exists():
                try:
                    file_path.unlink()
                except Exception as e:
                    print(f"Failed to delete {file_path}: {e}")

        # ── Delete thumbnail ────────────────────────────────────────────
        thumb_path = Path(settings.UPLOAD_TEMP_DIR) / "thumbnails" / f"{job_id}.webp"
        if thumb_path.exists():
            try:
                thumb_path.unlink()
            except Exception as e:
                print(f"Failed to delete {thumb_path}: {e}")

        # ── Delete mv images (front/left/right/back) ─────────────────────
        mv_dirs = set()

        def _delete_upload_by_url(url: Optional[str]):
            if not url:
                return
            rel = url.split("/uploads/")[-1]
            path = Path(settings.UPLOAD_TEMP_DIR) / rel
            mv_dirs.add(path.parent)
            if path.exists():
                try:
                    path.unlink()
                except Exception as e:
                    print(f"Failed to delete {path}: {e}")

        _delete_upload_by_url(job.front_image_url)
        _delete_upload_by_url(job.left_image_url)
        _delete_upload_by_url(job.right_image_url)
        _delete_upload_by_url(job.back_image_url)

        # ── Cleanup empty mv dir ─────────────────────────────────────────
        for d in mv_dirs:
            try:
                if d.exists() and d.is_dir() and not any(d.iterdir()):
                    d.rmdir()
            except Exception as e:
                print(f"Failed to remove dir {d}: {e}")

        # ── Notify any active SSE listeners so they disconnect cleanly ──────
        # Without this, clients stuck in event_generator() keep sending
        # heartbeats forever (200 OK every 20s) after the job is deleted.
        if self._sse_queues.get(job_id) is not None:
            await self._push_event_async(job_id, "cancelled", {
                "job_id": job_id,
                "error_message": "Job was deleted",
            })

        # Soft delete: ẩn khỏi my-jobs của user nhưng admin vẫn thấy trong Jobs 3D
        job.deleted_by_user = True
        db.commit()
        if job_id in self.task_cache:
            del self.task_cache[job_id]
        return {"status": "success", "message": f"Job {job_id} deleted"}

    async def get_user_jobs(self, db: Session, user_id: int, limit: int = 50, offset: int = 0) -> list:
        jobs = (
            db.query(ModelJob)
            .filter(ModelJob.user_id == user_id)
            .filter(ModelJob.deleted_by_user == False)  # Ẩn job user đã xóa, admin vẫn thấy
            .order_by(ModelJob.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )
        result = []
        for job in jobs:
            # Xác định stage dựa vào file tồn tại trên disk
            white_path = Path(settings.DOWNLOAD_DIR) / f"{job.job_id}.white.glb"
            tex_path   = Path(settings.DOWNLOAD_DIR) / f"{job.job_id}.glb"
            if white_path.exists() and not tex_path.exists():
                job_stage = "shape"   # Stage 1 only
            elif tex_path.exists():
                job_stage = "texture" # Stage 2
            else:
                job_stage = "shape"   # fallback

            # Nếu faces/vertices null trong DB → parse lại từ file
            faces = job.faces
            vertices = job.vertices
            if (faces is None or vertices is None) and job.status == "completed":
                glb_file = tex_path if tex_path.exists() else (white_path if white_path.exists() else None)
                if glb_file:
                    try:
                        _, _, parsed_faces, parsed_vertices = self._parse_glb_flags(glb_file)
                        faces = faces or parsed_faces
                        vertices = vertices or parsed_vertices
                    except Exception:
                        pass

            result.append({
                "job_id":           job.job_id,
                "model_name":       job.model_name,
                "status":           job.status,
                "input_image_url":  job.input_image_url,
                "thumbnail_url":    job.input_image_url,
                "front_image_url":  job.front_image_url,
                "left_image_url":   job.left_image_url,
                "right_image_url":  job.right_image_url,
                "back_image_url":   job.back_image_url,
                "output_model_url": job.output_model_url,
                "has_texture":      job.has_texture,
                "has_skeleton":     job.has_skeleton,
                "submission_id":    job.submission_id,
                "error_message":    job.error_message,
                "job_stage":        job_stage,
                "faces":            faces,
                "vertices":         vertices,
                "created_at":       job.created_at.isoformat() if job.created_at else None,
                "updated_at":       job.updated_at.isoformat() if job.updated_at else None,
            })
        return result

    def get_worker_status(self) -> Dict[str, Any]:
        active = sum(1 for t in self.task_cache.values() if t.get("status") in ("pending", "processing"))
        return {
            "shape_pipeline_loaded":   self.shape_pipeline is not None,
            "texture_pipeline_loaded": self.tex_pipeline is not None,
            "device":                  settings.HUNYUAN3D_DEVICE,
            "active_jobs":             active,
            "mv_available":            HUNYUAN3D_MV_AVAILABLE,
            "model_path":                 str(MV_DIR),
            "current_resources":          _get_resources(),
        }


# Singleton
hunyuan3d_mv_service = Hunyuan3DMvService()