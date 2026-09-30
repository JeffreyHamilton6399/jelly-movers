'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Armchair,
  Box,
  Bug,
  Clock,
  Coins,
  Gamepad2,
  Heart,
  Keyboard,
  Lightbulb,
  Music,
  Play,
  RotateCcw,
  Truck,
} from 'lucide-react';
import { Game } from '@/game/game';
import type { GameSnapshot, ItemSnapshot } from '@/game/types';

const GAME_FONT =
  '"Comic Sans MS", "Comic Sans", "Chalkboard SE", "Segoe Print", cursive';

const ITEM_ICONS: Record<string, typeof Box> = {
  box: Box,
  couch: Armchair,
  piano: Music,
  lamp: Lightbulb,
};

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function SlotCard({
  name,
  color,
  joined,
  deviceLabel,
}: {
  name: string;
  color: string;
  joined: boolean;
  deviceLabel: string | null;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border-2 p-3 transition-all ${
        joined
          ? 'border-[#4A3B32] bg-white/80 shadow-sm'
          : 'border-dashed border-[#4A3B32]/40 bg-white/30'
      }`}
    >
      <span
        className={`h-7 w-7 shrink-0 rounded-full border-2 border-[#4A3B32] ${
          joined ? '' : 'opacity-30'
        }`}
        style={{ backgroundColor: color }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-[#4A3B32]">{name}</div>
        <div className="truncate text-xs text-[#4A3B32]/70">
          {joined ? deviceLabel : 'waiting to join…'}
        </div>
      </div>
      {joined ? (
        <Badge className="border-[#4A3B32] bg-[#7DB84E] text-[10px] text-white">
          READY
        </Badge>
      ) : (
        <span className="animate-pulse text-[10px] font-bold text-[#4A3B32]/50">
          press keys
        </span>
      )}
    </div>
  );
}

function ItemRow({ item }: { item: ItemSnapshot }) {
  const Icon = ITEM_ICONS[item.kind] ?? Box;
  return (
    <div className="flex items-center gap-3 rounded-xl border-2 border-[#4A3B32]/15 bg-white/60 px-3 py-2">
      <Icon className="h-5 w-5 shrink-0 text-[#4A3B32]" />
      <div className="w-20 shrink-0 text-sm font-bold text-[#4A3B32]">
        {item.label}
      </div>
      <div className="flex-1">
        {item.delivered ? (
          <Progress
            value={item.damage}
            className="h-3 border border-[#4A3B32]/20 bg-[#4A3B32]/10"
          />
        ) : (
          <div className="text-xs font-semibold text-[#4A3B32]/50">
            still in the house
          </div>
        )}
      </div>
      <div className="w-16 shrink-0 text-right text-xs font-bold text-[#4A3B32]">
        {item.delivered ? `${item.damage}%` : '—'}
      </div>
      <div className="w-14 shrink-0 text-right text-sm font-bold text-[#4A3B32]">
        {item.delivered ? `$${item.pay}` : '$0'}
      </div>
    </div>
  );
}

export default function JellyMovers() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [snap, setSnap] = useState<GameSnapshot | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, setSnap);
    gameRef.current = game;
    (window as Window & { __jelly?: Game }).__jelly = game;
    game.start();
    return () => {
      game.destroy();
      gameRef.current = null;
      delete (window as Window & { __jelly?: Game }).__jelly;
    };
  }, []);

  const startRound = (e: React.MouseEvent<HTMLButtonElement>) => {
    gameRef.current?.startRound();
    e.currentTarget.blur();
  };

  const restart = (e: React.MouseEvent<HTMLButtonElement>) => {
    gameRef.current?.restart();
    e.currentTarget.blur();
  };

  const toMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    gameRef.current?.toMenu();
    e.currentTarget.blur();
  };

  const phase = snap?.phase ?? 'menu';
  const timeLow = (snap?.timeLeft ?? 180) <= 30;

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden bg-[#FDF3E1]"
      style={{ fontFamily: GAME_FONT }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ------------------------------ HUD ------------------------------ */}
      {phase === 'playing' && snap && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex items-start justify-between gap-2 px-3 sm:px-6">
          <div
            className={`flex items-center gap-2 rounded-full border-2 px-4 py-2 shadow-sm ${
              timeLow
                ? 'border-[#4A3B32] bg-[#FF6B6B] text-white'
                : 'border-[#4A3B32] bg-white/85 text-[#4A3B32]'
            }`}
          >
            <Clock className="h-5 w-5" />
            <span className="text-lg font-bold tabular-nums">
              {formatTime(snap.timeLeft)}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-full border-2 border-[#4A3B32] bg-white/85 px-4 py-2 text-[#4A3B32] shadow-sm">
            <Truck className="h-5 w-5" />
            <span className="text-lg font-bold">
              {snap.deliveredCount}/{snap.items.length}
            </span>
            <span className="hidden text-xs font-semibold text-[#4A3B32]/60 sm:inline">
              delivered
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border-2 border-[#4A3B32] bg-white/85 px-4 py-2 text-[#4A3B32] shadow-sm">
              <Coins className="h-5 w-5 text-[#E3B23C]" />
              <span className="text-lg font-bold tabular-nums">${snap.pay}</span>
            </div>
            <div className="hidden items-center gap-2 rounded-full border-2 border-[#4A3B32] bg-white/85 px-4 py-2 text-[#4A3B32] shadow-sm sm:flex">
              <Heart className="h-5 w-5 text-[#FF6B6B]" />
              <span className="text-sm font-bold">{snap.totalDamage}% dmg</span>
            </div>
          </div>
        </div>
      )}

      {phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <div className="rounded-full border-2 border-[#4A3B32]/25 bg-white/70 px-4 py-1.5 text-xs font-bold text-[#4A3B32]/70">
            grab: E / Shift / pad X · jump: Space / Enter / pad A · F1 debug
          </div>
        </div>
      )}

      {/* ----------------------------- MENU ----------------------------- */}
      {phase === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#FDF3E1]/60 p-4 backdrop-blur-[2px]">
          <Card className="w-full max-w-xl border-[3px] border-[#4A3B32] bg-[#FFF9EC] shadow-xl">
            <CardContent className="p-6 sm:p-8">
              <div className="text-center">
                <h1
                  className="text-5xl font-black tracking-tight text-[#4A3B32] sm:text-6xl"
                  style={{ textShadow: '3px 3px 0 #FFD98A' }}
                >
                  Jelly Movers
                </h1>
                <p className="mt-2 text-sm font-bold text-[#4A3B32]/60 sm:text-base">
                  the wobbliest moving company in town — 1 to 4 squishy players
                </p>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {(snap?.slots ?? []).map((s) => (
                  <SlotCard key={s.index} {...s} />
                ))}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-2 text-xs font-semibold text-[#4A3B32]/75 sm:grid-cols-3">
                <div className="flex items-center gap-2 rounded-lg border-2 border-[#4A3B32]/15 bg-white/50 px-3 py-2">
                  <Keyboard className="h-4 w-4 shrink-0" />
                  <span>P1: WASD + Space + E</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border-2 border-[#4A3B32]/15 bg-white/50 px-3 py-2">
                  <Keyboard className="h-4 w-4 shrink-0" />
                  <span>P2: Arrows + Enter + Shift</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border-2 border-[#4A3B32]/15 bg-white/50 px-3 py-2">
                  <Gamepad2 className="h-4 w-4 shrink-0" />
                  <span>Pads: any button joins</span>
                </div>
              </div>

              <div className="mt-6 flex flex-col items-center gap-3">
                <Button
                  size="lg"
                  disabled={!snap?.canStart}
                  onClick={startRound}
                  className="h-14 w-full max-w-xs rounded-2xl border-[3px] border-[#4A3B32] bg-[#FF6B6B] px-8 text-xl font-black text-white shadow-md hover:bg-[#F45B5B] disabled:opacity-40"
                >
                  <Play className="mr-2 h-6 w-6" />
                  Start Moving!
                </Button>
                <p className="text-center text-xs font-bold text-[#4A3B32]/55">
                  carry the box, couch &amp; piano into the truck · the lamp is
                  up on the shelf — stack your blobs to reach it
                  <br />
                  3 minutes on the clock · hard landings cost you pay
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* --------------------------- END SCREEN -------------------------- */}
      {phase === 'ended' && snap?.result && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#FDF3E1]/70 p-4 backdrop-blur-[2px]">
          <Card className="w-full max-w-lg border-[3px] border-[#4A3B32] bg-[#FFF9EC] shadow-xl">
            <CardContent className="p-6 sm:p-8">
              <div className="text-center">
                <h2
                  className={`text-4xl font-black ${
                    snap.result.win ? 'text-[#4A3B32]' : 'text-[#E2725B]'
                  }`}
                  style={{ textShadow: '2px 2px 0 #FFD98A' }}
                >
                  {snap.result.win ? 'Job Complete!' : "Time's Up!"}
                </h2>
                <p className="mt-1 text-sm font-bold text-[#4A3B32]/60">
                  {snap.result.win
                    ? 'everything squished safely into the truck'
                    : 'the clock beat the wobble — unfinished items pay nothing'}
                </p>
              </div>

              <div className="mt-5 space-y-2">
                {snap.items.map((item) => (
                  <ItemRow key={item.kind} item={item} />
                ))}
              </div>

              <div className="mt-5 space-y-1.5 rounded-xl border-2 border-[#4A3B32]/15 bg-white/60 p-4 text-sm font-bold text-[#4A3B32]">
                <div className="flex justify-between">
                  <span>Item pay (damage-adjusted)</span>
                  <span className="tabular-nums">${snap.result.basePay}</span>
                </div>
                <div className="flex justify-between">
                  <span>Speed bonus</span>
                  <span className="tabular-nums">
                    {snap.result.win ? `+ $${snap.result.timeBonus}` : '+ $0'}
                  </span>
                </div>
                <div className="flex justify-between border-t-2 border-[#4A3B32]/15 pt-2 text-lg">
                  <span>Final pay</span>
                  <span className="tabular-nums text-[#7DB84E]">
                    ${snap.result.totalPay}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                <Button
                  size="lg"
                  onClick={restart}
                  className="h-12 rounded-2xl border-[3px] border-[#4A3B32] bg-[#FF6B6B] px-8 text-lg font-black text-white shadow-md hover:bg-[#F45B5B]"
                >
                  <RotateCcw className="mr-2 h-5 w-5" />
                  Play Again
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={toMenu}
                  className="h-12 rounded-2xl border-[3px] border-[#4A3B32] bg-white px-6 text-lg font-bold text-[#4A3B32] hover:bg-[#FFF3D6]"
                >
                  Back to Menu
                </Button>
              </div>
              <p className="mt-3 text-center text-xs font-bold text-[#4A3B32]/50">
                press Enter or Space to play again
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* tiny corner hint (always visible) */}
      <div className="pointer-events-none absolute bottom-2 right-3 hidden items-center gap-1 text-[10px] font-bold text-[#4A3B32]/35 sm:flex">
        <Bug className="h-3 w-3" /> F1 = physics debug
      </div>
    </div>
  );
}
