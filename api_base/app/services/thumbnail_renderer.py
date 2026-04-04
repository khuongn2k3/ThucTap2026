"""
thumbnail_renderer.py — software rasterizer thuần numpy + PIL + trimesh.
Không cần GPU, không cần OpenGL — chạy được trên mọi OS kể cả Windows headless.
Hỗ trợ vertex colors + material base color từ GLB/OBJ.
"""
from __future__ import annotations

import io
import logging
import math
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

THUMB_W = THUMB_H = 512

_BG_CENTER = np.array([0.22, 0.22, 0.22], dtype=np.float32)
_BG_EDGE   = np.array([0.05, 0.05, 0.05], dtype=np.float32)


def _make_bg() -> np.ndarray:
    cx, cy = THUMB_W / 2, THUMB_H / 2
    Y, X = np.ogrid[:THUMB_H, :THUMB_W]
    d = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
    t = np.clip(d / (math.sqrt(cx**2 + cy**2) * 0.85), 0, 1)[:, :, None]
    return (_BG_CENTER * (1 - t) + _BG_EDGE * t).astype(np.float32)


def _look_at(eye, center, up):
    f = center - eye; f /= np.linalg.norm(f)
    r = np.cross(f, up); r /= np.linalg.norm(r)
    u = np.cross(r, f)
    M = np.eye(4)
    M[0,:3]=r;  M[1,:3]=u;  M[2,:3]=-f
    M[0,3]=-r@eye; M[1,3]=-u@eye; M[2,3]=f@eye
    return M


def _perspective(fov_deg, aspect, near, far):
    f = 1.0 / math.tan(math.radians(fov_deg) / 2)
    P = np.zeros((4, 4))
    P[0,0]=f/aspect; P[1,1]=f
    P[2,2]=(far+near)/(near-far); P[2,3]=2*far*near/(near-far)
    P[3,2]=-1.0
    return P


def _get_mesh_color(m) -> np.ndarray:
    """Lấy màu per-vertex từ mesh: vertex_colors → material baseColor → xám mặc định."""
    nv = len(m.vertices)
    DEFAULT = np.tile(np.array([0.72, 0.72, 0.78], dtype=np.float32), (nv, 1))

    # 1. Vertex colors
    try:
        vc = m.visual.to_color().vertex_colors  # (N,4) uint8
        if vc is not None and len(vc) == nv:
            return np.array(vc, dtype=np.float32)[:, :3] / 255.0
    except Exception:
        pass

    # 2. Material base color
    try:
        mat = m.visual.material
        # PBR (GLB)
        if hasattr(mat, "baseColorFactor") and mat.baseColorFactor is not None:
            rgba = np.asarray(mat.baseColorFactor, dtype=np.float32).ravel()[:3]
            if rgba.max() > 1.0:
                rgba /= 255.0
            return np.tile(rgba, (nv, 1))
        # Classic OBJ material
        if hasattr(mat, "diffuse") and mat.diffuse is not None:
            rgba = np.asarray(mat.diffuse, dtype=np.float32).ravel()[:3]
            if rgba.max() > 1.0:
                rgba /= 255.0
            return np.tile(rgba, (nv, 1))
        if hasattr(mat, "main_color"):
            rgba = np.asarray(mat.main_color, dtype=np.float32).ravel()[:3]
            if rgba.max() > 1.0:
                rgba /= 255.0
            return np.tile(rgba, (nv, 1))
    except Exception:
        pass

    return DEFAULT


def _rasterize(
    verts:   np.ndarray,   # (N,3)
    faces:   np.ndarray,   # (F,3) int
    normals: np.ndarray,   # (N,3)
    vcolors: np.ndarray,   # (N,3) float [0,1]
) -> np.ndarray:
    H, W = THUMB_H, THUMB_W

    dist  = 2.2
    az, el = math.radians(30), math.radians(22)
    eye = np.array([
        dist*math.cos(el)*math.sin(az),
        dist*math.sin(el),
        dist*math.cos(el)*math.cos(az),
    ], dtype=np.float32)

    V  = _look_at(eye, np.zeros(3,np.float32), np.array([0,1,0],np.float32)).astype(np.float32)
    P  = _perspective(36, W/H, 0.05, 20.0).astype(np.float32)
    VP = P @ V

    ones = np.ones((len(verts),1), dtype=np.float32)
    clip = (VP @ np.hstack([verts,ones]).T).T
    w    = clip[:,3:4]
    ndc  = clip[:,:3] / np.where(np.abs(w)<1e-7, 1e-7, w)

    sx = ((ndc[:,0]+1)*0.5*W).astype(np.float32)
    sy = ((1-(ndc[:,1]+1)*0.5)*H).astype(np.float32)
    sz = ndc[:,2].astype(np.float32)

    zbuf  = np.full((H,W), np.inf, dtype=np.float32)
    color = np.zeros((H,W,3), dtype=np.float32)
    alpha = np.zeros((H,W),   dtype=np.float32)

    lights = [
        (np.array([-0.6, 0.8, 0.5],np.float32), np.array([1.00,0.97,0.92])*0.82),
        (np.array([ 0.8, 0.3, 0.3],np.float32), np.array([0.92,0.95,1.00])*0.42),
        (np.array([ 0.0,-0.5,-0.8],np.float32), np.array([0.80,0.85,1.00])*0.18),
    ]
    ambient = np.array([0.18,0.18,0.20], dtype=np.float32)
    vd = -eye / np.linalg.norm(eye)

    v0s = np.stack([sx[faces[:,0]], sy[faces[:,0]], sz[faces[:,0]]], axis=1)
    v1s = np.stack([sx[faces[:,1]], sy[faces[:,1]], sz[faces[:,1]]], axis=1)
    v2s = np.stack([sx[faces[:,2]], sy[faces[:,2]], sz[faces[:,2]]], axis=1)
    n0s = normals[faces[:,0]]; n1s = normals[faces[:,1]]; n2s = normals[faces[:,2]]
    c0s = vcolors[faces[:,0]]; c1s = vcolors[faces[:,1]]; c2s = vcolors[faces[:,2]]

    for i in range(len(faces)):
        x0,y0,z0 = v0s[i]; x1,y1,z1 = v1s[i]; x2,y2,z2 = v2s[i]

        # Backface cull
        if (x1-x0)*(y2-y0)-(y1-y0)*(x2-x0) >= 0:
            continue

        minx=max(0,int(min(x0,x1,x2))); maxx=min(W-1,int(max(x0,x1,x2))+1)
        miny=max(0,int(min(y0,y1,y2))); maxy=min(H-1,int(max(y0,y1,y2))+1)
        if minx>=maxx or miny>=maxy: continue

        py,px = np.mgrid[miny:maxy+1, minx:maxx+1]
        py=py.astype(np.float32); px=px.astype(np.float32)

        denom=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2)
        if abs(denom)<1e-6: continue

        w0=((y1-y2)*(px-x2)+(x2-x1)*(py-y2))/denom
        w1=((y2-y0)*(px-x2)+(x0-x2)*(py-y2))/denom
        w2=1.0-w0-w1

        mask=(w0>=0)&(w1>=0)&(w2>=0)
        if not mask.any(): continue

        pys=py[mask].astype(int); pxs=px[mask].astype(int)
        w0m=w0[mask]; w1m=w1[mask]; w2m=w2[mask]
        zp=w0m*z0+w1m*z1+w2m*z2

        ztest=zp<zbuf[pys,pxs]
        if not ztest.any(): continue

        pys=pys[ztest]; pxs=pxs[ztest]
        w0m=w0m[ztest]; w1m=w1m[ztest]; w2m=w2m[ztest]; zp=zp[ztest]
        zbuf[pys,pxs]=zp

        # Interpolate normal + color
        n  = w0m[:,None]*n0s[i] + w1m[:,None]*n1s[i] + w2m[:,None]*n2s[i]
        nl = np.linalg.norm(n,axis=1,keepdims=True)
        n  = n / np.where(nl<1e-7,1e-7,nl)
        base = w0m[:,None]*c0s[i] + w1m[:,None]*c1s[i] + w2m[:,None]*c2s[i]

        # Phong shading
        c = ambient * base
        for ldir_raw,lcolor in lights:
            ld=ldir_raw/np.linalg.norm(ldir_raw)
            diff=np.clip(n@ld,0,1)[:,None]
            c=c+diff*lcolor*base
            h=ld+vd; h=h/np.linalg.norm(h)
            spec=np.clip(n@h,0,1)[:,None]**40
            c=c+spec*lcolor*0.25

        color[pys,pxs]=np.clip(c,0,1)
        alpha[pys,pxs]=1.0

    # Tone mapping + composite
    rgb=color/(color+0.5)
    rgb=np.power(np.clip(rgb,0,1),0.80)
    bg=_make_bg(); a=alpha[:,:,None]
    return np.clip((rgb*a+bg*(1-a))*255,0,255).astype(np.uint8)


def render_thumbnail(model_path: str) -> Optional[bytes]:
    """
    Render thumbnail từ file 3D (GLB / OBJ / STL / PLY).
    Thuần numpy + PIL — không cần GPU, không cần OpenGL.
    Hỗ trợ vertex colors + material base color.
    """
    try:
        import trimesh
        from PIL import Image, ImageEnhance, ImageFilter
    except ImportError as e:
        logger.warning("[thumb] Thiếu thư viện: %s", e)
        return None

    try:
        path = Path(model_path)
        if not path.exists():
            logger.warning("[thumb] File không tồn tại: %s", model_path)
            return None
        if path.suffix.lower() not in (".glb",".gltf",".obj",".stl",".ply"):
            logger.warning("[thumb] Định dạng không hỗ trợ: %s", path.suffix)
            return None

        scene = trimesh.load(str(path), force="scene", process=False)
        if isinstance(scene, trimesh.Trimesh):
            s2=trimesh.scene.Scene(); s2.add_geometry(scene); scene=s2
        if not getattr(scene,"geometry",None):
            return None

        meshes=[g for g in scene.geometry.values()
                if isinstance(g,trimesh.Trimesh) and len(g.vertices)>0]
        if not meshes:
            return None

        all_v=[]; all_f=[]; all_n=[]; all_c=[]; offset=0
        for m in meshes:
            v=np.array(m.vertices,dtype=np.float32)
            f=np.array(m.faces,   dtype=np.int32)+offset
            if m.vertex_normals is not None and len(m.vertex_normals)==len(v):
                n=np.array(m.vertex_normals,dtype=np.float32)
            else:
                m2=m.copy(); m2.fix_normals()
                n=np.array(m2.vertex_normals,dtype=np.float32)
            c=_get_mesh_color(m)
            all_v.append(v); all_f.append(f); all_n.append(n); all_c.append(c)
            offset+=len(v)

        verts  =np.vstack(all_v)
        faces  =np.vstack(all_f)
        normals=np.vstack(all_n)
        vcolors=np.vstack(all_c)

        # Normalize về [-0.5, 0.5]^3
        mn,mx=verts.min(0),verts.max(0)
        scale=(mx-mn).max()
        if scale==0: return None
        verts=(verts-(mn+mx)/2)/scale
        nl=np.linalg.norm(normals,axis=1,keepdims=True)
        normals=normals/np.where(nl<1e-7,1e-7,nl)

        comp=_rasterize(verts,faces,normals,vcolors)

        img=Image.fromarray(comp)
        img=img.filter(ImageFilter.SMOOTH)
        img=ImageEnhance.Contrast(img).enhance(1.12)
        img=ImageEnhance.Color(img).enhance(1.15)

        buf=io.BytesIO()
        img.save(buf,format="WEBP",quality=88,method=4)
        result=buf.getvalue()
        logger.info("[thumb] OK — %s (%d bytes)", path.name, len(result))
        return result

    except Exception as e:
        logger.error("[thumb] Thất bại: %s", e, exc_info=True)
        return None
