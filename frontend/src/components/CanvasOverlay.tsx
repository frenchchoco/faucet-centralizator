import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

/* ── Key sequence ────────────────────────────────────────── */
const SEQ = [
    'arrowup', 'arrowup', 'arrowdown', 'arrowdown',
    'arrowleft', 'arrowright', 'arrowleft', 'arrowright',
    'b', 'a',
];

/* ── Canvas animation ────────────────────────────────────── */
const CHARS = '₿01サトシBTCOPNET⚡₿☰◊⬡⟠'.split('');

interface Drop {
    x: number;
    y: number;
    speed: number;
    chars: string[];
    length: number;
    opacity: number;
}

function createDrop(x: number, h: number): Drop {
    const length = 8 + Math.floor(Math.random() * 18);
    return {
        x,
        y: -Math.random() * h,
        speed: 2 + Math.random() * 5,
        chars: Array.from({ length }, () => CHARS[Math.floor(Math.random() * CHARS.length)]),
        length,
        opacity: 0.3 + Math.random() * 0.7,
    };
}

function renderRain(canvas: HTMLCanvasElement, drops: Drop[], startTime: number, cssW: number, cssH: number): boolean {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const W = cssW;
    const H = cssH;
    const elapsed = Date.now() - startTime;
    const DURATION = 6000;
    const fadeIn = Math.min(1, elapsed / 600);
    const fadeOut = elapsed > DURATION - 1000 ? Math.max(0, (DURATION - elapsed) / 1000) : 1;
    const masterAlpha = fadeIn * fadeOut;

    if (masterAlpha <= 0) return false;

    // Dark overlay
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.85 * masterAlpha})`;
    ctx.fillRect(0, 0, W, H);

    const fontSize = 16;
    ctx.font = `${fontSize}px 'Courier New', monospace`;

    for (const drop of drops) {
        drop.y += drop.speed;
        if (drop.y > H + drop.length * fontSize) {
            drop.y = -drop.length * fontSize;
            drop.speed = 2 + Math.random() * 5;
        }

        for (let i = 0; i < drop.chars.length; i++) {
            const charY = drop.y + i * fontSize;
            if (charY < -fontSize || charY > H + fontSize) continue;

            // Head char is bright, tail fades
            const charFade = 1 - i / drop.chars.length;
            const isHead = i === 0;

            if (isHead) {
                ctx.fillStyle = `rgba(255, 255, 255, ${drop.opacity * masterAlpha})`;
                ctx.shadowColor = '#ff9500';
                ctx.shadowBlur = 12;
            } else {
                const r = Math.floor(255 * charFade);
                const g = Math.floor(149 * charFade);
                ctx.fillStyle = `rgba(${r}, ${g}, 0, ${charFade * drop.opacity * masterAlpha})`;
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
            }

            // Randomly mutate chars
            if (Math.random() < 0.02) {
                drop.chars[i] = CHARS[Math.floor(Math.random() * CHARS.length)];
            }

            ctx.fillText(drop.chars[i], drop.x, charY);
        }
    }

    ctx.shadowBlur = 0;

    // Center message
    if (elapsed > 800) {
        const msgAlpha = Math.min(1, (elapsed - 800) / 500) * fadeOut;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Glow
        ctx.shadowColor = '#ff9500';
        ctx.shadowBlur = 30;

        ctx.font = 'bold 42px "Fredoka", "Nunito", sans-serif';
        ctx.fillStyle = `rgba(255, 149, 0, ${msgAlpha})`;
        ctx.fillText('SATOSHI MODE', W / 2, H / 2 - 28);

        ctx.shadowBlur = 0;
        ctx.font = '18px "Nunito", sans-serif';
        ctx.fillStyle = `rgba(255, 200, 100, ${msgAlpha * 0.8})`;
        ctx.fillText('₿ Powered by Bitcoin · Built on OPNet ₿', W / 2, H / 2 + 22);

        ctx.font = '13px "Nunito", sans-serif';
        ctx.fillStyle = `rgba(255, 255, 255, ${msgAlpha * 0.4})`;
        ctx.fillText('↑↑↓↓←→←→BA', W / 2, H / 2 + 54);

        ctx.restore();
    }

    return elapsed < DURATION;
}

/* ── Overlay ─────────────────────────────────────────────── */
export function CanvasOverlay(): React.JSX.Element | null {
    const [active, setActive] = useState(false);
    const bufferRef = useRef<string[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dropsRef = useRef<Drop[]>([]);
    const startRef = useRef(0);

    /* Keyboard sequence */
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        const buf = bufferRef.current;
        buf.push(e.key.toLowerCase());
        if (buf.length > SEQ.length) buf.shift();

        if (buf.length === SEQ.length && buf.every((k, i) => k === SEQ[i])) {
            buf.length = 0;
            setActive(true);
        }
    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    /* Mobile: 5 rapid taps on footer */
    const tapTimesRef = useRef<number[]>([]);
    useEffect(() => {
        const TAP_COUNT = 5;
        const TAP_WINDOW = 2000; // ms

        function handleTap(e: Event) {
            const target = e.target as HTMLElement;
            if (!target.closest('.site-footer')) return;

            const now = Date.now();
            const taps = tapTimesRef.current;
            taps.push(now);

            // Keep only taps within the window
            while (taps.length > 0 && now - taps[0] > TAP_WINDOW) taps.shift();

            if (taps.length >= TAP_COUNT) {
                taps.length = 0;
                setActive(true);
            }
        }

        window.addEventListener('click', handleTap);
        return () => window.removeEventListener('click', handleTap);
    }, []);

    /* Run animation */
    useEffect(() => {
        if (!active) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const dpr = window.devicePixelRatio || 1;
        const W = window.innerWidth;
        const H = window.innerHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);

        // Create drops
        const colWidth = 20;
        const cols = Math.ceil(W / colWidth);
        dropsRef.current = Array.from({ length: cols }, (_, i) => createDrop(i * colWidth, H));
        startRef.current = Date.now();

        let animId: number;
        function loop() {
            if (!canvas) return;
            const running = renderRain(canvas, dropsRef.current, startRef.current, W, H);
            if (running) {
                animId = requestAnimationFrame(loop);
            } else {
                setActive(false);
            }
        }
        animId = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(animId);
    }, [active]);

    if (!active) return null;

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                pointerEvents: 'none',
            }}
        />
    );
}
