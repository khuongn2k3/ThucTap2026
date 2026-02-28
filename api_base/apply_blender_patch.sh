#!/bin/bash
# ==========================================
# PATCH FILE: Apply Blender Processor Integration to quick_setup.sh
# ==========================================
# 
# USAGE:
#   1. Save this file as: apply_blender_patch.sh
#   2. chmod +x apply_blender_patch.sh
#   3. ./apply_blender_patch.sh
#
# Or manually copy the sections below into quick_setup.sh
# ==========================================

QUICK_SETUP_FILE="quick_setup.sh"

if [ ! -f "$QUICK_SETUP_FILE" ]; then
    echo "ERROR: quick_setup.sh not found in current directory!"
    exit 1
fi

echo "Applying Blender Processor patches to $QUICK_SETUP_FILE..."

# Create backup
cp "$QUICK_SETUP_FILE" "${QUICK_SETUP_FILE}.backup_$(date +%Y%m%d_%H%M%S)"
echo "Backup created"

# ==========================================
# PATCH 1: Add to header description
# ==========================================
echo "Patch 1: Updating header description..."
sed -i '/Download AI model weights/a\echo "  - Setup Blender processor - optional OBJ->GLB conversion"' "$QUICK_SETUP_FILE"

# ==========================================
# PATCH 2: Insert STEP 7.5 after STEP 7
# ==========================================
echo "Patch 2: Inserting STEP 7.5 - Blender Processor Setup..."

# Find the line number where STEP 8 starts
STEP8_LINE=$(grep -n "# STEP 8: Compile CUDA modules" "$QUICK_SETUP_FILE" | head -1 | cut -d: -f1)

if [ -n "$STEP8_LINE" ]; then
    # Insert before STEP 8
    INSERT_LINE=$((STEP8_LINE - 1))
    
    # Create temporary file with new content
    head -n $INSERT_LINE "$QUICK_SETUP_FILE" > /tmp/quick_setup_new.sh
    
    # Add STEP 7.5
    cat >> /tmp/quick_setup_new.sh << 'STEP75'

# ==========================================
# STEP 7.5: Setup Blender Processor
# ==========================================
echo -e "\n${MAGENTA}=======================================${NC}"
echo -e "${MAGENTA}[7.5/12] SETTING UP BLENDER PROCESSOR${NC}"
echo -e "${MAGENTA}=======================================${NC}\n"

BLENDER_PROCESSOR="blender_processor.py"

# Check if blender_processor.py exists in current directory
if [ -f "$BLENDER_PROCESSOR" ]; then
    echo -e "${GREEN}OK: blender_processor.py found in api_base/${NC}"
    chmod 644 "$BLENDER_PROCESSOR"
    
    # Test import
    echo -e "${YELLOW}Testing blender_processor import...${NC}"
    python -c "
try:
    from blender_processor import get_blender_status
    status = get_blender_status()
    
    if status['enabled']:
        print('OK: Blender processor: ENABLED')
        blender_ver = status.get('blender_version', 'N/A')
        print(f'   Blender version: {blender_ver}')
        print('   OBJ->GLB conversion will be available')
    else:
        if status.get('disabled_by_env'):
            print('INFO: Blender processor: DISABLED - by DISABLE_BLENDER env')
        elif not status.get('available'):
            print('WARNING: Blender processor: UNAVAILABLE - bpy not installed')
            print('   OBJ->GLB conversion will NOT be available')
            print('   Install: pip install fake-bpy-module-latest')
        else:
            print('INFO: Blender processor: DISABLED')
        
        print('   Generated GLB files will be used as-is from model_worker')
        
except ImportError as e:
    print(f'ERROR: blender_processor.py import failed: {e}')
    print('   GLB conversion will be unavailable')
    print('   Service will continue with model_worker GLB only')
except Exception as e:
    print(f'WARNING: blender_processor check warning: {e}')
" 2>&1

else
    echo -e "${YELLOW}WARNING: blender_processor.py not found in api_base/${NC}"
    echo "   Expected location: $(pwd)/blender_processor.py"
    echo "   OBJ->GLB conversion will be unavailable"
    echo ""
    echo "   To enable Blender processor:"
    echo "   1. Copy blender_processor.py to api_base/"
    echo "   2. Set DISABLE_BLENDER=false in .env"
    echo "   3. pip install fake-bpy-module-latest"
    echo ""
    echo "   Service will continue with model_worker GLB output only"
fi

STEP75
    
    # Add rest of file
    tail -n +$((INSERT_LINE + 1)) "$QUICK_SETUP_FILE" >> /tmp/quick_setup_new.sh
    
    # Replace original
    mv /tmp/quick_setup_new.sh "$QUICK_SETUP_FILE"
    echo "STEP 7.5 inserted"
else
    echo "ERROR: Could not find STEP 8 marker"
fi

# ==========================================
# PATCH 3: Add DISABLE_BLENDER to .env
# ==========================================
echo "Patch 3: Adding DISABLE_BLENDER to .env generation..."

# Find line with HUNYUAN3D_DEVICE
ENV_LINE=$(grep -n "HUNYUAN3D_DEVICE=cuda" "$QUICK_SETUP_FILE" | cut -d: -f1)

if [ -n "$ENV_LINE" ]; then
    # Insert after that line
    sed -i "${ENV_LINE}a\\
\\
# =========================================\\
# BLENDER PROCESSOR\\
# =========================================\\
# Set to 'true' to disable OBJ->GLB conversion - faster dev mode\\
# Set to 'false' to enable OBJ->GLB conversion - requires bpy/Blender\\
DISABLE_BLENDER=false
" "$QUICK_SETUP_FILE"
    echo "DISABLE_BLENDER added to .env"
else
    echo "WARNING: Could not find HUNYUAN3D_DEVICE line, skipping .env patch"
fi

# ==========================================
# PATCH 4: Add Blender status to final report
# ==========================================
echo "Patch 4: Adding Blender status to final report..."

# Find the line with "All checks passed"
FINAL_LINE=$(grep -n "All checks passed. Ready to run" "$QUICK_SETUP_FILE" | cut -d: -f1)

if [ -n "$FINAL_LINE" ]; then
    # Insert before that line
    INSERT_LINE=$((FINAL_LINE - 1))
    
    sed -i "${INSERT_LINE}a\\
echo \"\"\\
echo -e \"\${CYAN}Blender Processor Status:\${NC}\"\\
python -c \"\\
try:\\
    from blender_processor import get_blender_status\\
    status = get_blender_status()\\
    if status['enabled']:\\
        print('   OK: ENABLED - OBJ->GLB conversion available')\\
        print(f\\\"   Version: {status.get('blender_version', 'N/A')}\\\")\\
    else:\\
        print('   WARNING: DISABLED - Only model_worker GLB will be used')\\
        if status.get('disabled_by_env'):\\
            print('   Reason: DISABLE_BLENDER=true in .env')\\
        elif not status.get('available'):\\
            print('   Reason: bpy not installed')\\
            print('   Install: pip install fake-bpy-module-latest')\\
        print('   To enable: Set DISABLE_BLENDER=false in .env')\\
except ImportError:\\
    print('   WARNING: blender_processor.py not found')\\
    print('   Copy blender_processor.py to api_base/ to enable')\\
except Exception as e:\\
    print(f'   WARNING: Status check failed: {e}')\\
\" 2>/dev/null || echo \"   WARNING: Status check unavailable\"\\
echo \"\"
" "$QUICK_SETUP_FILE"
    echo "Blender status added to final report"
else
    echo "WARNING: Could not find final report line, skipping"
fi

# ==========================================
# DONE
# ==========================================
echo ""
echo "All patches applied successfully!"
echo ""
echo "Changes made:"
echo "  1. Added STEP 7.5: Blender Processor Setup"
echo "  2. Added DISABLE_BLENDER to .env generation"
echo "  3. Added Blender status to final report"
echo ""
echo "Backup saved as: ${QUICK_SETUP_FILE}.backup_*"
echo ""
echo "Next steps:"
echo "  1. Copy blender_processor.py to api_base/"
echo "  2. Run ./quick_setup.sh"
echo "  3. Edit .env to set DISABLE_BLENDER=false if needed"