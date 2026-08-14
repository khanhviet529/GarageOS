'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExperienceSummary } from '@garageos/contracts';
import { browserApiOrigin } from '@/lib/api-client';

/**
 * Hybrid Showroom viewer — P1-LND-012→015 (progressive enhancement).
 *
 * Poster-first: KHÔNG tải manifest/frames trước khi khách kích hoạt. Viewer lỗi
 * thì gallery/hotspot text/CTA/form vẫn dùng được — viewer không bao giờ là
 * nguồn duy nhất của nội dung.
 */

interface ManifestBinding {
  bindingKey: string;
  role: string;
  sceneKey: string | null;
  logicalYaw: number | null;
  qualityTier: string | null;
  accessibleLabel: string | null;
  description: string | null;
  url: string | null;
}

interface ManifestHotspot {
  id: string;
  title: string;
  description: string;
  yawDegrees?: number;
  anchorKeyframes?: { yawDegrees: number; xRatio: number; yRatio: number }[];
}

interface Viewpoint {
  key: string;
  name: string;
  description: string;
  initialYaw?: number;
  initialPitch?: number;
  hotspots: ManifestHotspot[];
}

interface Manifest {
  schemaVersion: number;
  stableKey: string;
  kind: 'EXTERIOR_SPIN' | 'INTERIOR_PANORAMA';
  label: string;
  revision: number;
  contentHash: string;
  posterUrl: string | null;
  config: {
    kind: string;
    startYawDegrees?: number;
    hotspots?: ManifestHotspot[];
    initialViewpointKey?: string;
    viewpoints?: Viewpoint[];
    [key: string]: unknown;
  };
  bindings?: unknown;
}

interface ShowroomProps {
  slug: string;
  experience: ExperienceSummary;
  onActivated?: () => void;
}

export function Showroom({ slug, experience, onActivated }: ShowroomProps): React.ReactElement {
  const [activated, setActivated] = useState(false);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function activate(): Promise<void> {
    setActivated(true);
    try {
      const res = await fetch(
        `${browserApiOrigin()}/api/v1/public/vehicle-products/${encodeURIComponent(slug)}/experiences/${encodeURIComponent(experience.stableKey)}`,
        { headers: { 'x-garageos-original-host': window.location.host } },
      );
      if (!res.ok) {
        setError('Không tải được trải nghiệm 360°. Bạn vẫn có thể xem thư viện ảnh bên trên.');
        return;
      }
      const data = (await res.json()) as Manifest & {
        config: Manifest['config'] & { bindings: ManifestBinding[] };
      };
      setManifest(data);
      onActivated?.();
    } catch {
      setError('Không tải được trải nghiệm 360°. Bạn vẫn có thể xem thư viện ảnh bên dưới.');
    }
  }

  return (
    <section className="showroom" aria-label={`Trải nghiệm: ${experience.label}`}>
      <h2>{experience.label}</h2>
      {!activated && (
        <>
          {experience.posterUrl !== null && (
            <img
              src={experience.posterUrl}
              alt={`Hình đại diện ${experience.label}`}
              width={1280}
              height={720}
              loading="lazy"
            />
          )}
          <div className="viewer-controls">
            <button className="btn" type="button" onClick={() => void activate()}>
              {experience.kind === 'EXTERIOR_SPIN' ? 'Khám phá ngoại thất 360°' : 'Tham quan nội thất'}
            </button>
            <span className="viewer-hint">
              {experience.kind === 'EXTERIOR_SPIN'
                ? 'Kéo chuột hoặc vuốt để xoay xe'
                : 'Kéo chuột hoặc vuốt để nhìn quanh cabin'}
            </span>
          </div>
        </>
      )}

      {activated && manifest === null && error === null && (
        <p className="viewer-hint" role="status">Đang tải trải nghiệm…</p>
      )}

      {error !== null && (
        <p className="viewer-hint" role="alert">{error}</p>
      )}

      {manifest !== null && manifest.kind === 'EXTERIOR_SPIN' && (
        <SpinViewer manifest={manifest} />
      )}
      {manifest !== null && manifest.kind === 'INTERIOR_PANORAMA' && (
        <PanoViewer manifest={manifest} />
      )}
    </section>
  );
}

/* ------------------------------ Spin viewer ------------------------------ */

/** Chọn quality tier theo màn hình (IMM mục 6.2): MOBILE_36 / DESKTOP_72. */
function useQualityTier(): string | null {
  const [tier, setTier] = useState<string | null>(null);
  useEffect(() => {
    const pick = (): void =>
      setTier(window.matchMedia('(min-width: 768px)').matches ? 'DESKTOP_72' : 'MOBILE_36');
    pick();
    const mq = window.matchMedia('(min-width: 768px)');
    mq.addEventListener('change', pick);
    return () => mq.removeEventListener('change', pick);
  }, []);
  return tier;
}

function SpinViewer({ manifest }: { manifest: Manifest }): React.ReactElement {
  const allFrames = ((manifest.config as Manifest['config'] & { bindings?: ManifestBinding[] }).bindings ?? [])
    .filter((b) => b.url !== null)
    .sort((a, b) => (a.logicalYaw ?? 0) - (b.logicalYaw ?? 0));
  const tier = useQualityTier();
  const hotspots: ManifestHotspot[] = manifest.config.hotspots ?? [];
  const [yaw, setYaw] = useState(manifest.config.startYawDegrees ?? 0);
  const dragging = useRef<{ x: number; yaw: number } | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Prefetch mọi frame sau activation (chỉ khi khách đã kích hoạt viewer)
  useEffect(() => {
    for (const f of allFrames) {
      if (f.url !== null) void new Promise<void>((r) => { const i = new Image(); i.onload = () => r(); i.onerror = () => r(); i.src = f.url!; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest.stableKey]);

  // Chọn tier: nếu tier đang chọn không có frame thì lùi về mọi tier
  const tierFrames = allFrames.filter((f) => f.qualityTier === tier);
  const frames = tier !== null && tierFrames.length > 0 ? tierFrames : allFrames;

  if (frames.length === 0) {
    return <p className="viewer-hint">Chưa có khung hình 360° cho trải nghiệm này.</p>;
  }

  const nearest = nearestFrame(frames, yaw);

  function rotate(deg: number): void {
    setYaw((v) => (v + deg + 360) % 360);
  }

  return (
    <div>
      <div
        className="viewer-canvas"
        role="img"
        tabIndex={0}
        aria-label={`Ngoại thất 360° — góc ${Math.round(yaw)} độ. Dùng phím mũi tên trái/phải để xoay.`}
        style={{
          backgroundImage: `url(${nearest.url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
        onPointerDown={(e) => {
          if (reducedMotion) return;
          dragging.current = { x: e.clientX, yaw };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = dragging.current;
          if (d === null) return;
          const delta = e.clientX - d.x;
          setYaw((d.yaw - delta * 0.4 + 360) % 360);
        }}
        onPointerUp={() => { dragging.current = null; }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); rotate(-10); }
          if (e.key === 'ArrowRight') { e.preventDefault(); rotate(10); }
        }}
      />
      <div className="viewer-controls">
        <button type="button" className="btn-secondary btn" onClick={() => rotate(-10)}>◀ 10°</button>
        <button type="button" className="btn-secondary btn" onClick={() => rotate(10)}>10° ▶</button>
        <span className="viewer-hint">{Math.round(yaw)}° / 360° — kéo để xoay, phím mũi tên để quay từng bước</span>
      </div>
      <HotspotList hotspots={hotspots} onGo={(h) => {
        if (h.yawDegrees !== undefined) setYaw(h.yawDegrees);
      }} />
    </div>
  );
}

function nearestFrame(frames: { logicalYaw: number | null; url: string | null }[], yaw: number): { url: string } {
  let best = frames[0]!;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const f of frames) {
    const fy = f.logicalYaw ?? 0;
    const dist = Math.abs(((fy - yaw + 540) % 360) - 180);
    if (dist < bestDist) { bestDist = dist; best = f; }
  }
  return { url: best.url ?? '' };
}

/* ------------------------------ Pano viewer ------------------------------ */

function PanoViewer({ manifest }: { manifest: Manifest }): React.ReactElement {
  const viewpoints: Viewpoint[] = manifest.config.viewpoints ?? [];
  const bindings = ((manifest.config as Manifest['config'] & { bindings?: ManifestBinding[] }).bindings ?? []);
  const [viewpointKey, setViewpointKey] = useState(
    manifest.config.initialViewpointKey ?? viewpoints[0]?.key ?? '',
  );
  const viewpoint = viewpoints.find((v) => v.key === viewpointKey) ?? viewpoints[0];
  const image = bindings.find((b) => b.sceneKey === viewpointKey && b.url !== null)?.url ?? null;

  if (viewpoint === undefined || image === null) {
    return <p className="viewer-hint">Chưa có ảnh nội thất cho trải nghiệm này.</p>;
  }

  return (
    <div>
      {viewpoints.length > 1 && (
        <div className="viewer-controls" role="tablist" aria-label="Chọn góc nhìn">
          {viewpoints.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={v.key === viewpoint.key}
              className={v.key === viewpoint.key ? 'btn' : 'btn btn-secondary'}
              onClick={() => setViewpointKey(v.key)}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
      <PanoCanvas image={image} viewpoint={viewpoint} />
      <p className="viewer-hint">{viewpoint.description}</p>
      <HotspotList hotspots={viewpoint.hotspots} />
    </div>
  );
}

function PanoCanvas({ image, viewpoint }: { image: string; viewpoint: Viewpoint }): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({
    yaw: viewpoint.initialYaw ?? 0,
    pitch: viewpoint.initialPitch ?? 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    state.current.yaw = viewpoint.initialYaw ?? 0;
    state.current.pitch = viewpoint.initialPitch ?? 0;
  }, [viewpoint]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = image;
    let cancelled = false;

    img.onload = () => {
      if (cancelled) return;
      const draw = (): void => {
        if (cancelled) return;
        const { yaw, pitch } = state.current;
        drawEquirect(ctx, img, canvas.width, canvas.height, yaw, pitch, 70);
      };
      const resize = (): void => {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        draw();
      };
      resize();
      window.addEventListener('resize', resize);
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);

      const onDown = (e: PointerEvent): void => {
        if (reducedMotion) return;
        state.current.dragging = true;
        state.current.lastX = e.clientX;
        state.current.lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      };
      const onMove = (e: PointerEvent): void => {
        if (!state.current.dragging) return;
        const dx = e.clientX - state.current.lastX;
        const dy = e.clientY - state.current.lastY;
        state.current.lastX = e.clientX;
        state.current.lastY = e.clientY;
        state.current.yaw -= dx * 0.25;
        state.current.pitch = clamp(state.current.pitch + dy * 0.25, -80, 80);
        draw();
      };
      const onUp = (): void => {
        state.current.dragging = false;
      };
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'ArrowLeft') { state.current.yaw -= 10; draw(); }
        if (e.key === 'ArrowRight') { state.current.yaw += 10; draw(); }
      };
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('keydown', onKey);

      return () => {
        cancelled = true;
        window.removeEventListener('resize', resize);
        observer.disconnect();
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('keydown', onKey);
      };
    };
    return () => { cancelled = true; };
  }, [image, reducedMotion]);

  return (
    <div className="viewer-controls">
      <button
        type="button"
        className="btn-secondary btn"
        onClick={() => void toggleFullscreen(canvasRef.current)}
      >
        Toàn màn hình
      </button>
      <canvas
        ref={canvasRef}
        className="viewer-canvas"
        tabIndex={0}
        role="img"
        aria-label={`Toàn cảnh nội thất ${viewpoint.name} — dùng phím mũi tên để xoay`}
      />
    </div>
  );
}

/** Bật/tắt fullscreen cho canvas, trả focus về canvas khi thoát (P1-E2E-014). */
async function toggleFullscreen(canvas: HTMLCanvasElement | null): Promise<void> {
  if (canvas === null) return;
  try {
    if (document.fullscreenElement !== null) {
      await document.exitFullscreen();
      return;
    }
    await canvas.requestFullscreen();
    canvas.focus();
  } catch {
    // Một số WebView không hỗ trợ fullscreen — viewer vẫn dùng được ở kích thước thường
  }
}

/** Chiếu equirectangular lên canvas — yaw/pitch theo độ, fov dọc theo độ. */
function drawEquirect(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  yawDeg: number,
  pitchDeg: number,
  fovDeg: number,
): void {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const fov = (fovDeg * Math.PI) / 180;
  const halfW = w / 2;
  const halfH = h / 2;
  const focal = halfH / Math.tan(fov / 2);

  const step = 4;
  for (let py = 0; py < h; py += step) {
    for (let px = 0; px < w; px += step) {
      const x = px - halfW;
      const y = halfH - py;
      const vx = x;
      const vy = y;
      const vz = -focal;
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const rx = cosY * vx + sinY * vz;
      const rz = -sinY * vx + cosY * vz;
      const ry = cosP * vy - sinP * rz;
      const rz2 = sinP * vy + cosP * rz;
      const lon = Math.atan2(rx, -rz2);
      const lat = Math.asin(clamp(ry / Math.hypot(rx, ry, rz2), -1, 1));
      const tx = ((lon / Math.PI) * 0.5 + 0.5) * img.width;
      const ty = (0.5 - lat / Math.PI) * img.height;
      ctx.drawImage(img, tx, ty, 1, 1, px, py, step, step);
    }
  }
}

function HotspotList({ hotspots, onGo }: {
  hotspots: ManifestHotspot[];
  onGo?: (h: ManifestHotspot) => void;
}): React.ReactElement {
  if (hotspots.length === 0) return <></>;
  return (
    <ul className="hotspot-list">
      {hotspots.map((h) => (
        <li key={h.id}>
          <strong>{h.title}</strong>
          {h.description !== '' && ` — ${h.description}`}
          {onGo !== undefined && h.yawDegrees !== undefined && (
            <> <button type="button" className="btn-secondary btn" style={{ padding: '4px 10px', marginLeft: 8 }} onClick={() => onGo(h)}>Xem</button></>
          )}
        </li>
      ))}
    </ul>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent): void => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
