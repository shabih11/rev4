import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import { AvatarImage } from './AvatarImage';

type View = { zoom: number; x: number; y: number };
export function AvatarPreview({ path, name, onClose }: { path: string | null; name: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const swipe = useRef<{ x: number; y: number; multiple: boolean } | null>(null);
  const current = useRef<View>({ zoom: 1, x: 0, y: 0 });
  const [view, setView] = useState(current.current);
  function update(next: View) {
    const box = viewport.current?.getBoundingClientRect();
    const zoom = Math.max(1, Math.min(4, next.zoom));
    const maxX = (box?.width || 0) * (zoom - 1) / 2;
    const maxY = (box?.height || 0) * (zoom - 1) / 2;
    current.current = { zoom, x: Math.max(-maxX, Math.min(maxX, next.x)), y: Math.max(-maxY, Math.min(maxY, next.y)) };
    setView(current.current);
  }
  function zoomAt(zoom: number, clientX?: number, clientY?: number) {
    const box = viewport.current?.getBoundingClientRect();
    if (!box) return;
    const previous = current.current;
    const next = Math.max(1, Math.min(4, zoom));
    const x = clientX === undefined ? 0 : clientX - box.left - box.width / 2;
    const y = clientY === undefined ? 0 : clientY - box.top - box.height / 2;
    update({ zoom: next, x: x - (x - previous.x) * next / previous.zoom, y: y - (y - previous.y) * next / previous.zoom });
  }
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = previousOverflow; opener?.focus(); };
  }, []);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(current.current.zoom * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    const resize = () => update(current.current);
    window.addEventListener('resize', resize);
    return () => { element.removeEventListener('wheel', wheel); window.removeEventListener('resize', resize); };
  }, []);
  const control = 'flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-40';
  function removePointer(id: number) { pointers.current.delete(id); if (!pointers.current.size) swipe.current = null; }
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="avatar-preview-title" className="avatar-preview" dir="rtl">
    <header className="flex shrink-0 items-center justify-between gap-3 bg-white px-4 py-3">
      <h3 id="avatar-preview-title" className="min-w-0 truncate text-base font-bold text-slate-900">{name}</h3>
      <button type="button" aria-label="إغلاق الصورة" onClick={onClose} className={control}><X size={22} /></button>
    </header>
    <div ref={viewport} className="avatar-preview-viewport relative min-h-0 flex-1 overflow-hidden bg-white" dir="ltr" style={{ touchAction: 'none', cursor: view.zoom > 1 ? 'grab' : 'zoom-in' }}
      onDoubleClick={event => zoomAt(current.current.zoom > 1 ? 1 : 2.5, event.clientX, event.clientY)}
      onPointerDown={event => {
        if (event.button !== 0) return;
        if (!pointers.current.size) swipe.current = event.pointerType === 'touch' && current.current.zoom === 1 ? { x: event.clientX, y: event.clientY, multiple: false } : null;
        else if (swipe.current) swipe.current.multiple = true;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const previous = pointers.current.get(event.pointerId);
        if (!previous) return;
        const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
        if (other) {
          const before = Math.hypot(previous.x - other.x, previous.y - other.y);
          const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
          if (before > 0) {
            zoomAt(current.current.zoom * after / before, (previous.x + other.x) / 2, (previous.y + other.y) / 2);
            update({ ...current.current, x: current.current.x + (event.clientX - previous.x) / 2, y: current.current.y + (event.clientY - previous.y) / 2 });
          }
        } else if (current.current.zoom > 1) update({ ...current.current, x: current.current.x + event.clientX - previous.x, y: current.current.y + event.clientY - previous.y });
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }}
      onPointerUp={event => {
        const start = swipe.current;
        const down = start ? event.clientY - start.y : 0;
        if (current.current.zoom === 1 && start && !start.multiple && pointers.current.size === 1 && down >= 90 && down > Math.abs(event.clientX - start.x) * 1.4) onClose();
        removePointer(event.pointerId);
      }}
      onPointerCancel={event => removePointer(event.pointerId)}
      onLostPointerCapture={event => removePointer(event.pointerId)}>
      <div className="avatar-preview-image absolute inset-0 select-none pointer-events-none" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transformOrigin: 'center' }}>
        <AvatarImage path={path} alt={name} className="h-full w-full object-contain" />
      </div>
    </div>
    <footer className="flex shrink-0 items-center justify-center gap-3 bg-white px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]" dir="ltr">
      <button type="button" aria-label="تصغير الصورة" disabled={view.zoom <= 1} onClick={() => zoomAt(current.current.zoom - 0.5)} className={control}><Minus size={20}/></button>
      <output className="w-14 text-center text-sm tabular-nums text-slate-600" aria-live="polite">{Math.round(view.zoom * 100)}%</output>
      <button type="button" aria-label="تكبير الصورة" disabled={view.zoom >= 4} onClick={() => zoomAt(current.current.zoom + 0.5)} className={control}><Plus size={20}/></button>
      <button type="button" aria-label="إظهار الأفتار كاملًا" onClick={() => update({ zoom: 1, x: 0, y: 0 })} className={control}><RotateCcw size={19}/></button>
    </footer>
  </dialog>;
}
