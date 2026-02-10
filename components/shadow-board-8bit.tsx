"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface RoamPersona {
  id: string;
  name: string;
  comment: string;
  comments?: string[];
  thinkingSteps: string[];
}

interface BoardRoamProps {
  personas: RoamPersona[];
}

interface BoardMember extends RoamPersona {
  x: number;
  y: number;
  comments: string[];
}

interface ConversationTurn {
  personaId: string;
  personaName: string;
  text: string;
  round: number;
}

const WORLD_WIDTH = 1680;
const WORLD_HEIGHT = 1040;
const PLAYER_SPEED = 4.1;
const TILE = 16;
const MAX_COMMENTS_PER_PERSONA = 5;

const DESK_POSITIONS = [
  { x: 360, y: 250 },
  { x: 670, y: 225 },
  { x: 990, y: 225 },
  { x: 1300, y: 250 },
  { x: 340, y: 700 },
  { x: 650, y: 735 },
  { x: 1010, y: 735 },
  { x: 1320, y: 700 },
];

const SUIT_COLORS = ["#3f6cff", "#00a8a8", "#f28444", "#8f59ff", "#ff657d", "#1f9d55", "#3f7dff", "#f2a93b"];
const SKIN_TONES = ["#f5c89c", "#f2b38b", "#d89163", "#c47a52", "#e6b58f", "#f1c7a2", "#b06d4a", "#f4bd90"];

export function ShadowBoard8BitRoam({ personas }: BoardRoamProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [viewport, setViewport] = useState({ width: 980, height: 560 });
  const [player, setPlayer] = useState({ x: 850, y: 520 });
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [activeTurnIndex, setActiveTurnIndex] = useState(0);
  const [displayTurnIndex, setDisplayTurnIndex] = useState(-1);
  const [typedLength, setTypedLength] = useState(0);

  const boardMembers = useMemo<BoardMember[]>(
    () =>
      personas.slice(0, 8).map((persona, index) => ({
        ...persona,
        comments: normalizeCommentSet(persona),
        x: DESK_POSITIONS[index]?.x ?? 300 + index * 120,
        y: DESK_POSITIONS[index]?.y ?? 300,
      })),
    [personas],
  );

  const conversationTurns = useMemo(() => buildConversationTurns(boardMembers), [boardMembers]);

  const activeTurn = useMemo<ConversationTurn | null>(() => {
    if (conversationTurns.length === 0) {
      return null;
    }
    return conversationTurns[activeTurnIndex % conversationTurns.length] ?? null;
  }, [activeTurnIndex, conversationTurns]);

  const activeSpeaker = useMemo(
    () => boardMembers.find((member) => member.id === activeTurn?.personaId) ?? null,
    [activeTurn?.personaId, boardMembers],
  );

  const camera = useMemo(() => {
    const x = clamp(player.x - viewport.width / 2, 0, WORLD_WIDTH - viewport.width);
    const y = clamp(player.y - viewport.height / 2, 0, WORLD_HEIGHT - viewport.height);
    return { x, y };
  }, [player, viewport.height, viewport.width]);

  const bubblePosition = useMemo(() => {
    if (!activeSpeaker) {
      return null;
    }

    return {
      left: clamp(activeSpeaker.x - camera.x - 104, 8, viewport.width - 208),
      top: clamp(activeSpeaker.y - camera.y - 156, 8, viewport.height - 94),
    };
  }, [activeSpeaker, camera.x, camera.y, viewport.height, viewport.width]);

  useEffect(() => {
    function updateViewport() {
      if (!containerRef.current) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      setViewport({
        width: Math.max(560, Math.floor(rect.width)),
        height: 560,
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
        if (current.has(code)) {
          return current;
        }
        const next = new Set(current);
        next.add(code);
        return next;
      });
    }

    function onUp(event: KeyboardEvent) {
      setKeys((current) => {
        if (!current.has(event.code)) {
          return current;
        }
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
    if (!activeTurn || conversationTurns.length === 0) {
      return;
    }

    const startDelay = 260 + (activeTurn.round % 3) * 220;
    const typingIntervalMs = 22;

    let typingTimer: number | undefined;
    let holdTimer: number | undefined;

    const startTimer = window.setTimeout(() => {
      setDisplayTurnIndex(activeTurnIndex);
      setTypedLength(0);

      typingTimer = window.setInterval(() => {
        setTypedLength((current) => {
          if (current >= activeTurn.text.length) {
            if (typingTimer) {
              window.clearInterval(typingTimer);
              typingTimer = undefined;
            }

            if (!holdTimer) {
              const holdMs = 900 + Math.min(1200, Math.floor(activeTurn.text.length * 18));
              holdTimer = window.setTimeout(() => {
                setDisplayTurnIndex(-1);
                setTypedLength(0);
                setActiveTurnIndex((index) => {
                  if (conversationTurns.length === 0) {
                    return 0;
                  }
                  return (index + 1) % conversationTurns.length;
                });
              }, holdMs);
            }

            return current;
          }

          return current + 1;
        });
      }, typingIntervalMs);
    }, startDelay);

    return () => {
      if (startTimer) {
        window.clearTimeout(startTimer);
      }
      if (typingTimer) {
        window.clearInterval(typingTimer);
      }
      if (holdTimer) {
        window.clearTimeout(holdTimer);
      }
    };
  }, [activeTurn, activeTurnIndex, conversationTurns.length]);

  const typedText = activeTurn && displayTurnIndex === activeTurnIndex ? activeTurn.text.slice(0, typedLength) : "";
  const bubbleLines = useMemo(() => {
    const lines = wrapBubbleLines(typedText, 28);
    const visible = lines.slice(-2);

    if (visible.length === 0) {
      visible.push("Listening for signal...");
    }
    while (visible.length < 2) {
      visible.push("");
    }

    if (activeTurn && typedLength < activeTurn.text.length) {
      const last = visible[1] || visible[0];
      const cursorLine = `${last}|`;
      if (visible[1]) {
        visible[1] = cursorLine.slice(0, 28);
      } else {
        visible[0] = cursorLine.slice(0, 28);
      }
    }

    return visible;
  }, [activeTurn, typedLength, typedText]);

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
          x: clamp(current.x + dx, 44, WORLD_WIDTH - 44),
          y: clamp(current.y + dy, 44, WORLD_HEIGHT - 44),
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

      drawBoardroom(ctx, camera, canvas.width, canvas.height, frameCount);

      const tableX = 420 - camera.x;
      const tableY = 305 - camera.y;
      ctx.fillStyle = "#4e3322";
      ctx.fillRect(tableX, tableY, 860, 390);
      ctx.fillStyle = "#6e462c";
      ctx.fillRect(tableX + 12, tableY + 10, 836, 366);
      ctx.fillStyle = "#7e5232";
      ctx.fillRect(tableX + 48, tableY + 54, 768, 278);

      const holoPulse = frameCount % 80 < 40 ? "#4ee1ff" : "#7df3ff";
      ctx.fillStyle = "rgba(126, 240, 255, 0.2)";
      ctx.fillRect(tableX + 355, tableY + 155, 150, 90);
      ctx.fillStyle = holoPulse;
      ctx.fillRect(tableX + 388, tableY + 184, 84, 34);

      boardMembers.forEach((member, index) => {
        const deskX = member.x - camera.x;
        const deskY = member.y - camera.y;

        const deskShade = index % 2 === 0 ? "#8c5d36" : "#7a4f2f";
        ctx.fillStyle = "#5e3b24";
        ctx.fillRect(deskX - 52, deskY - 22, 104, 44);
        ctx.fillStyle = deskShade;
        ctx.fillRect(deskX - 46, deskY - 16, 92, 32);

        ctx.fillStyle = "#31425e";
        ctx.fillRect(deskX - 24, deskY + 20, 48, 14);

        drawPixelAvatar(ctx, deskX, deskY - 34, SKIN_TONES[index % SKIN_TONES.length], SUIT_COLORS[index % SUIT_COLORS.length], 6);

        if (activeTurn?.personaId === member.id) {
          drawRaiseHandCue(ctx, deskX + 36, deskY - 92, frameCount);
        }
      });

      const playerX = player.x - camera.x;
      const playerY = player.y - camera.y;
      drawPixelAvatar(ctx, playerX, playerY, "#f7e7d4", "#00b37e", 5);

      ctx.fillStyle = "rgba(243, 250, 255, 0.9)";
      ctx.font = '12px "IBM Plex Mono", monospace';
      ctx.fillText("Move with arrow keys / WASD", 14, 22);
      ctx.fillText("Virtual board roam simulation", 14, 40);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeTurn?.personaId, boardMembers, camera, keys, player.x, player.y, viewport.height, viewport.width]);

  return (
    <div className="rounded-3xl border border-[color:var(--line)] bg-[#0b1730]/95 p-3">
      <div ref={containerRef} className="relative overflow-hidden rounded-2xl border border-[#32558c] bg-[#0d1930]">
        <canvas ref={canvasRef} className="block w-full" style={{ height: `${viewport.height}px` }} />

        {activeSpeaker && bubblePosition ? (
          <div
            className="pointer-events-none absolute"
            style={{ left: bubblePosition.left, top: bubblePosition.top, width: 198 }}
          >
            <div className="rounded-xl border border-[#365c95] bg-[#fdf6d1] px-2 py-1.5 shadow-[0_5px_0_0_#4f76ab]">
              <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-[#1f2d49]">{activeSpeaker.name}</p>
              <p className="h-4 text-[10px] leading-4 text-[#1f2d49]">{bubbleLines[0] || ""}</p>
              <p className="h-4 text-[10px] leading-4 text-[#1f2d49]">{bubbleLines[1] || ""}</p>
            </div>
          </div>
        ) : null}

        <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg border border-[#335685] bg-[#0f1f3f]/80 px-2 py-1 text-[10px] text-[#f0f6ff]">
          <p>
            Turn {conversationTurns.length === 0 ? 0 : (activeTurnIndex % conversationTurns.length) + 1} of {conversationTurns.length}
          </p>
          <p>{activeTurn?.personaName ?? "Awaiting run"}</p>
        </div>
      </div>
    </div>
  );
}

function buildConversationTurns(members: BoardMember[]): ConversationTurn[] {
  if (members.length === 0) {
    return [];
  }

  const maxRounds = members.reduce((max, member) => Math.max(max, member.comments.length), 0);
  const turns: ConversationTurn[] = [];

  for (let round = 0; round < maxRounds; round += 1) {
    for (const member of members) {
      const text = member.comments[round];
      if (!text) {
        continue;
      }

      turns.push({
        personaId: member.id,
        personaName: member.name,
        text,
        round,
      });
    }
  }

  return turns;
}

function normalizeCommentSet(persona: RoamPersona): string[] {
  const seed = (Array.isArray(persona.comments) && persona.comments.length > 0 ? persona.comments : [persona.comment])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_COMMENTS_PER_PERSONA);

  const fallbackLens = persona.thinkingSteps[0]?.trim() || "Stress-test strategy and execution gaps";

  while (seed.length < 3) {
    if (seed.length === 0) {
      seed.push(`${persona.name}: Clarify which metric proves this strategy is truly working.`);
    } else if (seed.length === 1) {
      seed.push(`${persona.name}: Run a staged pilot and review evidence before full scale-up.`);
    } else {
      seed.push(`${persona.name}: ${fallbackLens}.`);
    }
  }

  return seed;
}

function wrapBubbleLines(text: string, maxChars: number): string[] {
  const words = text
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    lines.push(word.slice(0, maxChars));
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function drawBoardroom(
  ctx: CanvasRenderingContext2D,
  camera: { x: number; y: number },
  width: number,
  height: number,
  frameCount: number,
) {
  ctx.fillStyle = "#0e1b35";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#1a3159";
  ctx.fillRect(0, 0, width, Math.floor(height * 0.34));

  for (let y = 0; y < WORLD_HEIGHT; y += TILE) {
    for (let x = 0; x < WORLD_WIDTH; x += TILE) {
      const sx = x - camera.x;
      const sy = y - camera.y;
      if (sx < -TILE || sy < -TILE || sx > width || sy > height) {
        continue;
      }

      const isWall = y < 330;
      if (isWall) {
        const wallBand = ((x / TILE) + Math.floor(y / (TILE * 2))) % 2 === 0;
        ctx.fillStyle = wallBand ? "#223d6c" : "#264676";
      } else {
        const checker = (x / TILE + y / TILE) % 2 === 0;
        ctx.fillStyle = checker ? "#162948" : "#1c3358";
      }

      ctx.fillRect(sx, sy, TILE, TILE);
    }
  }

  const glow = frameCount % 100 < 50 ? "#79dcff" : "#a0ebff";
  const windows = [
    { x: 240, y: 90 },
    { x: 690, y: 80 },
    { x: 1140, y: 90 },
  ];

  for (const window of windows) {
    const sx = window.x - camera.x;
    const sy = window.y - camera.y;
    ctx.fillStyle = "#10253f";
    ctx.fillRect(sx, sy, 220, 120);
    ctx.fillStyle = glow;
    ctx.fillRect(sx + 14, sy + 14, 192, 92);
    ctx.fillStyle = "rgba(16, 40, 68, 0.5)";
    ctx.fillRect(sx + 96, sy + 14, 12, 92);
  }
}

function drawRaiseHandCue(ctx: CanvasRenderingContext2D, x: number, y: number, frameCount: number) {
  const pulse = frameCount % 24 < 12;
  ctx.fillStyle = pulse ? "#ffcf5a" : "#ffd983";
  ctx.fillRect(x, y, 10, 10);
  ctx.fillStyle = "#704f09";
  ctx.fillRect(x + 3, y + 3, 4, 4);
}

function drawPixelAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  skin: string,
  outfit: string,
  scale = 4,
) {
  const s = scale;

  ctx.fillStyle = skin;
  ctx.fillRect(x - s, y - 3 * s, 2 * s, 2 * s);

  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x - s, y - 3 * s, 2 * s, Math.max(2, Math.floor(s / 1.3)));

  ctx.fillStyle = outfit;
  ctx.fillRect(x - 1.5 * s, y - s, 3 * s, 2.6 * s);

  ctx.fillStyle = "#0e1224";
  ctx.fillRect(x - 1.5 * s, y + 1.6 * s, s, 2.2 * s);
  ctx.fillRect(x + 0.5 * s, y + 1.6 * s, s, 2.2 * s);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
