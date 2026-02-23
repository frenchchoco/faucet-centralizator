import { useCallback, useRef } from 'react';

const MAX_TILT = 12; // degrees
const SCALE_HOVER = 1.04;
const TRANSITION_OUT = 'transform 0.6s cubic-bezier(0.22,0.61,0.36,1), box-shadow 0.6s ease';

/**
 * Holographic 3D card tilt — follows mouse, applies perspective rotation
 * and moves a prismatic light overlay. Returns refs + event handlers.
 */
export function useHoloTilt() {
    const cardRef = useRef<HTMLDivElement>(null);
    const glareRef = useRef<HTMLDivElement>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const card = cardRef.current;
        const glare = glareRef.current;
        if (!card) return;

        const rect = card.getBoundingClientRect();
        // Normalised -0.5 → 0.5
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top) / rect.height - 0.5;

        const rotateY = nx * MAX_TILT * 2;   // horizontal → rotate around Y
        const rotateX = -ny * MAX_TILT * 2;  // vertical → rotate around X

        card.style.transition = 'none';
        card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${SCALE_HOVER},${SCALE_HOVER},${SCALE_HOVER})`;

        if (glare) {
            const glareX = (nx + 0.5) * 100;
            const glareY = (ny + 0.5) * 100;
            glare.style.opacity = '1';
            glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.22) 0%, rgba(0,240,255,0.08) 30%, rgba(255,45,170,0.06) 60%, transparent 80%)`;
        }
    }, []);

    const handleMouseLeave = useCallback(() => {
        const card = cardRef.current;
        const glare = glareRef.current;
        if (!card) return;

        card.style.transition = TRANSITION_OUT;
        card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';

        if (glare) {
            glare.style.opacity = '0';
        }
    }, []);

    return { cardRef, glareRef, handleMouseMove, handleMouseLeave };
}
