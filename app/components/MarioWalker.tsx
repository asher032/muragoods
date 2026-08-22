'use client';

import { useEffect, useState } from 'react';

interface MarioWalkerProps {
  /** Current status index (0-4) or -1 for cancelled */
  currentStage: number;
  /** Whether the order is cancelled */
  isCancelled?: boolean;
  /** Array of status labels for each stage */
  stages?: string[];
}

export function MarioWalker({
  currentStage,
  isCancelled = false,
  stages = ['Pending Payment', 'Payment Verified', 'Preparing', 'Out for Delivery', 'Delivered'],
}: MarioWalkerProps) {
  const [position, setPosition] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);

  // Animate Mario to the correct position after mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isCancelled || currentStage < 0) {
        setPosition(0);
      } else {
        const pos = (currentStage / (stages.length - 1)) * 100;
        setPosition(pos);
      }
      setHasAnimated(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [currentStage, isCancelled, stages.length]);

  const isWalking = hasAnimated && !isCancelled && currentStage > 0;
  const isAtEnd = currentStage === stages.length - 1 && !isCancelled;

  return (
    <div className="mario-walker-container relative w-full overflow-hidden rounded-xl border-2 border-[var(--gold)] bg-[var(--charcoal)]">
      {/* Sky / Background */}
      <div className="relative h-28 sm:h-32 w-full" style={{ background: 'linear-gradient(180deg, #0A0A0A 0%, #141414 60%, #1E1E1E 100%)' }}>

        {/* Pipe Track */}
        <div className="absolute bottom-4 left-0 right-0 h-3 bg-[var(--emerald)] border-y-2 border-[var(--emerald-bright)]" />

        {/* Pipe Start (left cap) */}
        <div className="absolute bottom-1 left-2 w-5 h-6 bg-[var(--emerald)] border-2 border-[var(--emerald-bright)] rounded-sm shadow-[0_2px_8px_rgba(30,61,47,0.5)]" />
        <div className="absolute bottom-1 left-1 w-3 h-8 bg-[var(--emerald)] border-2 border-[var(--emerald-bright)] rounded-sm" />

        {/* Pipe End (right cap) — Flag */}
        <div className="absolute bottom-1 right-2 w-5 h-6 bg-[var(--emerald)] border-2 border-[var(--emerald-bright)] rounded-sm shadow-[0_2px_8px_rgba(30,61,47,0.5)]" />
        <div className="absolute bottom-1 right-1 w-3 h-8 bg-[var(--emerald)] border-2 border-[var(--emerald-bright)] rounded-sm" />

        {/* Flag pole */}
        <div className="absolute bottom-7 right-3 w-[2px] h-10 bg-[var(--cream)]" />
        {/* Flag */}
        <div className="absolute bottom-[4.5rem] right-3">
          <div className="w-4 h-3 bg-[var(--gold)] border border-[var(--gold-dark)]" />
        </div>

        {/* Stage Markers — Question blocks along the pipe */}
        {stages.map((stage, i) => {
          const left = (i / (stages.length - 1)) * 100;
          const stageActive = !isCancelled && i <= currentStage;
          const isCurrent = i === currentStage && !isCancelled;
          return (
            <div
              key={stage}
              className="absolute flex flex-col items-center"
              style={{ left: `${left}%`, bottom: '28px', transform: 'translateX(-50%)' }}
            >
              {/* Stage block */}
              <div
                className={`w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center border-2 transition-all duration-500 ${
                  isCurrent
                    ? 'border-[var(--gold-bright)] bg-[var(--gold)] shadow-[0_0_15px_rgba(212,175,55,0.5)] pulse-badge'
                    : stageActive
                    ? 'border-[var(--gold)] bg-[rgba(212,175,55,0.3)]'
                    : 'border-[rgba(242,240,228,0.2)] bg-[var(--charcoal-light)]'
                }`}
                style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px' }}
              >
                {isCurrent ? '★' : stageActive ? '✓' : '?'}
              </div>
              {/* Stage label */}
              <p
                className={`mt-1 text-[7px] sm:text-[8px] uppercase tracking-wider leading-tight text-center whitespace-nowrap ${
                  stageActive ? 'text-[var(--gold)]' : 'text-[var(--pewter)]'
                }`}
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                {stage.split(' ').slice(-1)[0]}
              </p>
            </div>
          );
        })}

        {/* Pixel Mario Character */}
        <div
          className="absolute transition-all ease-in-out"
          style={{
            left: `${position}%`,
            bottom: '28px',
            transform: `translateX(-50%) translateX(-14px)`,
            transitionDuration: hasAnimated ? '2s' : '0.4s',
            transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <div className={`relative ${isWalking ? 'mario-walk' : ''} ${isAtEnd ? 'mario-celebrate' : ''}`}>
            {/* Mario built from CSS pixel blocks */}
            <div className="relative" style={{ width: '28px', height: '32px' }}>
              {/* Hat */}
              <div className="absolute top-0 left-1 w-5 h-2 bg-[var(--crimson)] border border-[var(--crimson-dark)]" />
              <div className="absolute top-0 left-3 w-4 h-1 bg-[var(--crimson)]" />

              {/* Face */}
              <div className="absolute top-2 left-1 w-5 h-3 bg-[#F4C7A0] border border-[#D4A574]" />

              {/* Eyes */}
              <div className="absolute top-[10px] left-[8px] w-[3px] h-[3px] bg-[var(--obsidian)]" />

              {/* Mustache */}
              <div className="absolute top-[13px] left-[6px] w-[7px] h-[2px] bg-[#5C3A1E]" />

              {/* Body / Overalls */}
              <div className="absolute top-[15px] left-1 w-5 h-4 bg-[#2563EB] border border-[#1D4ED8]" />

              {/* Overall buttons */}
              <div className="absolute top-[17px] left-[9px] w-[2px] h-[2px] bg-[var(--gold)]" />
              <div className="absolute top-[17px] left-[13px] w-[2px] h-[2px] bg-[var(--gold)]" />

              {/* Arms */}
              <div className="absolute top-[16px] left-0 w-[3px] h-3 bg-[var(--crimson)]" />
              <div className="absolute top-[16px] right-0 w-[3px] h-3 bg-[var(--crimson)]" />

              {/* Legs */}
              <div className="absolute top-[19px] left-[5px] w-[4px] h-[3px] bg-[#5C3A1E]" />
              <div className="absolute top-[19px] right-[5px] w-[4px] h-[3px] bg-[#5C3A1E]" />

              {/* Shoes */}
              <div className="absolute bottom-0 left-[3px] w-[5px] h-[3px] bg-[var(--crimson)] border border-[var(--crimson-dark)]" />
              <div className="absolute bottom-0 right-[3px] w-[5px] h-[3px] bg-[var(--crimson)] border border-[var(--crimson-dark)]" />

              {/* Gold coin sparkle above head when walking */}
              {isWalking && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 coin-float" style={{ fontSize: '10px' }}>
                  🪙
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Celebration effects at Delivered */}
        {isAtEnd && hasAnimated && (
          <>
            <div className="absolute top-2 left-1/4 text-lg coin-float" style={{ animationDelay: '0s' }}>🎉</div>
            <div className="absolute top-1 right-1/4 text-lg coin-float" style={{ animationDelay: '0.5s' }}>⭐</div>
            <div className="absolute top-3 left-1/2 text-sm coin-float" style={{ animationDelay: '1s' }}>🪙</div>
          </>
        )}

        {/* Cancelled — fallen Mario */}
        {isCancelled && hasAnimated && (
          <div className="absolute bottom-10 left-4 text-center w-full">
            <span className="text-sm" style={{ fontFamily: 'var(--font-arcade)' }}>✖ GAME OVER</span>
          </div>
        )}
      </div>
    </div>
  );
}
