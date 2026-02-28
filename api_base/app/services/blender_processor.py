# Hunyuan3D Blender Processor
# Standalone module for Blender-based mesh processing
# Can be enabled/disabled via environment variable

import os
import logging
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# ==========================================
# BLENDER AVAILABILITY CHECK
# ==========================================

BLENDER_AVAILABLE = False
BLENDER_DISABLED = os.getenv("DISABLE_BLENDER", "false").lower() == "true"

if not BLENDER_DISABLED:
    try:
        import bpy
        BLENDER_AVAILABLE = True
        logger.info("✅ Blender (bpy) module loaded successfully")
    except ImportError:
        logger.warning("⚠️  Blender (bpy) not available - GLB conversion disabled")
        logger.info("   Install with: pip install fake-bpy-module-latest (for development)")
        logger.info("   Or run inside Blender for production use")
else:
    logger.info("ℹ️  Blender processing disabled via DISABLE_BLENDER env variable")


# ==========================================
# BLENDER UTILITY FUNCTIONS
# ==========================================

def _setup_blender_scene():
    """Setup Blender scene for conversion."""
    if not BLENDER_AVAILABLE:
        return
    
    if "convert" not in bpy.data.scenes:
        bpy.data.scenes.new("convert")
    bpy.context.window.scene = bpy.data.scenes["convert"]


def _clear_scene_objects():
    """Clear all objects from current Blender scene."""
    if not BLENDER_AVAILABLE:
        return
    
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
        bpy.data.objects.remove(obj, do_unlink=True)


def _select_mesh_objects():
    """Select all mesh objects in scene."""
    if not BLENDER_AVAILABLE:
        return
    
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.select_set(True)


def _merge_vertices_if_needed(merge_vertices: bool):
    """Merge duplicate vertices if requested."""
    if not BLENDER_AVAILABLE or not merge_vertices:
        return

    for obj in bpy.context.selected_objects:
        if obj.type == "MESH":
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.mesh.remove_doubles()
            bpy.ops.object.mode_set(mode="OBJECT")


def _apply_shading(shade_type: str, auto_smooth_angle: float):
    """Apply shading to selected objects."""
    if not BLENDER_AVAILABLE:
        return
    
    import math
    
    shading_ops = {
        "SMOOTH": lambda: bpy.ops.object.shade_smooth(),
        "FLAT": lambda: bpy.ops.object.shade_flat(),
        "AUTO_SMOOTH": lambda: _apply_auto_smooth(auto_smooth_angle),
    }

    if shade_type in shading_ops:
        shading_ops[shade_type]()


def _apply_auto_smooth(auto_smooth_angle: float):
    """Apply auto smooth based on Blender version."""
    if not BLENDER_AVAILABLE:
        return
    
    import math
    angle_rad = math.radians(auto_smooth_angle)

    if bpy.app.version < (4, 1, 0):
        bpy.ops.object.shade_smooth(use_auto_smooth=True, auto_smooth_angle=angle_rad)
    elif bpy.app.version < (4, 2, 0):
        bpy.ops.object.shade_smooth_by_angle(angle=angle_rad)
    else:
        bpy.ops.object.shade_auto_smooth(angle=angle_rad)


# ==========================================
# MAIN CONVERSION FUNCTIONS
# ==========================================

def convert_obj_to_glb(
    obj_path: str,
    glb_path: str,
    shade_type: str = "SMOOTH",
    auto_smooth_angle: float = 60,
    merge_vertices: bool = False,
) -> Tuple[bool, Optional[str]]:
    """
    Convert OBJ file to GLB format using Blender.
    
    Args:
        obj_path: Path to input OBJ file
        glb_path: Path to output GLB file
        shade_type: Shading type ("SMOOTH", "FLAT", "AUTO_SMOOTH")
        auto_smooth_angle: Auto smooth angle in degrees (default: 60)
        merge_vertices: Whether to merge duplicate vertices
    
    Returns:
        Tuple of (success: bool, error_message: Optional[str])
    """
    if not BLENDER_AVAILABLE:
        return False, "Blender not available - install fake-bpy-module-latest or run in Blender"
    
    if not os.path.exists(obj_path):
        return False, f"OBJ file not found: {obj_path}"
    
    try:
        logger.info(f"Converting OBJ to GLB: {obj_path} -> {glb_path}")
        
        _setup_blender_scene()
        _clear_scene_objects()

        # Import OBJ file
        bpy.ops.wm.obj_import(filepath=obj_path)
        _select_mesh_objects()

        # Process meshes
        _merge_vertices_if_needed(merge_vertices)
        _apply_shading(shade_type, auto_smooth_angle)

        # Export to GLB
        bpy.ops.export_scene.gltf(filepath=glb_path, use_active_scene=True)
        
        if os.path.exists(glb_path):
            logger.info(f"✅ GLB created: {glb_path}")
            return True, None
        else:
            return False, "GLB file not created after export"
            
    except Exception as e:
        error_msg = f"Blender conversion failed: {str(e)}"
        logger.error(error_msg)
        return False, error_msg


def is_blender_enabled() -> bool:
    """Check if Blender processing is enabled and available."""
    return BLENDER_AVAILABLE and not BLENDER_DISABLED


def get_blender_status() -> dict:
    """Get detailed Blender availability status."""
    status = {
        "enabled": is_blender_enabled(),
        "available": BLENDER_AVAILABLE,
        "disabled_by_env": BLENDER_DISABLED,
    }
    
    if BLENDER_AVAILABLE:
        try:
            status["blender_version"] = ".".join(map(str, bpy.app.version))
        except:
            status["blender_version"] = "unknown"
    
    return status


# ==========================================
# FALLBACK: Simple file copy for non-Blender environments
# ==========================================

def copy_obj_as_glb_fallback(obj_path: str, glb_path: str) -> Tuple[bool, Optional[str]]:
    """
    Fallback: Just copy OBJ to GLB location for compatibility.
    This is NOT a real conversion, just for development/testing.
    """
    import shutil
    
    try:
        # Create a dummy GLB by copying OBJ (NOT RECOMMENDED for production)
        logger.warning("⚠️  Using fallback: copying OBJ instead of real GLB conversion")
        shutil.copy2(obj_path, glb_path)
        return True, "Fallback used - not a real GLB file"
    except Exception as e:
        return False, f"Fallback copy failed: {str(e)}"


# ==========================================
# MAIN EXPORT
# ==========================================

__all__ = [
    "convert_obj_to_glb",
    "is_blender_enabled",
    "get_blender_status",
    "copy_obj_as_glb_fallback",
    "BLENDER_AVAILABLE",
]