// Lenticular Duo — Originkit

"use client"

import * as React from "react"
import { useEffect, useRef } from "react"
import type { CSSProperties } from "react"

interface LightGroup {
    lightColor?: string
    intensity?: number
}

interface IntroGroup {
    angle?: number
    duration?: number
}

interface ImageSlot {
    image?: unknown

    fit?: Fit

    offsetX?: number
    offsetY?: number
}

export interface LenticularDuoProps {
    background?: string
    slotA?: ImageSlot
    slotB?: ImageSlot
    itemWidth?: number
    itemHeight?: number
    density?: number
    ridge?: number
    perspective?: number
    distance?: number
    light?: LightGroup
    intro?: IntroGroup
    style?: CSSProperties
}

type Vec3 = [number, number, number]

type Fit = "cover" | "contain"

const NEAR = 0.1
const FAR = 100

const MAX_DPR = 2

const MAX_DT = 0.05

const MAX_SAMPLES = 400

const ORBIT_GAIN = 0.005

const HOVER_YAW = 0.42
const HOVER_PITCH = 0.08

const FILL_OVERSCAN = 1.2


const PITCH_LIMIT = (89 * Math.PI) / 180

const PLACEHOLDER_PIXEL = new Uint8Array([128, 128, 128, 255])

const DEFAULT_IMAGE_A =
    "https://images.unsplash.com/photo-1738602869350-9bb4f946a056?q=80&w=1287&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
const DEFAULT_IMAGE_B =
    "https://images.unsplash.com/photo-1540278197259-5bf4fd02f5cc?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1yZWxhdGVkfDE4fHx8ZW58MHx8fHx8"

const DEFAULT_OFFSET_X = 0
const DEFAULT_OFFSET_Y = 0
const DEFAULT_FIT: Fit = "cover"

const DEFAULT_LIGHT: Required<LightGroup> = {
    lightColor: "#8C8C8C",
    intensity: 204,
}

const DEFAULT_INTRO: Required<IntroGroup> = {
    angle: 35,
    duration: 1000,
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v
}

function srcOf(v: unknown): string | null {
    if (!v) return null

    if (typeof v === "string") {
        const src = v.trim()
        return src || null
    }

    if (typeof v !== "object") return null

    const value = v as {
        src?: unknown
        srcSet?: unknown
    }

    if (typeof value.src === "string" && value.src.trim()) {
        return value.src.trim()
    }

    if (typeof value.srcSet === "string") {
        const first = value.srcSet.split(",")[0]?.trim().split(/\s+/)[0]
        if (first) return first
    }

    if (Array.isArray(value.srcSet)) {
        for (const item of value.srcSet) {
            if (typeof item === "string" && item.trim()) return item.trim()
            if (
                item &&
                typeof item === "object" &&
                typeof (item as { url?: unknown }).url === "string"
            ) {
                const url = (item as { url: string }).url.trim()
                if (url) return url
            }
        }
    }

    return null
}

function parseColor(input: string | undefined, fallback: Vec3): Vec3 {
    if (!input) return fallback
    const s = input.trim()
    if (s[0] === "#") {
        const hex = s.slice(1)
        const short = hex.length === 3 || hex.length === 4
        const long = hex.length === 6 || hex.length === 8
        if (!short && !long) return fallback
        const grab = (i: number) =>
            short
                ? parseInt(hex[i] + hex[i], 16)
                : parseInt(hex.slice(i * 2, i * 2 + 2), 16)
        const r = grab(0)
        const g = grab(1)
        const b = grab(2)
        if ([r, g, b].some(Number.isNaN)) return fallback
        return [r / 255, g / 255, b / 255]
    }
    const m = s.match(/rgba?\(([^)]+)\)/i)
    if (m) {
        const p = m[1].split(/[,/\s]+/).map((v) => parseFloat(v))
        if (p.length >= 3 && p.slice(0, 3).every((v) => !Number.isNaN(v))) {
            return [p[0] / 255, p[1] / 255, p[2] / 255]
        }
    }
    return fallback
}

export function fitRegion(
    imageAspect: number,
    sheetAspect: number,
    fit: Fit
): [number, number] {
    if (!(imageAspect > 0) || !(sheetAspect > 0)) return [1, 1]
    const ratio = imageAspect / sheetAspect
    return fit === "contain"
        ? [Math.max(1, 1 / ratio), Math.max(1, ratio)]
        : [Math.min(1, 1 / ratio), Math.min(1, ratio)]
}

export function panFromPercent(percent: number, region: number): number {
    const r = Math.max(1e-6, region)
    return (clamp(percent, -100, 100) / 100) * ((1 - r) / (2 * r))
}

export function introAt(t: number, angleRad: number, dur: number): [number, number] {
    const span = dur * 3

    if (!(t > 0)) return [0, 0]
    if (t >= span * 2) return [0, 0]
    const f = t <= span ? t : span * 2 - t

    const k = angleRad
    const keys: [number, number][] = [
        [0, 0],
        [-k / 2, k],
        [-k / 2, -k],
        [0, 0],
    ]

    const seg = Math.min(2, Math.floor(f / dur))
    const x = clamp((f - seg * dur) / dur, 0, 1)
    const e = 1 - (1 - x) * (1 - x)

    const a = keys[seg]
    const b = keys[seg + 1]
    return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e]
}

function perspective(fovDeg: number, aspect: number): Float32Array {
    const f = 1 / Math.tan((fovDeg * Math.PI) / 360)
    const nf = 1 / (NEAR - FAR)
    const m = new Float32Array(16)
    m[0] = f / aspect
    m[5] = f
    m[10] = (FAR + NEAR) * nf
    m[11] = -1
    m[14] = 2 * FAR * NEAR * nf
    return m
}

function lookAt(eye: Vec3, center: Vec3, up: Vec3): Float32Array {
    let zx = eye[0] - center[0]
    let zy = eye[1] - center[1]
    let zz = eye[2] - center[2]
    let len = Math.hypot(zx, zy, zz) || 1
    zx /= len
    zy /= len
    zz /= len

    let xx = up[1] * zz - up[2] * zy
    let xy = up[2] * zx - up[0] * zz
    let xz = up[0] * zy - up[1] * zx
    len = Math.hypot(xx, xy, xz) || 1
    xx /= len
    xy /= len
    xz /= len

    const yx = zy * xz - zz * xy
    const yy = zz * xx - zx * xz
    const yz = zx * xy - zy * xx

    const m = new Float32Array(16)
    m[0] = xx
    m[1] = yx
    m[2] = zx
    m[4] = xy
    m[5] = yy
    m[6] = zy
    m[8] = xz
    m[9] = yz
    m[10] = zz
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2])
    m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2])
    m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2])
    m[15] = 1
    return m
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
    const o = new Float32Array(16)
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            o[c * 4 + r] =
                a[r] * b[c * 4] +
                a[4 + r] * b[c * 4 + 1] +
                a[8 + r] * b[c * 4 + 2] +
                a[12 + r] * b[c * 4 + 3]
        }
    }
    return o
}

function modelMatrix(rx: number, ry: number): Float32Array {
    const a = Math.cos(rx)
    const b = Math.sin(rx)
    const c = Math.cos(ry)
    const d = Math.sin(ry)
    const m = new Float32Array(16)

    m[0] = c
    m[1] = b * d
    m[2] = -a * d
    m[4] = 0
    m[5] = a
    m[6] = b
    m[8] = d
    m[9] = -b * c
    m[10] = a * c
    m[15] = 1
    return m
}

export function buildMesh(
    parity: number,
    sw: number,
    sh: number
): { uv: Float32Array; flag: Float32Array; count: number } {
    const quadsX = Math.max(0, Math.ceil((sw - 1 - parity) / 2))
    const count = quadsX * (sh - 1) * 6
    const uv = new Float32Array(count * 2)
    const flag = new Float32Array(count)

    let n = 0
    const put = (i: number, j: number) => {
        uv[n * 2] = j / (sw - 1)
        uv[n * 2 + 1] = i / (sh - 1)

        flag[n] = (i + 1) % 2 === 1 && j % 2 === 1 ? 1 : 0
        n++
    }

    for (let i = 0; i < sh - 1; i++) {
        for (let j = parity; j < sw - 1; j += 2) {
            put(i, j)
            put(i, j + 1)
            put(i + 1, j)
            put(i, j + 1)
            put(i + 1, j + 1)
            put(i + 1, j)
        }
    }

    return { uv, flag, count: n }
}

const VERT = `#version 300 es
precision highp float;

in vec2 aUv;
in float aFlag;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;
uniform float uWidth;
uniform float uHeight;
uniform float uRidge;

out vec2 vUv;
out vec3 vWorld;

void main() {
    vec3 local = vec3(
        (aUv.x - 0.5) * uWidth,
        (aUv.y - 0.5) * uHeight,
        (aFlag - 0.5) * uRidge
    );
    vec4 world = uModel * vec4(local, 1.0);
    vWorld = world.xyz;
    vUv = aUv;
    gl_Position = uProjection * uView * world;
}
`

const FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
in vec3 vWorld;

uniform sampler2D uMap;
uniform vec3 uEye;
uniform vec3 uLightA;
uniform vec3 uLightB;
uniform vec3 uLightColor;
uniform float uIntensity;
uniform vec2 uOffset;
uniform vec2 uRegion;
uniform float uContain;

out vec4 fragColor;

void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));

    vec3 v = normalize(uEye - vWorld);
    if (dot(n, v) < 0.0) n = -n;

    float d = max(dot(n, normalize(uLightA - vWorld)), 0.0)
            + max(dot(n, normalize(uLightB - vWorld)), 0.0);

    vec2 uv = vUv - uOffset;
    uv = 0.5 + (uv - 0.5) * uRegion;

    if (uContain > 0.5 &&
        (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)) discard;

    vec3 albedo = texture(uMap, uv).rgb;
    fragColor = vec4(albedo * uLightColor * uIntensity * d, 1.0);
}
`

function __OriginkitBase_LenticularDuo(props: LenticularDuoProps) {
    const {
        background = "#000000",
        slotA,
        slotB,
        itemWidth = 12,
        itemHeight = 10,
        density = 40,
        ridge = 55,
        perspective: fov = 75,
        distance = 10,
        light,
        intro,
        style,
    } = props

    const a: Required<ImageSlot> = {
        image: slotA?.image ?? DEFAULT_IMAGE_A,
        fit: slotA?.fit ?? DEFAULT_FIT,
        offsetX:
            typeof slotA?.offsetX === "number"
                ? slotA.offsetX
                : DEFAULT_OFFSET_X,
        offsetY:
            typeof slotA?.offsetY === "number"
                ? slotA.offsetY
                : DEFAULT_OFFSET_Y,
    }
    const b: Required<ImageSlot> = {
        image: slotB?.image ?? DEFAULT_IMAGE_B,
        fit: slotB?.fit ?? DEFAULT_FIT,
        offsetX:
            typeof slotB?.offsetX === "number"
                ? slotB.offsetX
                : DEFAULT_OFFSET_X,
        offsetY:
            typeof slotB?.offsetY === "number"
                ? slotB.offsetY
                : DEFAULT_OFFSET_Y,
    }

    const lit: Required<LightGroup> = { ...DEFAULT_LIGHT, ...(light ?? {}) }
    const intr: Required<IntroGroup> = { ...DEFAULT_INTRO, ...(intro ?? {}) }

    const rootRef = useRef<HTMLDivElement | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)

    const liveRef = useRef({
        itemWidth,
        itemHeight,
        density,
        ridge,
        fov,
        distance,
        lit,
        intr,
        offsetA: [a.offsetX, a.offsetY] as [number, number],
        offsetB: [b.offsetX, b.offsetY] as [number, number],
        fitA: a.fit,
        fitB: b.fit,
    })
    liveRef.current = {
        itemWidth,
        itemHeight,
        density,
        ridge,
        fov,
        distance,
        lit,
        intr,
        offsetA: [a.offsetX, a.offsetY] as [number, number],
        offsetB: [b.offsetX, b.offsetY] as [number, number],
        fitA: a.fit,
        fitB: b.fit,
    }

    const imagesRef = useRef<{
        a: HTMLImageElement | null
        b: HTMLImageElement | null
        dirty: boolean
    }>({ a: null, b: null, dirty: false })

    const srcA = srcOf(a.image)
    const srcB = srcOf(b.image)

    useEffect(() => {
        let live = true

        imagesRef.current.a = null
        imagesRef.current.b = null
        imagesRef.current.dirty = true

        const load = (src: string | null, slot: "a" | "b") => {
            if (!src) return

            const img = new Image()
            img.crossOrigin = "anonymous"
            img.decoding = "async"
            img.onload = async () => {
                if (!live) return

                try {
                    if (typeof img.decode === "function") {
                        await img.decode()
                    }
                } catch {
                }

                if (!live) return
                imagesRef.current[slot] = img
                imagesRef.current.dirty = true
            }

            img.onerror = () => {
                if (!live) return
                imagesRef.current[slot] = null
                imagesRef.current.dirty = true
                console.warn("LenticularDuo: failed to load image", src)
            }

            img.src = src
        }

        load(srcA, "a")
        load(srcB, "b")

        return () => {
            live = false
        }
    }, [srcA, srcB])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const gl = canvas.getContext("webgl2", {
            alpha: true,
            antialias: true,
            premultipliedAlpha: true,
        })
        if (!gl) return

        const compile = (type: number, src: string) => {
            const sh = gl.createShader(type)
            if (!sh) return null
            gl.shaderSource(sh, src)
            gl.compileShader(sh)
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                console.error("LenticularDuo shader:", gl.getShaderInfoLog(sh))
                gl.deleteShader(sh)
                return null
            }
            return sh
        }

        const vs = compile(gl.VERTEX_SHADER, VERT)
        const fs = compile(gl.FRAGMENT_SHADER, FRAG)
        if (!vs || !fs) return

        const program = gl.createProgram()
        if (!program) return
        gl.attachShader(program, vs)
        gl.attachShader(program, fs)
        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("LenticularDuo link:", gl.getProgramInfoLog(program))
            return
        }
        gl.useProgram(program)

        const U = {
            projection: gl.getUniformLocation(program, "uProjection"),
            view: gl.getUniformLocation(program, "uView"),
            model: gl.getUniformLocation(program, "uModel"),
            width: gl.getUniformLocation(program, "uWidth"),
            height: gl.getUniformLocation(program, "uHeight"),
            ridge: gl.getUniformLocation(program, "uRidge"),
            map: gl.getUniformLocation(program, "uMap"),
            eye: gl.getUniformLocation(program, "uEye"),
            lightA: gl.getUniformLocation(program, "uLightA"),
            lightB: gl.getUniformLocation(program, "uLightB"),
            lightColor: gl.getUniformLocation(program, "uLightColor"),
            intensity: gl.getUniformLocation(program, "uIntensity"),
            offset: gl.getUniformLocation(program, "uOffset"),
            region: gl.getUniformLocation(program, "uRegion"),
            contain: gl.getUniformLocation(program, "uContain"),
        }

        const aUv = gl.getAttribLocation(program, "aUv")
        const aFlag = gl.getAttribLocation(program, "aFlag")

        type Mesh = { vao: WebGLVertexArrayObject | null; uv: WebGLBuffer | null; flag: WebGLBuffer | null; count: number }
        const meshes: Mesh[] = [0, 1].map(() => {
            const vao = gl.createVertexArray()
            gl.bindVertexArray(vao)
            const uv = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, uv)
            gl.enableVertexAttribArray(aUv)
            gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0)
            const flag = gl.createBuffer()
            gl.bindBuffer(gl.ARRAY_BUFFER, flag)
            gl.enableVertexAttribArray(aFlag)
            gl.vertexAttribPointer(aFlag, 1, gl.FLOAT, false, 0, 0)
            return { vao, uv, flag, count: 0 }
        })

        let builtSw = -1
        let builtSh = -1
        const rebuild = (sw: number, sh: number) => {
            for (let k = 0; k < 2; k++) {
                const m = buildMesh(k, sw, sh)
                gl.bindVertexArray(meshes[k].vao)
                gl.bindBuffer(gl.ARRAY_BUFFER, meshes[k].uv)
                gl.bufferData(gl.ARRAY_BUFFER, m.uv, gl.STATIC_DRAW)
                gl.bindBuffer(gl.ARRAY_BUFFER, meshes[k].flag)
                gl.bufferData(gl.ARRAY_BUFFER, m.flag, gl.STATIC_DRAW)
                meshes[k].count = m.count
            }
            builtSw = sw
            builtSh = sh
        }

        const textures = [0, 1].map(() => {
            const tex = gl.createTexture()
            gl.bindTexture(gl.TEXTURE_2D, tex)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, PLACEHOLDER_PIXEL)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
            return tex
        })

        const upload = () => {
            const slots: ("a" | "b")[] = ["a", "b"]

            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
            for (let k = 0; k < 2; k++) {
                const img = imagesRef.current[slots[k]]
                gl.bindTexture(gl.TEXTURE_2D, textures[k])
                if (img) {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
                } else {
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, PLACEHOLDER_PIXEL)
                }
            }
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
            imagesRef.current.dirty = false
        }

        gl.disable(gl.CULL_FACE)
        gl.enable(gl.DEPTH_TEST)
        gl.clearColor(0, 0, 0, 0)

        let cssW = 1
        let cssH = 1
        const resize = () => {
            const w = canvas.clientWidth || 1
            const h = canvas.clientHeight || 1
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
            const bw = Math.max(1, Math.round(w * dpr))
            const bh = Math.max(1, Math.round(h * dpr))
            if (canvas.width !== bw || canvas.height !== bh) {
                canvas.width = bw
                canvas.height = bh
            }
            cssW = w
            cssH = h
            gl.viewport(0, 0, bw, bh)
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(canvas)

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

        let yaw = 0
        let pitch = 0
        let targetYaw = 0
        let targetPitch = 0
        const zoom = 1
        let dragging = false
        let lastX = 0
        let lastY = 0

        const onDown = (e: PointerEvent) => {
            dragging = true
            canvas.style.cursor = "grabbing"
            lastX = e.clientX
            lastY = e.clientY
        }
        const onMove = (e: PointerEvent) => {
            if (dragging) {
                targetYaw -= (e.clientX - lastX) * ORBIT_GAIN
                targetPitch = clamp(
                    targetPitch + (e.clientY - lastY) * ORBIT_GAIN,
                    -PITCH_LIMIT,
                    PITCH_LIMIT
                )
                lastX = e.clientX
                lastY = e.clientY
                return
            }
            if (reducedMotion || e.pointerType !== "mouse") return
            const rect = canvas.getBoundingClientRect()
            const inside =
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom
            if (!inside) {
                targetYaw = 0
                targetPitch = 0
                return
            }
            const nx = (e.clientX - rect.left) / rect.width - 0.5
            const ny = (e.clientY - rect.top) / rect.height - 0.5
            targetYaw = -nx * HOVER_YAW
            targetPitch = ny * HOVER_PITCH
        }
        const onUp = () => {
            if (!dragging) return
            dragging = false
            canvas.style.cursor = "grab"
            targetYaw = 0
            targetPitch = 0
        }
        const onLeave = () => {
            if (dragging) return
            targetYaw = 0
            targetPitch = 0
        }

        canvas.addEventListener("pointerdown", onDown)
        canvas.addEventListener("pointerleave", onLeave)

        window.addEventListener("pointermove", onMove, { passive: true })
        window.addEventListener("pointerup", onUp)
        window.addEventListener("pointercancel", onUp)

        let raf = 0
        let last = performance.now()
        let elapsed = reducedMotion ? Number.POSITIVE_INFINITY : 0

        const tick = (now: number) => {
            const dt = clamp((now - last) / 1000, 0, MAX_DT)
            last = now
            elapsed += dt

            const ease = 1 - Math.exp(-dt * (dragging ? 18 : 5))
            yaw += (targetYaw - yaw) * ease
            pitch += (targetPitch - pitch) * ease

            const L = liveRef.current
            // Sheet is sized to the visible frustum (plus overscan) so it always covers the frame like object-fit: cover.
            const fovRad = (clamp(L.fov, 5, 175) * Math.PI) / 180
            const visibleH = 2 * Math.max(0.1, L.distance) * Math.tan(fovRad / 2) * FILL_OVERSCAN
            const h = Math.max(0.01, visibleH)
            const w = Math.max(0.01, visibleH * (cssW / cssH))
            const sampleDensity = Math.max(4, L.density || 40)
            const sw = clamp(Math.round(w * sampleDensity), 4, MAX_SAMPLES)
            const sh = clamp(Math.round(h * sampleDensity), 4, MAX_SAMPLES)

            if (sw !== builtSw || sh !== builtSh) rebuild(sw, sh)
            if (imagesRef.current.dirty) upload()

            const [rx, ry] = introAt(
                elapsed,
                (L.intr.angle * Math.PI) / 180,
                Math.max(0.001, L.intr.duration / 1000)
            )

            const r = Math.max(0.1, L.distance) * zoom
            const cp = Math.cos(pitch)
            const eye: Vec3 = [
                r * Math.sin(yaw) * cp,
                r * Math.sin(pitch),
                r * Math.cos(yaw) * cp,
            ]

            const proj = perspective(clamp(L.fov, 5, 175), cssW / cssH)
            const view = lookAt(eye, [0, 0, 0], [0, 1, 0])
            const model = modelMatrix(rx, ry)
            const lc = parseColor(L.lit.lightColor, [1, 1, 1])

            gl.useProgram(program)
            gl.uniformMatrix4fv(U.projection, false, proj)
            gl.uniformMatrix4fv(U.view, false, view)
            gl.uniformMatrix4fv(U.model, false, model)
            gl.uniform1f(U.width, w)
            gl.uniform1f(U.height, h)
            gl.uniform1f(U.ridge, (Math.max(0, L.ridge) / 100) * 0.5)
            gl.uniform3f(U.eye, eye[0], eye[1], eye[2])

            gl.uniform3f(U.lightA, -w, 0, 0)
            gl.uniform3f(U.lightB, w, 0, 0)
            gl.uniform3f(U.lightColor, lc[0], lc[1], lc[2])
            gl.uniform1f(U.intensity, Math.max(0, L.lit.intensity) / 100)
            gl.uniform1i(U.map, 0)

            gl.clearDepth(1)
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
            gl.activeTexture(gl.TEXTURE0)
            const offsets = [L.offsetA, L.offsetB]
            const fits: Fit[] = [L.fitA, L.fitB]
            const imgs = [imagesRef.current.a, imagesRef.current.b]
            for (let k = 0; k < 2; k++) {
                if (meshes[k].count === 0) continue

                const fit = fits[k] ?? "cover"
                const img = imgs[k]

                const region = fitRegion(
                    img ? img.naturalWidth / Math.max(1, img.naturalHeight) : 0,
                    w / h,
                    fit
                )

                const off = offsets[k] ?? [0, 0]
                gl.uniform2f(
                    U.offset,
                    fit === "contain" ? 0 : panFromPercent(off[0], region[0]),
                    fit === "contain" ? 0 : panFromPercent(off[1], region[1])
                )
                gl.uniform2f(U.region, region[0], region[1])
                gl.uniform1f(U.contain, fit === "contain" ? 1 : 0)
                gl.bindTexture(gl.TEXTURE_2D, textures[k])
                gl.bindVertexArray(meshes[k].vao)
                gl.drawArrays(gl.TRIANGLES, 0, meshes[k].count)
            }

            raf = requestAnimationFrame(tick)
        }

        const start = () => {
            if (raf) return
            last = performance.now()
            raf = requestAnimationFrame(tick)
        }
        const stop = () => {
            cancelAnimationFrame(raf)
            raf = 0
        }
        const io = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) start()
            else stop()
        })
        io.observe(canvas)
        start()

        return () => {
            stop()
            io.disconnect()
            ro.disconnect()
            canvas.removeEventListener("pointerdown", onDown)
            canvas.removeEventListener("pointerleave", onLeave)
            window.removeEventListener("pointermove", onMove)
            window.removeEventListener("pointerup", onUp)
            window.removeEventListener("pointercancel", onUp)

        }
    }, [])

    return (
        <div
            ref={rootRef}
            style={{
                width: "100%",
                height: "100%",
                position: "relative",
                overflow: "hidden",
                background,
                ...style,
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    display: "block",
                    touchAction: "none",
                    cursor: "grab",
                }}
            />
        </div>
    )
}

export default function LenticularDuo(props: LenticularDuoProps) {
    return <__OriginkitBase_LenticularDuo {...props} />
}
