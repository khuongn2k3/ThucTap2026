"""
Convert Service — chuyển đổi giữa OBJ/GLB/STL.

OBJ → GLB:
  - Load toàn bộ bundle folder (OBJ + MTL + textures)
  - Export ra 1 file .glb (self-contained, embed textures)

GLB → OBJ (zip):
  - Load file .glb
  - Export ra OBJ + MTL (Phong) bằng trimesh
  - Parse GLB binary → extract PBR data + textures
  - Patch MTL với PBR extension (Pr, Pm, Ke, map_*, norm)
  - Zip toàn bộ lại

GLB/OBJ → STL:
  - Load file nguồn, export geometry-only STL

STL → GLB / STL → OBJ:
  - Load STL, export sang format đích
"""

import io
import logging
import tempfile
import zipfile
from pathlib import Path

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def obj_to_glb(bundle_dir: Path, obj_filename: str) -> bytes:
    """Convert OBJ bundle → GLB bytes (embed textures)."""
    import trimesh

    obj_path = bundle_dir / obj_filename
    if not obj_path.exists():
        raise FileNotFoundError(f"OBJ file not found: {obj_path}")

    logger.info("Converting OBJ → GLB: %s", obj_path)
    scene = trimesh.load(str(obj_path), force="scene", process=False)
    glb_bytes = scene.export(file_type="glb")
    logger.info("OBJ → GLB done, size=%d bytes", len(glb_bytes))
    return glb_bytes


def glb_to_obj_zip(glb_path: Path, base_name: str = "model") -> bytes:
    """
    Convert GLB → OBJ bundle (zip).

    Pipeline:
      1. trimesh export OBJ + MTL cơ bản (Phong)
      2. Parse GLB binary → extract PBR scalars + embedded textures
      3. Patch MTL với PBR extension lines (Pr, Pm, Ke, map_Pr, norm ...)
      4. Zip: OBJ + MTL (đã patch) + textures

    Returns:
        ZIP bytes chứa {base_name}.obj, {base_name}.mtl, tex_N.png/jpg, ...
    """
    import trimesh

    if not glb_path.exists():
        raise FileNotFoundError(f"GLB file not found: {glb_path}")

    logger.info("Converting GLB → OBJ (PBR): %s", glb_path)

    glb_bytes = glb_path.read_bytes()
    gltf_json, bin_data = _parse_glb_chunks(glb_bytes)

    scene = trimesh.load(str(glb_path), force="scene", process=False)

    with tempfile.TemporaryDirectory() as tmpdir:
        out_dir = Path(tmpdir)
        obj_out = out_dir / f"{base_name}.obj"

        scene.export(str(obj_out))
        _normalize_mtl_name(out_dir, obj_out, base_name)

        # Extract embedded textures từ GLB binary chunk
        tex_map = _extract_glb_textures(gltf_json, bin_data, out_dir)

        # Patch MTL nếu có PBR data
        mtl_path = out_dir / f"{base_name}.mtl"
        if mtl_path.exists() and gltf_json.get("materials"):
            _patch_mtl_pbr(mtl_path, gltf_json, tex_map)

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in sorted(out_dir.iterdir()):
                zf.write(f, f.name)

    zip_bytes = buf.getvalue()
    logger.info("GLB → OBJ zip done, size=%d bytes", len(zip_bytes))
    return zip_bytes


def to_stl(src_path: Path, bottom_center_pivot: bool = False) -> bytes:
    """Convert GLB/OBJ/STL → binary STL bytes (geometry only, no material)."""
    import trimesh
    import numpy as np

    if not src_path.exists():
        raise FileNotFoundError(f"Source file not found: {src_path}")

    logger.info("Converting %s → STL", src_path.suffix)
    scene = trimesh.load(str(src_path), force="scene", process=False)

    if bottom_center_pivot:
        bounds = scene.bounds
        if bounds is not None and bounds.shape == (2, 3):
            min_pt, max_pt = bounds
            tx = -float((min_pt[0] + max_pt[0]) / 2)
            ty = -float(min_pt[1])
            tz = -float((min_pt[2] + max_pt[2]) / 2)
            matrix = np.eye(4)
            matrix[:3, 3] = [tx, ty, tz]
            scene.apply_transform(matrix)
            logger.info("Bottom-center pivot applied to STL: tx=%.4f ty=%.4f tz=%.4f", tx, ty, tz)

    stl_bytes = scene.export(file_type="stl")
    logger.info("→ STL done, size=%d bytes", len(stl_bytes))
    return stl_bytes


def stl_to_obj(stl_path: Path, base_name: str = "model", bottom_center_pivot: bool = False) -> bytes:
    """Convert STL → OBJ bytes (no material, no zip needed)."""
    import trimesh
    import numpy as np

    if not stl_path.exists():
        raise FileNotFoundError(f"STL file not found: {stl_path}")

    logger.info("Converting STL → OBJ: %s", stl_path)
    scene = trimesh.load(str(stl_path), force="scene", process=False)

    if bottom_center_pivot:
        bounds = scene.bounds
        if bounds is not None and bounds.shape == (2, 3):
            min_pt, max_pt = bounds
            tx = -float((min_pt[0] + max_pt[0]) / 2)
            ty = -float(min_pt[1])
            tz = -float((min_pt[2] + max_pt[2]) / 2)
            matrix = np.eye(4)
            matrix[:3, 3] = [tx, ty, tz]
            scene.apply_transform(matrix)
            logger.info("Bottom-center pivot applied to STL→OBJ: tx=%.4f ty=%.4f tz=%.4f", tx, ty, tz)

    with tempfile.TemporaryDirectory() as tmpdir:
        out_obj = Path(tmpdir) / f"{base_name}.obj"
        scene.export(str(out_obj))
        obj_bytes = out_obj.read_bytes()

    logger.info("STL → OBJ done, size=%d bytes", len(obj_bytes))
    return obj_bytes


# ─────────────────────────────────────────────────────────────────────────────
# Skeleton & Pivot transformations
# ─────────────────────────────────────────────────────────────────────────────

def strip_skeleton_glb(glb_bytes: bytes) -> bytes:
    """
    Xóa skeleton/skinning data khỏi GLB.
    - Bỏ mảng 'skins'
    - Bỏ thuộc tính 'skin' trên từng node
    - Bỏ attributes JOINTS_0/WEIGHTS_0 khỏi mesh primitives
    Không đụng đến binary buffer → an toàn, không mất geometry/texture.
    """
    gltf, bin_data = _parse_glb_chunks(glb_bytes)

    # 1. Xóa skins
    gltf.pop("skins", None)

    # 2. Xóa skin ref trên nodes
    for node in gltf.get("nodes", []):
        node.pop("skin", None)

    # 3. Xóa JOINTS/WEIGHTS attributes khỏi mesh primitives
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            attrs = prim.get("attributes", {})
            for key in ("JOINTS_0", "WEIGHTS_0", "JOINTS_1", "WEIGHTS_1"):
                attrs.pop(key, None)

    logger.info("Stripped skeleton from GLB")
    return _build_glb(gltf, bin_data)


def apply_bottom_center_pivot_glb(glb_bytes: bytes) -> bytes:
    """
    Dịch chuyển toàn bộ model để pivot nằm ở đáy-giữa (bottom center):
      - X, Z: căn giữa bounding box
      - Y: đáy bounding box = 0

    Cách thực hiện:
      1. Dùng trimesh tính world-space bounds
      2. Thêm một root node mới với translation vào scene graph
         (không đụng binary buffer, skeleton/skin được giữ nguyên)
    """
    import tempfile, os
    import trimesh

    # ── Bước 1: Tính bounds bằng trimesh ──────────────────────────────────────
    with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as f:
        f.write(glb_bytes)
        tmp_path = f.name
    try:
        scene = trimesh.load(tmp_path, force="scene", process=False)
        bounds = scene.bounds   # shape (2, 3)
    finally:
        os.unlink(tmp_path)

    if bounds is None or bounds.shape != (2, 3):
        logger.warning("apply_bottom_center_pivot: không tính được bounds, bỏ qua")
        return glb_bytes

    min_pt, max_pt = bounds
    tx = float(-(min_pt[0] + max_pt[0]) / 2)
    ty = float(-min_pt[1])
    tz = float(-(min_pt[2] + max_pt[2]) / 2)
    logger.info("Bottom-center pivot offset: tx=%.4f ty=%.4f tz=%.4f", tx, ty, tz)

    # ── Bước 2: Chèn wrapper root node vào GLB JSON ────────────────────────────
    gltf, bin_data = _parse_glb_chunks(glb_bytes)

    nodes  = gltf.setdefault("nodes", [])
    scenes = gltf.setdefault("scenes", [{}])
    scene_idx = gltf.get("scene", 0)

    existing_roots = scenes[scene_idx].get("nodes", [])

    new_root = {
        "name": "__pivot_root__",
        "translation": [tx, ty, tz],
        "children": existing_roots,
    }
    new_root_idx = len(nodes)
    nodes.append(new_root)
    scenes[scene_idx]["nodes"] = [new_root_idx]

    logger.info("Bottom-center pivot applied (wrapper root node #%d)", new_root_idx)
    return _build_glb(gltf, bin_data)


# ─────────────────────────────────────────────────────────────────────────────
# GLB binary helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_glb(gltf: dict, bin_data: bytes) -> bytes:
    """
    Đóng gói lại GLTF JSON + binary buffer thành file .glb.
    Tuân thủ GLB spec (chunk 0 = JSON, chunk 1 = BIN, mỗi chunk align 4 bytes).
    """
    import struct, json as _json

    json_raw = _json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    # Pad JSON chunk tới bội số 4 (dùng space 0x20 theo spec)
    json_pad = (4 - len(json_raw) % 4) % 4
    json_chunk = json_raw + b" " * json_pad

    chunks = b""
    chunks += struct.pack("<II", len(json_chunk), 0x4E4F534A) + json_chunk  # JSON chunk

    if bin_data:
        bin_pad = (4 - len(bin_data) % 4) % 4
        bin_chunk = bin_data + b"\x00" * bin_pad
        chunks += struct.pack("<II", len(bin_chunk), 0x004E4942) + bin_chunk  # BIN chunk

    total_len = 12 + len(chunks)
    header = struct.pack("<III", 0x46546C67, 2, total_len)  # magic "glTF", version 2
    return header + chunks


def _parse_glb_chunks(glb_bytes: bytes):
    """
    Parse GLB binary → (gltf_dict, bin_bytes).

    GLB layout:
      [0-11]  header: magic(4) + version(4) + total_length(4)
      [12-19] chunk0 header: json_length(4) + type(4=0x4E4F534A)
      [20 ..]  JSON string
      [20+json_len .. ] chunk1 header: bin_length(4) + type(4=0x004E4942)
      [+8 ..]  binary buffer
    """
    import struct, json as _json

    json_len = struct.unpack_from("<I", glb_bytes, 12)[0]
    gltf     = _json.loads(glb_bytes[20 : 20 + json_len])

    bin_start = 20 + json_len
    bin_data  = b""
    if len(glb_bytes) > bin_start + 8:
        bin_len  = struct.unpack_from("<I", glb_bytes, bin_start)[0]
        bin_data = glb_bytes[bin_start + 8 : bin_start + 8 + bin_len]

    return gltf, bin_data


def _extract_glb_textures(gltf: dict, bin_data: bytes, out_dir: Path) -> dict:
    """
    Extract embedded images từ GLB binary chunk, lưu ra out_dir.

    Returns:
        { gltf_image_index: filename }
    """
    images       = gltf.get("images", [])
    buffer_views = gltf.get("bufferViews", [])
    tex_map      = {}

    for idx, img_ref in enumerate(images):
        bv_idx = img_ref.get("bufferView")
        if bv_idx is None:
            continue
        bv    = buffer_views[bv_idx]
        start = bv.get("byteOffset", 0)
        chunk = bin_data[start : start + bv["byteLength"]]

        mime  = img_ref.get("mimeType", "image/png")
        ext   = "jpg" if ("jpeg" in mime or "jpg" in mime) else "png"
        fname = f"tex_{idx}.{ext}"
        (out_dir / fname).write_bytes(chunk)
        tex_map[idx] = fname
        logger.debug("Extracted texture %d → %s (%d bytes)", idx, fname, len(chunk))

    return tex_map


# ─────────────────────────────────────────────────────────────────────────────
# MTL PBR patcher
# ─────────────────────────────────────────────────────────────────────────────

def _patch_mtl_pbr(mtl_path: Path, gltf: dict, tex_map: dict) -> None:
    """
    Đọc MTL do trimesh tạo (Phong only) và append PBR extension lines
    theo chuẩn Wavefront MTL PBR extension (như Blender export).

    PBR keys được thêm:
      Pr       roughnessFactor
      Pm       metallicFactor
      Ke       emissiveFactor (R G B)
      map_Kd   baseColorTexture
      map_Pr   metallicRoughnessTexture (channel G = roughness)
      map_Pm   metallicRoughnessTexture (channel B = metallic)
      norm     normalTexture
      map_Ke   emissiveTexture
      map_d    occlusionTexture (approximate)
    """
    materials = gltf.get("materials", [])
    textures  = gltf.get("textures",  [])

    def _tex_file(tex_info) -> str | None:
        if not tex_info:
            return None
        tex_idx = tex_info.get("index")
        if tex_idx is None or tex_idx >= len(textures):
            return None
        img_idx = textures[tex_idx].get("source")
        return tex_map.get(img_idx) if img_idx is not None else None

    # Build { material_name → [PBR lines] }
    pbr_patches: dict[str, list[str]] = {}

    for mat in materials:
        name = mat.get("name", "")
        pbr  = mat.get("pbrMetallicRoughness", {})
        lines: list[str] = [
            "# PBR extension (MTL PBR — Wavefront/Blender standard)"
        ]

        # ── Scalar factors ──────────────────────────────────────────────────
        roughness = pbr.get("roughnessFactor", 1.0)
        metallic  = pbr.get("metallicFactor",  0.0)
        emissive  = mat.get("emissiveFactor",  [0.0, 0.0, 0.0])

        lines.append(f"Pr {roughness:.6f}")
        lines.append(f"Pm {metallic:.6f}")
        lines.append("Ke {:.6f} {:.6f} {:.6f}".format(*emissive[:3]))

        # ── Alpha ────────────────────────────────────────────────────────────
        alpha_mode = mat.get("alphaMode", "OPAQUE")
        if alpha_mode == "BLEND":
            lines.append("d 0.500000   # alphaMode BLEND")
        elif alpha_mode == "MASK":
            lines.append(f"d {mat.get('alphaCutoff', 0.5):.6f}   # alphaMode MASK")

        # ── Texture maps ────────────────────────────────────────────────────
        base_tex = _tex_file(pbr.get("baseColorTexture"))
        if base_tex:
            lines.append(f"map_Kd {base_tex}")

        mr_tex = _tex_file(pbr.get("metallicRoughnessTexture"))
        if mr_tex:
            lines.append(f"map_Pr {mr_tex}   # channel G=roughness")
            lines.append(f"map_Pm {mr_tex}   # channel B=metallic")

        norm_tex = _tex_file(mat.get("normalTexture"))
        if norm_tex:
            scale = mat.get("normalTexture", {}).get("scale", 1.0)
            lines.append(f"norm {norm_tex}   # scale={scale:.3f}")

        emis_tex = _tex_file(mat.get("emissiveTexture"))
        if emis_tex:
            lines.append(f"map_Ke {emis_tex}")

        occ_tex = _tex_file(mat.get("occlusionTexture"))
        if occ_tex:
            lines.append(f"map_d {occ_tex}   # occlusion (approx)")

        pbr_patches[name] = lines

    if not pbr_patches:
        return

    # ── Patch file MTL ───────────────────────────────────────────────────────
    original = mtl_path.read_text(encoding="utf-8", errors="replace")
    lines_in = original.splitlines(keepends=True)
    out_lines: list[str] = []
    current_mat: str | None = None
    existing_keys: set[str] = set()   # keys đã có trong block hiện tại

    def _flush(mat_name: str) -> None:
        """Append PBR lines, bỏ qua key đã tồn tại."""
        out_lines.append("\n")
        for pl in pbr_patches.pop(mat_name):
            if pl.startswith("#"):
                out_lines.append(pl + "\n")
                continue
            key = pl.split()[0].lower()
            if key not in existing_keys:
                out_lines.append(pl + "\n")

    for line in lines_in:
        stripped = line.strip()

        if stripped.startswith("newmtl "):
            if current_mat and current_mat in pbr_patches:
                _flush(current_mat)
            current_mat = stripped[7:].strip()
            existing_keys = set()

        # Track keys trimesh đã viết
        low = stripped.lower()
        for k in ("map_kd", "map_ks", "map_ns", "map_d", "map_ke",
                  "map_pr", "map_pm", "norm", "bump", "pr", "pm", "ke"):
            if low.startswith(k + " ") or low == k:
                existing_keys.add(k)

        out_lines.append(line)

    # EOF flush
    if current_mat and current_mat in pbr_patches:
        _flush(current_mat)

    # Materials trong GLTF nhưng trimesh bỏ qua → thêm block mới
    for mat_name, patch_lines in pbr_patches.items():
        out_lines.append(f"\nnewmtl {mat_name}\n")
        for pl in patch_lines:
            out_lines.append(pl + "\n")

    mtl_path.write_text("".join(out_lines), encoding="utf-8")
    logger.info("MTL patched with PBR extension for %d material(s)", len(materials))


# ─────────────────────────────────────────────────────────────────────────────
# Misc helpers
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_mtl_name(out_dir: Path, obj_path: Path, base_name: str) -> None:
    """
    trimesh đôi khi đặt tên .mtl là 'material.mtl' thay vì '{base_name}.mtl'.
    Rename về '{base_name}.mtl' và cập nhật reference trong .obj.
    """
    mtl_files = list(out_dir.glob("*.mtl"))
    if not mtl_files:
        return

    target_mtl = out_dir / f"{base_name}.mtl"
    existing   = mtl_files[0]
    if existing == target_mtl:
        return

    existing.rename(target_mtl)

    if obj_path.exists():
        content = obj_path.read_text(encoding="utf-8", errors="replace")
        old_ref = f"mtllib {existing.name}"
        new_ref = f"mtllib {target_mtl.name}"
        if old_ref in content:
            obj_path.write_text(content.replace(old_ref, new_ref, 1), encoding="utf-8")