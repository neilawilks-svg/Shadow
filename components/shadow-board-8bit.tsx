"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface RoamPersona {
  id: string;
  name: string;
  comment: string;
  thinkingSteps: string[];
}

interface BoardRoamProps {
  personas: RoamPersona[];
}

const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 980;
const PLAYER_SPEED = 3.8;
const TILE = 16;

const DESK_POSITIONS = [
  { x: 320, y: 230 },
  { x: 640, y: 200 },
  { x: 960, y: 210 },
  { x: 1260, y: 245 },
  { x: 300, y: 640 },
  { x: 620, y: 690 },
  { x: 960, y: 690 },
  { x: 1260, y: 640 },
];

export function ShadowBoard8BitRoam({ personas }: BoardRoamProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 980, height: 540 });
  const [player, setPlayer] = useState({ x: 800, y: 500 });
  const [keys, setKeys] = useState<Set<string>>(new Set());

  const boardMembers = useMemo(
    () =>
      personas.slice(0, 8).map((persona, index) => ({
        ...persona,
        x: DESK_POSITIONS[index]?.x ?? 300 + index * 120,
        y: DESK_POSITIONS[index]?.y ?? 300,
      })),
    [personas],
  );

  const camera = useMemo(() => {
    const x = clamp(player.x - viewport.width / 2, 0, WORLD_WIDTH - viewport.width);
    const y = clamp(player.y - viewport.height / 2, 0, WORLD_HEIGHT - viewport.height);
    return { x, y };
  }, [player, viewport.height, viewport.width]);

  useEffect(() => {
    function updateViewport() {
      if (!containerRef.current) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      setViewport({
        width: Math.max(560, Math.floor(rect.width)),
        height: 540,
      });
    }

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    function onDown(event: KeyboardEvent) {
      const code = event.code;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(code)) {
        event.preventDefault();
      }
      setKeys((current) => {
        const next = new Set(current);
        next.add(code);
        return next;
      });
    }

    function onUp(event: KeyboardEvent) {
      setKeys((current) => {
        const next = new Set(current);
        next.delete(event.code);
        return next;
      });
    }

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);

    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let raf = 0;

    function tick() {
      frame += 1;

      setPlayer((current) => {
        let dx = 0;
        let dy = 0;

        if (keys.has("ArrowUp") || keys.has("KeyW")) dy -= PLAYER_SPEED;
        if (keys.has("ArrowDown") || keys.has("KeyS")) dy += PLAYER_SPEED;
        if (keys.has("ArrowLeft") || keys.has("KeyA")) dx -= PLAYER_SPEED;
        if (keys.has("ArrowRight") || keys.has("KeyD")) dx += PLAYER_SPEED;

        if (dx === 0 && dy === 0) {
          return current;
        }

        return {
          x: clamp(current.x + dx, 40, WORLD_WIDTH - 40),
          y: clamp(current.y + dy, 40, WORLD_HEIGHT - 40),
        };
      });

      drawScene(frame);
      raf = requestAnimationFrame(tick);
    }

    function drawScene(frameCount: number) {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      ctx.imageSmoothingEnabled = false;

      ctx.fillStyle = "#0f1e3a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let y = 0; y < WORLD_HEIGHT; y += TILE) {
        for (let x = 0; x < WORLD_WIDTH; x += TILE) {
          const sx = x - camera.x;
          const sy = y - camera.y;
          if (sx < -TILE || sy < -TILE || sx > canvas.width || sy > canvas.height) {
            continue;
          }
          const checker = (x / TILE + y / TILE) % 2 === 0;
          ctx.fillStyle = checker ? "#1c2f57" : "#213865";
          ctx.fillRect(sx, sy, TILE, TILE);
        }
      }

      const tableX = 460 - camera.x;
      const tableY = 330 - camera.y;
      ctx.fillStyle = "#6a4b2f";
      ctx.fillRect(tableX, tableY, 680, 300);
      ctx.fillStyle = "#7d5a39";
      ctx.fillRect(tableX + 8, tableY + 8, 664, 284);

      boardMembers.forEach((member, index) => {
        const deskX = member.x - camera.x;
        const deskY = member.y - camera.y;
        const pulse = (frameCount + index * 9) % 40 < 20 ? 0 : 1;

        ctx.fillStyle = "#70492a";
        ctx.fillRect(deskX - 38, deskY - 18, 76, 36);
        ctx.fillStyle = "#8f6038";
        ctx.fillRect(deskX - 34, deskY - 14, 68, 28);

        drawPixelAvatar(ctx, deskX, deskY - 26, pulse ? "#ffd166" : "#f4a261", "#2a9d8f");
      });

      const playerX = player.x - camera.x;
      const playerY = player.y - camera.y;
      drawPixelAvatar(ctx, playerX, playerY, "#f7f7f7", "#00b37e");

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = '12px "IBM Plex Mono", monospace';
      ctx.fillText("Use arrow keys / WASD to roam", 14, 22);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [boardMembers, camera.x, camera.y, keys, player.x, player.y, viewport.height, viewport.width]);

  return (
    <div className="rounded-3xl border border-[color:var(--line)] bg-[#0d1930]/90 p-3">
      <div ref={containerRef} className="relative overflow-hidden rounded-2xl border border-[#2e4a79] bg-[#0d1930]">
        <canvas ref={canvasRef} className="block w-full" style={{ height: `${viewport.height}px` }} />

        {boardMembers.map((member) => {
          const sx = member.x - camera.x;
          const sy = member.y - camera.y;
          if (sx < -120 || sy < -160 || sx > viewport.width + 80 || sy > viewport.height + 80) {
            return null;
          }

          return (
            <div key={member.id} className="pointer-events-none absolute" style={{ left: sx - 80, top: sy - 150, width: 170 }}>
              <div className="rounded-xl border border-[#3b5f95] bg-[#fdf7d6] px-2 py-1 shadow-[0_6px_0_0_#5979ad]">
                <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1f2e4f]">{member.name}</p>
                <p className="text-[10px] text-[#1f2e4f]">{member.comment}</p>
                <p className="mt-1 text-[10px] text-[#425f8f]">
                  Think: {member.thinkingSteps.slice(0, 2).join(" -> ") || "Awaiting run"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function drawPixelAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  skin: string,
  outfit: string,
) {
  const s = 4;
  ctx.fillStyle = skin;
  ctx.fillRect(x - s, y - 3 * s, 2 * s, 2 * s);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x - s, y - 3 * s, 2 * s, s / 1.2);

  ctx.fillStyle = outfit;
  ctx.fillRect(x - 1.5 * s, y - s, 3 * s, 2.5 * s);
  ctx.fillStyle = "#0e1224";
  ctx.fillRect(x - 1.5 * s, y + 1.5 * s, s, 2 * s);
  ctx.fillRect(x + 0.5 * s, y + 1.5 * s, s, 2 * s);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
