import { useEffect, useRef } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader"
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader"
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment"

/* ─────────────────────────────────────────────
   SHADERS
───────────────────────────────────────────── */

// SOLID — trắng như clay/tượng, diffuse lighting, không texture (như Tripo/Blender Solid View)
const SOLID_VERT = `
#include <skinning_pars_vertex>
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vec3 transformed = vec3(position);
  vec3 objectNormal = vec3(normal);
  #include <skinbase_vertex>
  #include <skinning_vertex>
  #include <skinnormal_vertex>
  vNormal = normalize(normalMatrix * objectNormal);
  vec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`
const SOLID_FRAG = `
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vec3 baseColor = vec3(0.92, 0.92, 0.90);
  vec3 lightDir  = normalize(vec3(1.0, 2.0, 1.5));
  float diff     = max(dot(vNormal, lightDir), 0.0);
  float ambient  = 0.35;
  float rim = 1.0 - max(dot(vNormal, vViewDir), 0.0);
  rim = pow(rim, 3.0) * 0.15;
  float light = ambient + diff * 0.65 + rim;
  gl_FragColor = vec4(baseColor * light, 1.0);
}
`

// NORMAL — visualize normal vectors as RGB
const NORMAL_VERT = `
#include <skinning_pars_vertex>
varying vec3 vNormal;
void main() {
  vec3 transformed = vec3(position);
  vec3 objectNormal = vec3(normal);
  #include <skinbase_vertex>
  #include <skinning_vertex>
  #include <skinnormal_vertex>
  vNormal = normalize(normalMatrix * objectNormal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`
const NORMAL_FRAG = `
varying vec3 vNormal;
void main() {
  gl_FragColor = vec4(vNormal * 0.5 + 0.5, 1.0);
}
`

// CARTOON — cel shading, có texture
const CARTOON_VERT = `
#include <skinning_pars_vertex>
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;
void main() {
  vec3 transformed = vec3(position);
  vec3 objectNormal = vec3(normal);
  #include <skinbase_vertex>
  #include <skinning_vertex>
  #include <skinnormal_vertex>
  vNormal = normalize(normalMatrix * objectNormal);
  vUv = uv;
  vec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`
const CARTOON_FRAG = `
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;
uniform vec3 uColor;
uniform sampler2D uMap;
uniform float uHasMap;
void main() {
  vec3 light = normalize(vec3(1.0, 2.0, 1.0));
  float diff = dot(vNormal, light);
  float cel = diff > 0.6 ? 1.0 : diff > 0.2 ? 0.6 : 0.3;
  float rim = 1.0 - max(dot(vNormal, vViewDir), 0.0);
  rim = smoothstep(0.6, 1.0, rim) * 0.4;
  vec3 base = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : uColor;
  vec3 col = base * cel + vec3(rim);
  gl_FragColor = vec4(col, 1.0);
}
`

// SKETCH — pencil outline style
const SKETCH_VERT = `
#include <skinning_pars_vertex>
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;
void main() {
  vec3 transformed = vec3(position);
  vec3 objectNormal = vec3(normal);
  #include <skinbase_vertex>
  #include <skinning_vertex>
  #include <skinnormal_vertex>
  vNormal = normalize(normalMatrix * objectNormal);
  vUv = uv;
  vec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`
const SKETCH_FRAG = `
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;
void main() {
  vec3 light = normalize(vec3(1.0, 2.0, 0.5));
  float diff = dot(vNormal, light);
  float edge = dot(vNormal, vViewDir);
  float outline = smoothstep(0.1, 0.4, edge);
  float hatch1 = step(0.5, fract((vUv.x + vUv.y) * 8.0 + diff * 2.0));
  float hatch2 = step(0.5, fract((vUv.x - vUv.y) * 8.0));
  float sketch = diff > 0.5 ? 1.0 : diff > 0.0 ? mix(hatch1, 1.0, 0.5) : hatch1 * hatch2;
  float final = sketch * outline;
  gl_FragColor = vec4(vec3(final * 0.2), 1.0);
}
`

// HOLOGRAM — transparent scanlines + glow
const HOLOGRAM_VERT = `
#include <skinning_pars_vertex>
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewDir;
void main() {
  vec3 transformed = vec3(position);
  vec3 objectNormal = vec3(normal);
  #include <skinbase_vertex>
  #include <skinning_vertex>
  #include <skinnormal_vertex>
  vNormal = normalize(normalMatrix * objectNormal);
  vPosition = transformed;
  vec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`
const HOLOGRAM_FRAG = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewDir;
uniform float uTime;
void main() {
  vec3 holoColor = vec3(0.1, 0.8, 1.0);
  float scan = step(0.5, fract(vPosition.y * 20.0 + uTime * 2.0));
  float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 2.0);
  float flicker = 0.85 + 0.15 * sin(uTime * 8.0);
  float alpha = (fresnel * 0.6 + scan * 0.2 + 0.1) * flicker;
  gl_FragColor = vec4(holoColor, alpha);
}
`


/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

function applyShaderToScene(scene, style, originalMaterials) {
  scene.traverse(obj => {
    if (!obj.isMesh) return

    if (style === "default") {
      // Restore material gốc
      if (originalMaterials.has(obj.uuid)) {
        obj.material = originalMaterials.get(obj.uuid)
      }
      return
    }

    // Lưu material gốc lần đầu
    if (!originalMaterials.has(obj.uuid)) {
      originalMaterials.set(obj.uuid, obj.material)
    }

    const orig = originalMaterials.get(obj.uuid)
    const color = orig?.color ? orig.color : new THREE.Color(0x888888)
    const map = orig?.map || null

    switch (style) {
      case "solid":
        obj.material = new THREE.ShaderMaterial({
          vertexShader: SOLID_VERT,
          fragmentShader: SOLID_FRAG,
          skinning: true,
        })
        break
      case "unlit": {
        // MeshBasicMaterial tự support skinning — không cần thêm gì
        const basicMat = new THREE.MeshBasicMaterial()
        if (orig?.map) {
          basicMat.map = orig.map
        } else if (orig?.color) {
          basicMat.color.copy(orig.color)
        }
        basicMat.transparent = false
        basicMat.opacity = 1
        obj.material = basicMat
        break
      }
      case "normal":
        obj.material = new THREE.ShaderMaterial({
          vertexShader: NORMAL_VERT,
          fragmentShader: NORMAL_FRAG,
          skinning: true,
        })
        break
      case "cartoon":
        obj.material = new THREE.ShaderMaterial({
          vertexShader: CARTOON_VERT,
          fragmentShader: CARTOON_FRAG,
          skinning: true,
          uniforms: {
            uColor:  { value: color.clone() },
            uMap:    { value: map },
            uHasMap: { value: map ? 1.0 : 0.0 },
          },
        })
        break
      case "sketch":
        obj.material = new THREE.ShaderMaterial({
          vertexShader: SKETCH_VERT,
          fragmentShader: SKETCH_FRAG,
          skinning: true,
        })
        break
      case "hologram":
        obj.material = new THREE.ShaderMaterial({
          vertexShader: HOLOGRAM_VERT,
          fragmentShader: HOLOGRAM_FRAG,
          skinning: true,
          uniforms: { uTime: { value: 0 } },
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
        break
    }
  })
}

/* ─────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────── */

export default function ModelViewer3D({
  src,
  fileExt = null,   // Fix 3: ext thực tế khi src là blob URL (không có đuôi file)
  style = "default",
  autoRotate = true,
  interactive = true,
  cameraQuatRef = null,
  wireframe = false,
  shading = "smooth",
  pbr = true,
  metallic = 1,
  roughness = 1,
  environment = "studio", // preset key: "studio"|"city"|"forest"|"night"|"outdoor"|"none"
  envStrength = 1,
  envRotation = 0,
  envAutoRotate = false,
}) {
  const mountRef     = useRef(null)
  const rendererRef  = useRef(null)
  const sceneRef     = useRef(null)
  const cameraRef    = useRef(null)
  const controlsRef  = useRef(null)
  const animFrameRef = useRef(null)
  const mixerRef     = useRef(null)
  const clockRef     = useRef(new THREE.Clock())
  const origMatsRef  = useRef(new Map())
  const styleRef     = useRef(style)
  const pmremRef     = useRef(null)
  const envMapRef    = useRef(null)
  const lightsRef    = useRef({})   // { ambient, key, fill, back, bottom }
  const currentModelRef = useRef(null)  // Fix 4: track model hiện tại để dispose khi swap

  // ENV preset configs — chỉ điều chỉnh lights, không cần HTTP
  const ENV_PRESETS = {
    studio:   { ambientColor:0xffffff, ambientI:0.8, keyColor:0xffffff, keyI:1.2, fillColor:0xaabbff, fillI:0.5, backI:0.4, bottomColor:0x334466, bottomI:0.2 },
    beach:    { ambientColor:0xffeedd, ambientI:1.0, keyColor:0xffee99, keyI:1.8, fillColor:0x88ccff, fillI:0.6, backI:0.5, bottomColor:0xddcc88, bottomI:0.3 },
    desert:   { ambientColor:0xffcc88, ambientI:1.0, keyColor:0xffaa44, keyI:2.0, fillColor:0x886644, fillI:0.4, backI:0.4, bottomColor:0xcc8833, bottomI:0.2 },
    forest:   { ambientColor:0xcceecc, ambientI:0.7, keyColor:0xeeffee, keyI:1.2, fillColor:0x336622, fillI:0.4, backI:0.3, bottomColor:0x223311, bottomI:0.2 },
    interior: { ambientColor:0xffcc88, ambientI:0.6, keyColor:0xffaa44, keyI:1.2, fillColor:0xff9933, fillI:0.3, backI:0.2, bottomColor:0x331100, bottomI:0.1 },
    night:    { ambientColor:0x223355, ambientI:0.4, keyColor:0x4466ff, keyI:1.0, fillColor:0x334466, fillI:0.3, backI:0.2, bottomColor:0x111122, bottomI:0.1 },
  }

  // Refs để effects luôn đọc giá trị mới nhất
  const environmentRef  = useRef(environment)
  const envStrengthRef  = useRef(envStrength)
  const envRotationRef2 = useRef(envRotation)
  const envAutoRotateRef= useRef(envAutoRotate)
  const pbrRef          = useRef(pbr)
  const metallicRef     = useRef(metallic)
  const roughnessRef    = useRef(roughness)
  useEffect(() => { environmentRef.current  = environment  }, [environment])
  useEffect(() => { envStrengthRef.current  = envStrength  }, [envStrength])
  useEffect(() => { envRotationRef2.current = envRotation  }, [envRotation])
  useEffect(() => { envAutoRotateRef.current= envAutoRotate}, [envAutoRotate])
  useEffect(() => { pbrRef.current          = pbr          }, [pbr])
  useEffect(() => { metallicRef.current     = metallic     }, [metallic])
  useEffect(() => { roughnessRef.current    = roughness    }, [roughness])

  // Helper apply preset lights
  const _applyPreset = (presetKey, strength) => {
    const preset = ENV_PRESETS[presetKey] ?? ENV_PRESETS.studio
    const lights = lightsRef.current
    const s = strength ?? envStrengthRef.current
    if (lights.ambient) {
      lights.ambient.color.setHex(preset.ambientColor)
      lights.ambient.intensity = preset.ambientI * s
    }
    if (lights.key) {
      lights.key.color.setHex(preset.keyColor)
      lights.key.intensity = preset.keyI * s
    }
    if (lights.fill) {
      lights.fill.color.setHex(preset.fillColor)
      lights.fill.intensity = preset.fillI * s
    }
    if (lights.back) {
      lights.back.intensity = preset.backI * s
    }
    if (lights.bottom) {
      lights.bottom.color.setHex(preset.bottomColor)
      lights.bottom.intensity = preset.bottomI * s
    }
    // RoomEnvironment envMap intensity — giữ thấp hơn light intensity
    // để tránh phản chiếu quá mạnh gây bóng sáng chóe
    const scene = sceneRef.current
    if (scene && scene.environmentIntensity !== undefined) {
      scene.environmentIntensity = presetKey === "none" ? 0 : s * 0.3
    }
  }

  // environment preset thay đổi → apply lights
  useEffect(() => {
    if (lightsRef.current.ambient) _applyPreset(environment, envStrengthRef.current)
  }, [environment])

  // strength thay đổi
  useEffect(() => {
    if (lightsRef.current.ambient) _applyPreset(environmentRef.current, envStrength)
  }, [envStrength])

  // rotation thay đổi → xoay environment + lights
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    const rad = (envRotation * Math.PI) / 180
    // Xoay env map reflection
    if (scene.environmentRotation !== undefined) {
      scene.environmentRotation.y = rad
    }
    // Xoay lights theo cùng góc
    const lights = lightsRef.current
    const positions = {
      key:    new THREE.Vector3( 2,  4,  3),
      fill:   new THREE.Vector3(-3,  1,  2),
      back:   new THREE.Vector3( 0,  2, -4),
      bottom: new THREE.Vector3( 0, -3,  1),
    }
    const cos = Math.cos(rad), sin = Math.sin(rad)
    Object.entries(positions).forEach(([name, pos]) => {
      if (lights[name]) {
        lights[name].position.set(
          pos.x * cos + pos.z * sin,
          pos.y,
          -pos.x * sin + pos.z * cos,
        )
      }
    })
  }, [envRotation])

  // Khi style thay đổi → apply shader
  useEffect(() => {
    styleRef.current = style
    if (sceneRef.current) {
      applyShaderToScene(sceneRef.current, style, origMatsRef.current)
    }
  }, [style])

  // Sync autoRotate → OrbitControls
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate
    }
  }, [autoRotate])

  // Wireframe → floor grid như Blender
  const gridRef = useRef(null)
  useEffect(() => {
    if (!sceneRef.current) return
    if (wireframe) {
      if (!gridRef.current) {
        const grid = new THREE.GridHelper(10, 20, 0x444444, 0x2a2a2a)
        grid.position.y = -1.05
        grid.name = "__floor_grid__"
        gridRef.current = grid
        sceneRef.current.add(grid)
      }
    } else {
      if (gridRef.current) {
        sceneRef.current.remove(gridRef.current)
        gridRef.current.geometry.dispose()
        gridRef.current.material.dispose()
        gridRef.current = null
      }
    }
  }, [wireframe])

  // Shading (flat / smooth)
  useEffect(() => {
    if (!sceneRef.current) return
    sceneRef.current.traverse(obj => {
      if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach(m => {
          m.flatShading = shading === "flat"
          m.needsUpdate = true
        })
      }
    })
  }, [shading])

  // PBR / metallic / roughness — chỉ áp cho MeshStandardMaterial (default view)
  useEffect(() => {
    if (!sceneRef.current) return
    sceneRef.current.traverse(obj => {
      if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach(m => {
          if (m.isMeshStandardMaterial) {
            m.metalness = pbr ? metallic : 0
            m.roughness = pbr ? roughness : 1
            m.needsUpdate = true
          }
        })
      }
    })
  }, [pbr, metallic, roughness])

  // ── Fix 4: Setup scene MỘT LẦN (không phụ thuộc src) ───────────────────
  useEffect(() => {
    if (!mountRef.current) return
    const mount = mountRef.current
    const w = mount.clientWidth
    const h = mount.clientHeight

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.8
    renderer.setClearColor(0x000000, 0)  // transparent để CSS gradient hiện xuyên
    renderer.sortObjects = true          // đảm bảo render order đúng
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Scene
    const scene = new THREE.Scene()
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 1000)
    camera.position.set(0, 0, 3)
    cameraRef.current = camera

    // Lights — studio 3-point lighting (stored in ref for dynamic update)
    const ambient = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambient)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2)
    keyLight.position.set(2, 4, 3)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xaabbff, 0.5)
    fillLight.position.set(-3, 1, 2)
    scene.add(fillLight)
    const backLight = new THREE.DirectionalLight(0xffffff, 0.4)
    backLight.position.set(0, 2, -4)
    scene.add(backLight)
    const bottomLight = new THREE.DirectionalLight(0x334466, 0.2)
    bottomLight.position.set(0, -3, 1)
    scene.add(bottomLight)
    lightsRef.current = { ambient, key: keyLight, fill: fillLight, back: backLight, bottom: bottomLight }

    // RoomEnvironment — cung cấp reflection map cho MeshStandardMaterial, không cần HTTP
    const pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()
    const roomEnvMap = pmrem.fromScene(new RoomEnvironment()).texture
    pmremRef.current = pmrem
    envMapRef.current = roomEnvMap
    scene.environment = roomEnvMap
    if (scene.environmentIntensity !== undefined) scene.environmentIntensity = 0.4

    // Apply initial preset
    _applyPreset(environmentRef.current ?? "studio", envStrengthRef.current)
    if (interactive) {
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      controls.autoRotate = autoRotate
      controls.autoRotateSpeed = 1.5
      controlsRef.current = controls
    }

    // Animate loop
    const clock = clockRef.current
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      const delta = clock.getDelta()

      if (mixerRef.current) mixerRef.current.update(delta)
      if (controlsRef.current) controlsRef.current.update()

      // Update hologram time uniform
      if (styleRef.current === "hologram" && sceneRef.current) {
        const t = clock.getElapsedTime()
        sceneRef.current.traverse(obj => {
          if (obj.isMesh && obj.material?.uniforms?.uTime) {
            obj.material.uniforms.uTime.value = t
          }
        })
      }

      // Auto rotate nếu không có controls
      if (!interactive && sceneRef.current) {
        sceneRef.current.rotation.y += delta * 0.5
      }

      // Env auto-rotate → xoay environment + lights
      if (envAutoRotateRef.current && sceneRef.current) {
        const sc = sceneRef.current
        const step = delta * 0.6
        if (sc.environmentRotation !== undefined) {
          sc.environmentRotation.y += step
        }
        const lights = lightsRef.current
        const s = Math.sin(step), c = Math.cos(step)
        ;[lights.key, lights.fill, lights.back, lights.bottom].forEach(l => {
          if (!l) return
          const x = l.position.x, z = l.position.z
          l.position.x = x * c + z * s
          l.position.z = -x * s + z * c
        })
      }

      // Sync quaternion camera ra ngoài cho gizmo
      if (cameraQuatRef) {
        const q = camera.quaternion
        cameraQuatRef.current = { x: q.x, y: q.y, z: q.z, w: q.w }
      }

      renderer.render(scene, camera)
    }
    animate()

    // Resize handler
    const onResize = () => {
      const nw = mount.clientWidth
      const nh = mount.clientHeight
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
      renderer.setSize(nw, nh)
    }
    window.addEventListener("resize", onResize)

    return () => {
      window.removeEventListener("resize", onResize)
      cancelAnimationFrame(animFrameRef.current)
      if (controlsRef.current) controlsRef.current.dispose()
      if (gridRef.current) {
        gridRef.current.geometry?.dispose()
        gridRef.current.material?.dispose()
        gridRef.current = null
      }
      renderer.dispose()
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement)
      }
      origMatsRef.current.clear()
      if (pmremRef.current) { pmremRef.current.dispose(); pmremRef.current = null }
      if (envMapRef.current) { envMapRef.current.dispose(); envMapRef.current = null }
    }
  }, [])  // Fix 4: chạy một lần duy nhất khi mount

  // ── Fix 4: Load / swap model khi src thay đổi — không rebuild scene ─────
  useEffect(() => {
    if (!src || !sceneRef.current) return
    const scene = sceneRef.current

    // Dispose model cũ trước khi load model mới
    if (currentModelRef.current) {
      const { model: oldModel, mixer: oldMixer } = currentModelRef.current
      scene.remove(oldModel)
      oldModel.traverse(obj => {
        if (obj.isMesh) {
          obj.geometry?.dispose()
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
          else obj.material?.dispose()
        }
      })
      if (oldMixer) { oldMixer.stopAllAction(); oldMixer.uncacheRoot(oldModel) }
      currentModelRef.current = null
    }
    mixerRef.current = null
    origMatsRef.current.clear()

    let loadCancelled = false  // abort nếu src đổi trước khi load xong

    // Convert bất kỳ material nào → MeshStandardMaterial để PBR/shading hoạt động
    const convertToStandard = (obj) => {
      obj.traverse(child => {
        if (!child.isMesh) return
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        const converted = mats.map(m => {
          if (m.isMeshStandardMaterial) return m
          const std = new THREE.MeshStandardMaterial()
          if (m.color) std.color.copy(m.color)
          if (m.map)          std.map = m.map
          if (m.normalMap)    std.normalMap = m.normalMap
          if (m.aoMap)        std.aoMap = m.aoMap
          if (m.emissiveMap)  std.emissiveMap = m.emissiveMap
          if (m.emissive)     std.emissive.copy(m.emissive)
          if (m.alphaMap)     std.alphaMap = m.alphaMap
          if (m.side !== undefined) std.side = m.side
          std.roughness = 0.6
          std.metalness = 0.05
          const lum = std.color.r * 0.299 + std.color.g * 0.587 + std.color.b * 0.114
          if (lum < 0.08 && !std.map) {
            std.color.setHex(0x888888)
          }
          const hasRealOpacity = m.opacity !== undefined && m.opacity < 0.99
          if (hasRealOpacity && m.alphaMap) {
            std.transparent = true
            std.opacity = m.opacity
          } else {
            std.transparent = false
            std.opacity = 1
            std.depthWrite = true
            std.onBeforeCompile = (shader) => {
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <dithering_fragment>',
                '#include <dithering_fragment>\ngl_FragColor.a = 1.0;'
              )
            }
          }
          m.dispose()
          return std
        })
        child.material = converted.length === 1 ? converted[0] : converted
        child.material.needsUpdate = true
      })
    }

    const onModelLoaded = (model, animations = []) => {
      if (loadCancelled) {
        // Dispose model bị cancel để tránh memory leak
        model.traverse(obj => {
          if (obj.isMesh) {
            obj.geometry?.dispose()
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
            else obj.material?.dispose()
          }
        })
        return
      }

      // Center và scale
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale = 2 / maxDim
      model.scale.setScalar(scale)
      model.position.sub(center.multiplyScalar(scale))

      scene.add(model)

      // Animation mixer (GLB only)
      if (animations.length > 0) {
        const mixer = new THREE.AnimationMixer(model)
        animations.forEach(clip => mixer.clipAction(clip).play())
        mixerRef.current = mixer
      }

      // Apply PBR metallic/roughness ngay sau khi model vào scene
      model.traverse(obj => {
        if (obj.isMesh && obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach(m => {
            if (m.isMeshStandardMaterial) {
              m.metalness = pbrRef.current ? metallicRef.current : 0
              m.roughness = pbrRef.current ? roughnessRef.current : 1
              m.needsUpdate = true
            }
          })
        }
      })

      // Apply style
      applyShaderToScene(scene, styleRef.current, origMatsRef.current)
      // Apply environment preset sau khi model vào scene
      _applyPreset(environmentRef.current ?? "studio", envStrengthRef.current)

      currentModelRef.current = { model, mixer: mixerRef.current }
    }

    // Fix 3: ưu tiên fileExt prop (khi src là blob URL không có đuôi)
    const rawExt = src.split("?")[0].split(".").pop().toLowerCase()
    const ext = fileExt ?? (/^(glb|gltf|obj|stl)$/.test(rawExt) ? rawExt : "glb")

    if (ext === "obj") {
      const defaultMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.6, metalness: 0.05 })
      const loadObj = (materials = null) => {
        const loader = new OBJLoader()
        if (materials) loader.setMaterials(materials)
        loader.load(src, (obj) => {
          if (!materials) {
            obj.traverse(child => { if (child.isMesh) child.material = defaultMat })
          } else {
            convertToStandard(obj)
          }
          onModelLoaded(obj)
        }, undefined, err => console.error("OBJLoader error:", err))
      }

      const mtlUrl = src.replace(/\.obj(\?.*)?$/i, ".mtl")
      const resourcePath = src.substring(0, src.lastIndexOf('/') + 1)
      const mtlLoader = new MTLLoader()
      mtlLoader.setResourcePath(resourcePath)
      mtlLoader.load(mtlUrl, (materials) => {
        materials.preload()
        loadObj(materials)
      }, undefined, () => {
        loadObj()
      })

    } else if (ext === "stl") {
      const loader = new STLLoader()
      loader.load(src, (geometry) => {
        geometry.computeVertexNormals()
        const mat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.7, metalness: 0.1 })
        const mesh = new THREE.Mesh(geometry, mat)
        const group = new THREE.Group()
        group.add(mesh)
        onModelLoaded(group)
      }, undefined, err => console.error("STLLoader error:", err))

    } else {
      // GLB / GLTF
      const loader = new GLTFLoader()
      loader.load(src, (gltf) => {
        gltf.scene.traverse(obj => {
          if (!obj.isMesh || !obj.material) return
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach(m => {
            m.transparent = false
            m.opacity = 1
            m.depthWrite = true
            m.needsUpdate = true
          })
        })
        onModelLoaded(gltf.scene, gltf.animations)
      }, undefined, err => console.error("GLTFLoader error:", err))
    }

    return () => {
      loadCancelled = true  // Fix 4: huỷ load nếu src đổi trước khi loader callback
    }
  }, [src, fileExt])  // Fix 4: chỉ chạy lại khi src hoặc fileExt thay đổi

  return (
    <div
      ref={mountRef}
      style={{ width:"100%", height:"100%", background:"transparent" }}
    />
  )
}