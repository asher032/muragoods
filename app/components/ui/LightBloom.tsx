'use client';

import * as React from 'react';
import { useEffect, useRef } from 'react';

const MAX_DPR = 2;

const VERT_SRC = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  uRes;
uniform float uTime;
uniform int   uStyle;
uniform int   uDirection;
uniform vec3  uBg;
uniform vec3  uBase;
uniform vec3  uAccent;
uniform float uRise;
uniform float uSpread;
uniform float uOriginX;
uniform float uLift;
uniform float uShaftCount;
uniform float uShaftAmount;
uniform float uShaftDrift;
uniform float uGrain;
uniform float uVignette;

float h11(float x) { return fract(sin(x * 127.1) * 43758.5453123); }
float vn1(float x) {
    float i = floor(x);
    float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(h11(i), h11(i + 1.0), f);
}

void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    float aspect = uRes.x / uRes.y;
    float t = uTime;
    float breathe = 1.0 + 0.06 * sin(t * 0.35);
    float depth = mix(0.05, 1.20, uSpread);
    vec2 lp;
    float acrossUv;
    float edgeCoord;
    if (uDirection == 1) { lp = vec2(uOriginX, 1.0 + depth); acrossUv = uv.x; edgeCoord = 1.0 - uv.y; }
    else if (uDirection == 2) { lp = vec2(-depth / aspect, uOriginX); acrossUv = uv.y; edgeCoord = uv.x; }
    else if (uDirection == 3) { lp = vec2(1.0 + depth / aspect, uOriginX); acrossUv = uv.y; edgeCoord = 1.0 - uv.x; }
    else { lp = vec2(uOriginX, -depth); acrossUv = uv.x; edgeCoord = uv.y; }
    vec2 q = vec2((uv.x - lp.x) * aspect, uv.y - lp.y);
    float d = length(q);
    float k = mix(9.0, 1.4, uRise) / breathe;
    float g = exp(-d * k) / max(exp(-depth * k), 1e-4);
    g = clamp(g, 0.0, 1.0);
    if (uStyle == 1) {
        float sx = acrossUv * uShaftCount;
        float dr = t * uShaftDrift;
        float s = vn1(sx + dr) * 0.6 + vn1(sx * 2.17 - dr * 0.8) * 0.4;
        float mask = smoothstep(0.0, 0.35, edgeCoord);
        g *= mix(1.0, 0.45 + 1.25 * s, uShaftAmount * mask);
    }
    g = clamp(g * (1.0 + uLift * 0.25), 0.0, 1.0);
    vec3 col = mix(uBg, uBase, smoothstep(0.0, 0.68, g));
    col = mix(col, uAccent, smoothstep(0.58, 0.99, g));
    vec2 vc = uv - 0.5;
    vc.x *= aspect;
    col *= 1.0 - uVignette * smoothstep(0.35, 0.95, length(vc));
    float rnd = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (rnd - 0.5) * (uGrain * 0.06 + 1.5 / 255.0);
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

function parseColor(input: string | undefined, fb: [number, number, number]): [number, number, number] {
    if (!input) return fb;
    const str = String(input).trim();
    if (str.charAt(0) === '#') {
        let hex = str.slice(1);
        if (hex.length === 3 || hex.length === 4) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        if (hex.length >= 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r / 255, g / 255, b / 255];
        }
        return fb;
    }
    const m = str.match(/[\d.]+/g);
    if (m && m.length >= 3) return [Math.min(255, parseFloat(m[0])) / 255, Math.min(255, parseFloat(m[1])) / 255, Math.min(255, parseFloat(m[2])) / 255];
    return fb;
}

function num(v: unknown, fb: number): number {
    return typeof v === 'number' && isFinite(v) ? v : fb;
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('LightBloom shader:', gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
    }
    return sh;
}

type Props = {
    style?: React.CSSProperties;
    variant?: 'bloom' | 'shafts';
    direction?: 'bottom' | 'top' | 'left' | 'right';
    background?: string;
    baseColor?: string;
    accentColor?: string;
    speed?: number;
    hover?: number;
    light?: { rise?: number; spread?: number };
    shafts?: { count?: number; amount?: number; drift?: number };
    finish?: { grain?: number; vignette?: number };
    width?: number;
    height?: number;
};

const D_LIGHT = { rise: 79, spread: 72 };
const D_SHAFTS = { count: 17, amount: 70, drift: 79 };
const D_FINISH = { grain: 12, vignette: 25 };

export default function LightBloom(props: Props) {
    const {
        style,
        variant = 'shafts',
        direction = 'bottom',
        background = '#0a0a18',
        baseColor = '#ffd60a',
        accentColor = '#ffe066',
        speed = 100,
        hover = 114,
        light,
        shafts,
        finish,
        width,
        height,
    } = props;

    const L = { ...D_LIGHT, ...(light ?? {}) };
    const S = { ...D_SHAFTS, ...(shafts ?? {}) };
    const F = { ...D_FINISH, ...(finish ?? {}) };
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sizeRef = useRef({ w: 0, h: 0 });
    sizeRef.current = { w: num(width, 0), h: num(height, 0) };

    const vRef = useRef({
        style: 0, direction: 0,
        bg: [0, 0, 0] as [number, number, number],
        base: [0, 0, 0] as [number, number, number],
        accent: [0, 0, 0] as [number, number, number],
        rise: 0.55, spread: 0.6, speed: 1, hover: 1,
        count: 9, amount: 0.55, drift: 0.4, grain: 0.12, vignette: 0.25,
    });
    vRef.current = {
        style: variant === 'shafts' ? 1 : 0,
        direction: direction === 'top' ? 1 : direction === 'left' ? 2 : direction === 'right' ? 3 : 0,
        bg: parseColor(background, [0.04, 0.04, 0.09]),
        base: parseColor(baseColor, [1, 0.84, 0.04]),
        accent: parseColor(accentColor, [1, 0.88, 0.4]),
        rise: num(L.rise, 79) / 100,
        spread: num(L.spread, 72) / 100,
        speed: num(speed, 50) / 50,
        hover: num(hover, 100) / 100,
        count: Math.max(1, num(S.count, 17)),
        amount: num(S.amount, 70) / 100,
        drift: num(S.drift, 79) / 100,
        grain: num(F.grain, 12) / 100,
        vignette: num(F.vignette, 25) / 100,
    };

    const ptrRef = useRef({ x: 0.5, target: 0.5, on: 0, onTarget: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
        if (!gl) { console.error('LightBloom: WebGL unavailable'); return; }

        const vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
        const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
        if (!vs || !fs) return;
        const prog = gl.createProgram();
        if (!prog) return;
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error('LightBloom link:', gl.getProgramInfoLog(prog)); return; }
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const posLoc = gl.getAttribLocation(prog, 'a_pos');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        const u: Record<string, WebGLUniformLocation | null> = {};
        ['res', 'time', 'style', 'direction', 'bg', 'base', 'accent', 'rise', 'spread', 'originX', 'lift', 'count', 'amount', 'drift', 'grain', 'vignette'].forEach(name => {
            u[name] = gl.getUniformLocation(prog, `u${name.charAt(0).toUpperCase() + name.slice(1)}`);
        });

        let raf = 0;
        let last = performance.now();
        let clock = 0;

        const render = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000);
            last = now;
            const v = vRef.current;
            clock = (clock + dt * v.speed) % 3600;
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
            const cw = sizeRef.current.w || canvas.clientWidth || 1200;
            const ch = sizeRef.current.h || canvas.clientHeight || 800;
            const bw = Math.max(1, Math.round(cw * dpr));
            const bh = Math.max(1, Math.round(ch * dpr));
            if (canvas.width !== bw || canvas.height !== bh) {
                canvas.width = bw;
                canvas.height = bh;
                gl.viewport(0, 0, bw, bh);
            }
            const p = ptrRef.current;
            const kx = 1 - Math.exp(-8 * dt);
            const ko = 1 - Math.exp(-5 * dt);
            p.x += (p.target - p.x) * kx;
            p.on += (p.onTarget - p.on) * ko;
            const travel = Math.min(1, v.hover);
            const originX = 0.5 + (p.x - 0.5) * travel * p.on;

            gl.uniform2f(u.res, bw, bh);
            gl.uniform1f(u.time, clock);
            gl.uniform1i(u.style, v.style);
            gl.uniform1i(u.direction, v.direction);
            gl.uniform3f(u.bg, v.bg[0], v.bg[1], v.bg[2]);
            gl.uniform3f(u.base, v.base[0], v.base[1], v.base[2]);
            gl.uniform3f(u.accent, v.accent[0], v.accent[1], v.accent[2]);
            gl.uniform1f(u.rise, v.rise);
            gl.uniform1f(u.spread, v.spread);
            gl.uniform1f(u.originX, originX);
            gl.uniform1f(u.lift, v.hover * p.on);
            gl.uniform1f(u.count, v.count);
            gl.uniform1f(u.amount, v.amount);
            gl.uniform1f(u.drift, v.drift);
            gl.uniform1f(u.grain, v.grain);
            gl.uniform1f(u.vignette, v.vignette);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            raf = requestAnimationFrame(render);
        };

        const onMove = (e: PointerEvent) => {
            const r = canvas.getBoundingClientRect();
            if (vRef.current.direction === 2 || vRef.current.direction === 3) {
                const h = canvas.offsetHeight || 1;
                const scale = r.height > 0 ? h / r.height : 1;
                ptrRef.current.target = Math.max(0, Math.min(1, 1 - ((e.clientY - r.top) * scale) / h));
            } else {
                const w = canvas.offsetWidth || 1;
                const scale = r.width > 0 ? w / r.width : 1;
                ptrRef.current.target = Math.max(0, Math.min(1, ((e.clientX - r.left) * scale) / w));
            }
        };
        const onEnter = () => { ptrRef.current.onTarget = 1; };
        const onLeave = () => { ptrRef.current.onTarget = 0; };

        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerenter', onEnter);
        canvas.addEventListener('pointerleave', onLeave);
        raf = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(raf);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerenter', onEnter);
            canvas.removeEventListener('pointerleave', onLeave);
        };
    }, []);

    return (
        <div style={{
            position: 'relative', overflow: 'hidden', background,
            minWidth: 1200, minHeight: 800,
            width: typeof width === 'number' && width > 0 ? width : '100%',
            height: typeof height === 'number' && height > 0 ? height : '100%',
            ...style,
        }}>
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
        </div>
    );
}
