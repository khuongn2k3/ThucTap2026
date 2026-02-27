"""
GLB MediaType Fixer
Fix incorrect MIME types in data URIs embedded in GLB files
"""
import struct
import json
import base64
from pathlib import Path
from typing import Optional


def detect_image_type(image_data: bytes) -> str:
    """
    Phát hiện loại ảnh từ magic bytes
    
    Returns:
        MIME type string (e.g., 'image/png', 'image/jpeg')
    """
    if len(image_data) < 12:
        return 'image/png'  # default
    
    # Check magic bytes
    if image_data[:4] == b'\x89PNG':
        return 'image/png'
    elif image_data[:2] == b'\xff\xd8':
        return 'image/jpeg'
    elif image_data[:3] == b'GIF':
        return 'image/gif'
    elif image_data[:4] == b'RIFF' and image_data[8:12] == b'WEBP':
        return 'image/webp'
    
    return 'image/png'  # default fallback


def fix_glb_mediatype(glb_path: Path) -> dict:
    """
    Sửa lỗi MIME type trong data URI của GLB file
    
    Args:
        glb_path: Đường dẫn đến file GLB
        
    Returns:
        Dict with status and details
    """
    if not glb_path.exists():
        return {
            "status": "error",
            "message": f"File not found: {glb_path}"
        }
    
    try:
        # Read GLB file
        with open(glb_path, 'rb') as f:
            # Read header
            magic = f.read(4)
            if magic != b'glTF':
                return {
                    "status": "error",
                    "message": "Not a valid GLB file (invalid magic)"
                }
            
            version = struct.unpack('<I', f.read(4))[0]
            length = struct.unpack('<I', f.read(4))[0]
            
            # Read JSON chunk
            json_length = struct.unpack('<I', f.read(4))[0]
            json_type = f.read(4)
            
            if json_type != b'JSON':
                return {
                    "status": "error",
                    "message": "Invalid GLB format (no JSON chunk)"
                }
            
            json_data = f.read(json_length).decode('utf-8')
            
            # Read rest of file (binary chunk)
            remaining_data = f.read()
        
        # Parse JSON
        gltf = json.loads(json_data)
        
        if 'images' not in gltf or not gltf['images']:
            return {
                "status": "skip",
                "message": "No images found in GLB"
            }
        
        # Check and fix each image
        fixed_count = 0
        issues_found = []
        
        for i, img in enumerate(gltf['images']):
            if 'uri' not in img:
                continue
            
            uri = img['uri']
            if not uri.startswith('data:'):
                continue
            
            # Parse data URI
            parts = uri.split(',', 1)
            if len(parts) != 2:
                continue
            
            header = parts[0]
            data_b64 = parts[1]
            
            # Decode to check actual type
            try:
                image_bytes = base64.b64decode(data_b64)
                actual_mime = detect_image_type(image_bytes)
                
                # Extract declared MIME from header
                if ';' in header:
                    declared_mime = header.split(';')[0].replace('data:', '')
                else:
                    declared_mime = header.replace('data:', '')
                
                # Check if mismatch
                if declared_mime != actual_mime:
                    issues_found.append({
                        "image_index": i,
                        "declared": declared_mime,
                        "actual": actual_mime
                    })
                    
                    # Fix it
                    new_uri = f"data:{actual_mime};base64,{data_b64}"
                    gltf['images'][i]['uri'] = new_uri
                    fixed_count += 1
                    print(f"✅ Fixed image {i}: {declared_mime} → {actual_mime}")
                
            except Exception as e:
                print(f"⚠️  Could not check image {i}: {e}")
                continue
        
        if fixed_count == 0:
            return {
                "status": "ok",
                "message": "No issues found",
                "images_checked": len(gltf['images'])
            }
        
        # Write back to file
        # Convert JSON back to bytes
        new_json_data = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
        new_json_length = len(new_json_data)
        
        # Pad JSON to 4-byte boundary
        padding = (4 - (new_json_length % 4)) % 4
        new_json_data += b' ' * padding
        new_json_length += padding
        
        # Calculate new total length
        new_total_length = 12 + 8 + new_json_length + len(remaining_data)
        
        # Write new GLB
        with open(glb_path, 'wb') as f:
            # Header
            f.write(b'glTF')
            f.write(struct.pack('<I', version))
            f.write(struct.pack('<I', new_total_length))
            
            # JSON chunk
            f.write(struct.pack('<I', new_json_length))
            f.write(b'JSON')
            f.write(new_json_data)
            
            # Binary chunk (unchanged)
            f.write(remaining_data)
        
        return {
            "status": "fixed",
            "message": f"Fixed {fixed_count} image(s)",
            "fixed_count": fixed_count,
            "issues": issues_found
        }
        
    except Exception as e:
        import traceback
        return {
            "status": "error",
            "message": f"Failed to fix GLB: {str(e)}",
            "traceback": traceback.format_exc()
        }


def fix_glb_file(file_path: str) -> dict:
    """
    Convenience function to fix a GLB file
    
    Args:
        file_path: Path to GLB file (string or Path)
        
    Returns:
        Result dictionary
    """
    return fix_glb_mediatype(Path(file_path))


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python fix_glb_mediatype.py <path_to_glb_file>")
        sys.exit(1)
    
    result = fix_glb_file(sys.argv[1])
    print(json.dumps(result, indent=2))
