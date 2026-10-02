'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

const LOGO_SRC = '/brand/logo-full.png'
const LOGO_W = 932
const LOGO_H = 776
const INSET = 0.12

const vertexShader = `
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const fragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTex;
  uniform vec2  uCenter;
  uniform float uAspect;
  uniform float uRadius;
  uniform float uPresence;
  uniform float uTime;
  uniform vec3  uRing;

  vec4 sampleTex(vec2 uv){
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
    return texture2D(uTex, uv);
  }

  void main(){
    vec4 base = sampleTex(vUv);
    vec2 off = vUv - uCenter;
    vec2 p = vec2(off.x * uAspect, off.y);
    float r = uRadius * uPresence;
    float d = length(p) / max(r, 1e-4);
    if (d >= 1.0) { gl_FragColor = base; return; }

    float ang = atan(p.y, p.x);
    vec2 radial = normalize(off + 1e-6);
    vec2 tang = vec2(-radial.y, radial.x);
    float rim = smoothstep(0.55, 1.0, d);

    float pull = 0.34 * d * d;
    float wave = sin(ang * 3.0 + uTime * 0.9) * 0.55 + sin(ang * 5.0 - uTime * 0.7) * 0.25;
    vec2 uv = uCenter + off * (1.0 - pull)
      + tang * wave * rim * r * 0.05
      - radial * rim * r * 0.09;

    vec2 disp = off * 0.07 * rim;
    vec4 sr = sampleTex(uv - disp);
    vec4 sg = sampleTex(uv);
    vec4 sb = sampleTex(uv + disp);
    vec4 col = vec4(sr.r, sg.g, sb.b, max(sg.a, max(sr.a, sb.a)));

    float glass = 0.05 + 0.05 * rim;
    col.rgb += uRing * glass;
    col.a = clamp(col.a + glass, 0.0, 1.0);

    float shimmer = sin(ang * 4.0 + uTime * 1.6) * 0.35 + 0.65;
    float ring = exp(-pow((d - 0.93) / 0.045, 2.0)) * 0.55 * shimmer;
    float aura = exp(-pow((d - 0.93) / 0.18, 2.0)) * 0.10;
    float highlight = exp(-pow((d - 0.8) / 0.05, 2.0)) * smoothstep(0.3, 1.0, -sin(ang - 0.8)) * 0.35;
    vec3 add = uRing * (ring + aura) + vec3(highlight);
    col.rgb += add;
    col.a = clamp(col.a + max(add.r, max(add.g, add.b)), 0.0, 1.0);

    float edge = smoothstep(1.0, 0.95, d);
    gl_FragColor = mix(base, col, edge);
  }
`

export function LiquidGlassLogo({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true })
    } catch {
      return
    }
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const canvas = renderer.domElement
    canvas.setAttribute('aria-hidden', 'true')
    canvas.className = 'absolute inset-0 h-full w-full'
    container.appendChild(canvas)

    const textureCanvas = document.createElement('canvas')
    const texture = new THREE.CanvasTexture(textureCanvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.premultiplyAlpha = true
    texture.minFilter = THREE.LinearFilter

    const uniforms = {
      uTex: { value: texture },
      uCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uAspect: { value: 1 },
      uRadius: { value: 0.2 },
      uPresence: { value: 0 },
      uTime: { value: 0 },
      uRing: { value: new THREE.Color('#22b4cf') },
    }
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      premultipliedAlpha: true,
    })
    const geometry = new THREE.PlaneGeometry(2, 2)
    const scene = new THREE.Scene()
    scene.add(new THREE.Mesh(geometry, material))
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

    const logo = new window.Image()
    logo.crossOrigin = 'anonymous'
    let logoLoaded = false

    const paintTexture = () => {
      if (!logoLoaded) return
      const { width, height } = canvas
      if (textureCanvas.width !== width || textureCanvas.height !== height) {
        // WebGL2 textures are immutable in size; drop the GPU copy so three re-allocates it.
        texture.dispose()
        textureCanvas.width = width
        textureCanvas.height = height
      }
      const ctx = textureCanvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, width, height)
      const dw = width * (1 - INSET * 2)
      const dh = dw * (LOGO_H / LOGO_W)
      ctx.drawImage(logo, (width - dw) / 2, (height - dh) / 2, dw, dh)
      texture.needsUpdate = true
    }

    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      if (!width || !height) return
      renderer.setSize(width, height, false)
      uniforms.uAspect.value = width / height
      paintTexture()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)

    logo.onload = () => {
      logoLoaded = true
      resize()
      setReady(true)
    }
    logo.src = LOGO_SRC

    const pointer = { x: 0.5, y: 0.5, inside: false }
    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width
      const y = 1 - (event.clientY - rect.top) / rect.height
      pointer.inside = x > -0.1 && x < 1.1 && y > -0.1 && y < 1.1
      pointer.x = x
      pointer.y = y
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })

    const center = new THREE.Vector2(0.5, 0.55)
    let frame = 0
    let last = performance.now()
    let running = true

    const tick = (now: number) => {
      if (!running) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const t = (uniforms.uTime.value += dt)

      const target = pointer.inside
        ? { x: pointer.x, y: pointer.y, presence: 1 }
        : {
            x: 0.5 + Math.sin(t * 0.35) * 0.26,
            y: 0.52 + Math.sin(t * 0.5 + 1.2) * 0.2,
            presence: 0.85,
          }
      const follow = 1 - Math.exp(-dt * (pointer.inside ? 9 : 2.5))
      center.x += (target.x - center.x) * follow
      center.y += (target.y - center.y) * follow
      uniforms.uCenter.value.copy(center)
      uniforms.uPresence.value += (target.presence - uniforms.uPresence.value) * (1 - Math.exp(-dt * 4))

      renderer.render(scene, camera)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(frame)
      } else if (!running) {
        running = true
        last = performance.now()
        frame = requestAnimationFrame(tick)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      running = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('visibilitychange', onVisibility)
      geometry.dispose()
      material.dispose()
      texture.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="ALURE Design & Acabamentos"
      className={`relative aspect-[932/776] ${className ?? ''}`}
    >
      <Image
        src={LOGO_SRC}
        alt=""
        width={LOGO_W}
        height={LOGO_H}
        priority
        className={`absolute inset-[12%] h-auto w-[76%] transition-opacity duration-300 ${ready ? 'opacity-0' : 'opacity-100'}`}
      />
    </div>
  )
}
