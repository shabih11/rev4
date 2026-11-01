import { useEffect, useRef } from 'react';

const colors = ['#e45187', '#25bfa7', '#e8b848', '#8c74d4', '#4fa5d3', '#ed9162'];

export function ConfettiBurst() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    if (!node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = node.getContext('2d');
    if (!context) return;
    let width = 0, height = 0, pixelRatio = 1, frame = 0;
    const resize = () => {
      const box = node.getBoundingClientRect();
      width = box.width; height = box.height;
      pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      node.width = Math.round(width * pixelRatio); node.height = Math.round(height * pixelRatio);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    const pieces = Array.from({ length: width < 640 ? 100 : 160 }, (_, index) => {
      const side = index % 2 === 0 ? 1 : -1;
      return {
        origin: side === 1 ? 0.16 : 0.84,
        jitter: (Math.random() - 0.5) * 0.018,
        speedX: side * (0.3 + Math.random() * 0.52),
        speedY: -(2.4 + Math.random() * 0.8),
        drag: 0.65 + Math.random() * 0.7,
        delay: Math.random() * 0.035,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 18,
        flutter: 9 + Math.random() * 12,
        phase: Math.random() * Math.PI * 2,
        width: 3 + Math.random() * 4,
        height: 5 + Math.random() * 7,
        ribbon: index % 7 === 0,
        color: colors[index % colors.length],
      };
    });
    const startedAt = performance.now();
    const draw = (now: number) => {
      const elapsed = (now - startedAt) / 1000;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      if (elapsed >= 1.25) return;
      const fade = Math.min(1, Math.max(0, (1.25 - elapsed) / 0.25));
      for (const piece of pieces) {
        const t = elapsed - piece.delay;
        if (t < 0) continue;
        // Air resistance slows the sideways burst; gravity makes a smooth arc.
        const travel = (1 - Math.exp(-piece.drag * t)) / piece.drag;
        const x = width * (piece.origin + piece.jitter + piece.speedX * travel) + Math.sin(piece.phase + t * 8) * t * 12;
        const y = height * (0.76 + piece.speedY * t + 2.8 * t * t);
        if (x < -25 || x > width + 25 || y > height + 25) continue;
        context.save();
        context.translate(x, y);
        context.rotate(piece.angle + piece.spin * t);
        context.scale(Math.cos(piece.phase + piece.flutter * t), 0.7 + Math.abs(Math.sin(piece.phase + t * 5)) * 0.3);
        context.globalAlpha = fade * Math.min(1, t / 0.025);
        context.fillStyle = piece.color;
        if (piece.ribbon) {
          context.strokeStyle = piece.color; context.lineWidth = piece.width * 0.6;
          context.beginPath(); context.moveTo(0, -piece.height);
          context.quadraticCurveTo(Math.sin(t * 12 + piece.phase) * 7, 0, 0, piece.height);
          context.stroke();
        } else {
          context.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
        }
        context.restore();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);
  return <canvas ref={canvas} className="results-confetti" aria-hidden="true" />;
}
