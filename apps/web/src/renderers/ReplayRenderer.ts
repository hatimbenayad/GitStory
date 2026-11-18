import { Application, Graphics, Container, Text, TextStyle } from 'pixi.js';
import {
  getPaletteColor,
  hexToNumber,
  type LayoutNode,
  type TreeLayoutFrame,
} from '@gitstory/layout';

export interface ReplayRenderOptions {
  colorblindSafe: boolean;
  reducedMotion: boolean;
  showLabels: boolean;
  dimBotCommit: boolean;
}

export interface CameraTransform {
  x: number;
  y: number;
  scale: number;
}

export interface HoverInfo {
  node: LayoutNode;
  screenX: number;
  screenY: number;
}

/**
 * Draws a `TreeLayoutFrame` onto a Canvas2D context (used both as automatic WebGL fallback
 * and for deterministic offscreen export frames in U12).
 */
export function drawTreeFrameToCanvas2D(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: TreeLayoutFrame,
  eventProgress: number,
  camera: CameraTransform,
  options: ReplayRenderOptions,
): void {
  ctx.save();
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, width, height);

  // Subtle radial vignette background
  const grad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    20,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.65,
  );
  grad.addColorStop(0, '#111a2e');
  grad.addColorStop(1, '#070a12');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.translate(width / 2 + camera.x, height / 2 + camera.y);
  ctx.scale(camera.scale, camera.scale);

  const globalAlpha = options.dimBotCommit ? 0.45 : 1;
  ctx.globalAlpha = globalAlpha;

  const t = options.reducedMotion ? 1 : Math.max(0, Math.min(1, eventProgress));
  const easeOut = 1 - (1 - t) * (1 - t);

  // Draw edges
  ctx.lineWidth = Math.max(0.75, 1.1 / camera.scale);
  for (const edge of frame.edges) {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.beginPath();
    ctx.moveTo(edge.x1, edge.y1);
    ctx.lineTo(edge.x2, edge.y2);
    ctx.stroke();
  }

  // Draw fading deleted ghost nodes
  if (!options.reducedMotion && frame.deletedGhosts.length > 0) {
    const ghostAlpha = Math.max(0, (1 - easeOut) * 0.85) * globalAlpha;
    for (const ghost of frame.deletedGhosts) {
      ctx.save();
      ctx.globalAlpha = ghostAlpha;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(ghost.x, ghost.y, ghost.radius * (1 + easeOut * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Draw directory and file nodes
  for (const node of frame.nodes) {
    let drawX = node.x;
    let drawY = node.y;
    let drawRadius = node.radius;

    if (!options.reducedMotion && node.changeType === 'R' && node.prevX !== undefined && node.prevY !== undefined) {
      drawX = node.prevX + (node.x - node.prevX) * easeOut;
      drawY = node.prevY + (node.y - node.prevY) * easeOut;
    } else if (!options.reducedMotion && node.changeType === 'A') {
      drawRadius = node.radius * (0.25 + 0.75 * easeOut);
    }

    const color =
      node.kind === 'dir'
        ? node.depth === 0
          ? '#f8fafc'
          : '#64748b'
        : getPaletteColor(node.ext || node.topDir, options.colorblindSafe);

    // Highlight halo for active changes
    if (node.changeType && !options.reducedMotion) {
      const pulse = Math.max(0, 1 - easeOut);
      const haloColor =
        node.changeType === 'A'
          ? 'rgba(52, 211, 153, 0.55)'
          : node.changeType === 'R'
            ? 'rgba(56, 189, 248, 0.6)'
            : 'rgba(251, 191, 36, 0.55)';
      ctx.save();
      ctx.globalAlpha = (0.35 + pulse * 0.55) * globalAlpha;
      ctx.strokeStyle = haloColor;
      ctx.lineWidth = Math.max(1.5, 2.2 / camera.scale);
      ctx.beginPath();
      ctx.arc(drawX, drawY, drawRadius + 4 + (1 - pulse) * 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(drawX, drawY, drawRadius, 0, Math.PI * 2);
    ctx.fill();

    if (node.kind === 'dir' && node.depth <= 2 && options.showLabels && node.name !== '/') {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
      ctx.font = `600 ${Math.max(10, 11 / Math.sqrt(camera.scale))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(node.name, drawX, drawY - drawRadius - 5);
    }
  }

  ctx.restore();
}

/**
 * High-performance Replay Renderer powered by PixiJS v8 WebGL with automatic
 * transparent Canvas2D fallback when WebGL is unavailable (`FR-16`, `FR-22`).
 */
export class ReplayRenderer {
  private readonly container: HTMLElement;
  private pixiApp: Application | null = null;
  private worldContainer: Container | null = null;
  private edgeGraphics: Graphics | null = null;
  private nodeGraphics: Graphics | null = null;
  private labelLayer: Container | null = null;
  private labelPool = new Map<string, Text>();

  private fallbackCanvas: HTMLCanvasElement | null = null;
  private fallbackCtx: CanvasRenderingContext2D | null = null;
  private usingWebGL = false;
  private destroyed = false;

  private width = 800;
  private height = 500;
  private camera: CameraTransform = { x: 0, y: 0, scale: 1 };
  private lastFrame: TreeLayoutFrame | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(320, Math.floor(rect.width) || 800);
    this.height = Math.max(240, Math.floor(rect.height) || 500);

    try {
      const app = new Application();
      await app.init({
        width: this.width,
        height: this.height,
        backgroundColor: 0x090d16,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        preserveDrawingBuffer: true,
        preference: 'webgl',
      });

      if (this.destroyed) {
        app.destroy(true);
        return;
      }

      this.pixiApp = app;
      this.usingWebGL = true;
      app.canvas.style.width = '100%';
      app.canvas.style.height = '100%';
      app.canvas.style.display = 'block';
      this.container.innerHTML = '';
      this.container.appendChild(app.canvas);

      this.worldContainer = new Container();
      this.edgeGraphics = new Graphics();
      this.nodeGraphics = new Graphics();
      this.labelLayer = new Container();

      this.worldContainer.addChild(this.edgeGraphics, this.nodeGraphics, this.labelLayer);
      app.stage.addChild(this.worldContainer);
    } catch {
      if (this.destroyed) return;
      this.initCanvas2DFallback();
    }
  }

  private initCanvas2DFallback(): void {
    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(this.width * dpr);
    canvas.height = Math.floor(this.height * dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';

    this.container.innerHTML = '';
    this.container.appendChild(canvas);
    this.fallbackCanvas = canvas;
    this.fallbackCtx = canvas.getContext('2d');
    this.usingWebGL = false;
  }

  isUsingWebGL(): boolean {
    return this.usingWebGL;
  }

  getCanvas(): HTMLCanvasElement | null {
    if (this.pixiApp) return this.pixiApp.canvas;
    return this.fallbackCanvas;
  }

  setCamera(camera: CameraTransform): void {
    this.camera = camera;
  }

  getCamera(): CameraTransform {
    return { ...this.camera };
  }

  fitToBounds(frame: TreeLayoutFrame): CameraTransform {
    const pad = 70;
    const spanX = Math.max(200, frame.bounds.maxX - frame.bounds.minX + pad * 2);
    const spanY = Math.max(200, frame.bounds.maxY - frame.bounds.minY + pad * 2);
    const scale = Math.max(0.2, Math.min(1.6, Math.min(this.width / spanX, this.height / spanY)));
    const cx = (frame.bounds.minX + frame.bounds.maxX) / 2;
    const cy = (frame.bounds.minY + frame.bounds.maxY) / 2;
    this.camera = { x: -cx * scale, y: -cy * scale, scale };
    return this.getCamera();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(200, Math.floor(width));
    this.height = Math.max(150, Math.floor(height));
    if (this.pixiApp) {
      this.pixiApp.renderer.resize(this.width, this.height);
    } else if (this.fallbackCanvas) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.fallbackCanvas.width = Math.floor(this.width * dpr);
      this.fallbackCanvas.height = Math.floor(this.height * dpr);
    }
  }

  hitTest(clientX: number, clientY: number): HoverInfo | null {
    if (!this.lastFrame) return null;
    const rect = this.container.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const worldX = (sx - this.width / 2 - this.camera.x) / this.camera.scale;
    const worldY = (sy - this.height / 2 - this.camera.y) / this.camera.scale;

    let best: LayoutNode | null = null;
    let bestDist = 14 / this.camera.scale;
    for (const node of this.lastFrame.nodes) {
      const d = Math.hypot(node.x - worldX, node.y - worldY);
      if (d <= Math.max(node.radius + 4, bestDist)) {
        best = node;
        bestDist = d;
      }
    }
    return best ? { node: best, screenX: sx, screenY: sy } : null;
  }

  render(frame: TreeLayoutFrame, eventProgress: number, options: ReplayRenderOptions): void {
    if (this.destroyed) return;
    this.lastFrame = frame;

    if (!this.pixiApp || !this.worldContainer || !this.edgeGraphics || !this.nodeGraphics || !this.labelLayer) {
      if (this.fallbackCanvas && this.fallbackCtx) {
        const dpr = this.fallbackCanvas.width / Math.max(1, this.width);
        this.fallbackCtx.save();
        this.fallbackCtx.scale(dpr, dpr);
        drawTreeFrameToCanvas2D(
          this.fallbackCtx,
          this.width,
          this.height,
          frame,
          eventProgress,
          this.camera,
          options,
        );
        this.fallbackCtx.restore();
      }
      return;
    }

    const t = options.reducedMotion ? 1 : Math.max(0, Math.min(1, eventProgress));
    const easeOut = 1 - (1 - t) * (1 - t);

    this.worldContainer.position.set(this.width / 2 + this.camera.x, this.height / 2 + this.camera.y);
    this.worldContainer.scale.set(this.camera.scale);
    this.worldContainer.alpha = options.dimBotCommit ? 0.45 : 1;

    // Edges
    const eg = this.edgeGraphics;
    eg.clear();
    const strokeW = Math.max(0.75, 1.1 / this.camera.scale);
    for (const edge of frame.edges) {
      eg.moveTo(edge.x1, edge.y1);
      eg.lineTo(edge.x2, edge.y2);
    }
    eg.stroke({ width: strokeW, color: 0x94a3b8, alpha: 0.22 });

    // Nodes & animations
    const ng = this.nodeGraphics;
    ng.clear();

    if (!options.reducedMotion) {
      const ghostAlpha = Math.max(0, (1 - easeOut) * 0.85);
      for (const ghost of frame.deletedGhosts) {
        ng.circle(ghost.x, ghost.y, ghost.radius * (1 + easeOut * 0.6));
        ng.fill({ color: 0xef4444, alpha: ghostAlpha });
      }
    }

    const visibleLabelIds = new Set<string>();
    const labelStyle = new TextStyle({
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 11,
      fontWeight: '600',
      fill: 0xe2e8f0,
    });

    for (const node of frame.nodes) {
      let drawX = node.x;
      let drawY = node.y;
      let drawRadius = node.radius;

      if (!options.reducedMotion && node.changeType === 'R' && node.prevX !== undefined && node.prevY !== undefined) {
        drawX = node.prevX + (node.x - node.prevX) * easeOut;
        drawY = node.prevY + (node.y - node.prevY) * easeOut;
      } else if (!options.reducedMotion && node.changeType === 'A') {
        drawRadius = node.radius * (0.25 + 0.75 * easeOut);
      }

      if (node.changeType && !options.reducedMotion) {
        const pulse = Math.max(0, 1 - easeOut);
        const haloColor =
          node.changeType === 'A'
            ? 0x34d399
            : node.changeType === 'R'
              ? 0x38bdf8
              : 0xfbbf24;
        ng.circle(drawX, drawY, drawRadius + 4 + (1 - pulse) * 9);
        ng.stroke({
          width: Math.max(1.5, 2.2 / this.camera.scale),
          color: haloColor,
          alpha: 0.35 + pulse * 0.55,
        });
      }

      const fillNum =
        node.kind === 'dir'
          ? node.depth === 0
            ? 0xf8fafc
            : 0x64748b
          : hexToNumber(getPaletteColor(node.ext || node.topDir, options.colorblindSafe));

      ng.circle(drawX, drawY, drawRadius);
      ng.fill({ color: fillNum, alpha: 0.95 });

      if (options.showLabels && node.kind === 'dir' && node.depth >= 1 && node.depth <= 2) {
        visibleLabelIds.add(node.id);
        let label = this.labelPool.get(node.id);
        if (!label) {
          label = new Text({ text: node.name, style: labelStyle });
          label.anchor.set(0.5, 1);
          this.labelPool.set(node.id, label);
          this.labelLayer.addChild(label);
        }
        label.visible = true;
        label.position.set(drawX, drawY - drawRadius - 4);
        label.scale.set(1 / Math.sqrt(Math.max(0.25, this.camera.scale)));
      }
    }

    for (const [id, label] of this.labelPool.entries()) {
      if (!visibleLabelIds.has(id)) {
        label.visible = false;
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.labelPool.clear();
    if (this.pixiApp) {
      this.pixiApp.destroy(true, { children: true });
      this.pixiApp = null;
    }
    this.fallbackCanvas = null;
    this.fallbackCtx = null;
  }
}
