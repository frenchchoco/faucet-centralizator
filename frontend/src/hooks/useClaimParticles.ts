import { useCallback, useRef } from 'react';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    color: string;
    rotation: number;
    rotationSpeed: number;
    shape: 'circle' | 'star' | 'diamond';
}

const COLORS = [
    '#00f0ff', // cyan
    '#ff2daa', // pink
    '#b94dff', // purple
    '#39ff14', // green
    '#ffe600', // yellow
    '#ff6a00', // orange
    '#ffffff', // white
];

const SHAPES: Particle['shape'][] = ['circle', 'star', 'diamond'];

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
        const method = i === 0 ? 'moveTo' : 'lineTo';
        ctx[method](cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
    ctx.closePath();
    ctx.fill();
}

function drawDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.6, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.6, cy);
    ctx.closePath();
    ctx.fill();
}

/**
 * Canvas-based particle explosion triggered on claim success.
 * Returns a ref to attach to a container and a `burst()` function.
 */
export function useClaimParticles() {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const burst = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        // Create or reuse canvas
        let canvas = canvasRef.current;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:50;border-radius:inherit;';
            canvasRef.current = canvas;
        }
        container.appendChild(canvas);

        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(dpr, dpr);

        const W = rect.width;
        const H = rect.height;

        // Spawn particles from the center-bottom (claim button area)
        const originX = W / 2;
        const originY = H * 0.85;
        const PARTICLE_COUNT = 60;

        const particles: Particle[] = [];
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const angle = (Math.random() * Math.PI * 2);
            const speed = 2 + Math.random() * 6;
            particles.push({
                x: originX + (Math.random() - 0.5) * 30,
                y: originY + (Math.random() - 0.5) * 10,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 3, // slight upward bias
                life: 1,
                maxLife: 0.6 + Math.random() * 0.8,
                size: 2 + Math.random() * 5,
                color: COLORS[Math.floor(Math.random() * COLORS.length)],
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.3,
                shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
            });
        }

        const GRAVITY = 0.12;
        const FRICTION = 0.98;
        let startTime: number | null = null;
        const DURATION = 1800; // ms

        function animate(timestamp: number) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;

            if (!ctx || !canvas) return;
            ctx.clearRect(0, 0, W, H);

            let anyAlive = false;

            for (const p of particles) {
                if (p.life <= 0) continue;
                anyAlive = true;

                // Physics
                p.vy += GRAVITY;
                p.vx *= FRICTION;
                p.vy *= FRICTION;
                p.x += p.vx;
                p.y += p.vy;
                p.rotation += p.rotationSpeed;

                // Fade
                const timeFactor = Math.max(0, 1 - elapsed / DURATION);
                p.life = timeFactor;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rotation);
                ctx.globalAlpha = p.life * 0.9;
                ctx.fillStyle = p.color;

                // Glow
                ctx.shadowColor = p.color;
                ctx.shadowBlur = p.size * 2;

                if (p.shape === 'circle') {
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                    ctx.fill();
                } else if (p.shape === 'star') {
                    drawStar(ctx, 0, 0, p.size);
                } else {
                    drawDiamond(ctx, 0, 0, p.size);
                }

                ctx.restore();
            }

            if (anyAlive && elapsed < DURATION) {
                requestAnimationFrame(animate);
            } else {
                // Cleanup
                ctx.clearRect(0, 0, W, H);
                canvas.remove();
            }
        }

        requestAnimationFrame(animate);
    }, []);

    return { containerRef, burst };
}
