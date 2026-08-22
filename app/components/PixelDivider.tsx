'use client';

/**
 * 8-Bit Pixel-Art Section Dividers
 *
 * A collection of decorative dividers that blend Art Deco ziggurat geometry
 * with classic Super Mario pixel art. Use between content sections to
 * reinforce the "Gatsby Arcade" identity.
 *
 * Variants:
 *   - coinChain   : Gold pixel coins connected by dots
 *   - ziggurat    : Stepped pyramid / Art Deco ziggurat silhouette
 *   - questionBlocks : Row of 8-bit question-mark blocks
 *   - pipeSegment : Green warp pipes alternating with gold bricks
 *   - starBurst   : Centered pixel star with radiating lines
 *   - brickRow    : Alternating Mario ground-block bricks
 */

type DividerVariant =
  | 'coinChain'
  | 'ziggurat'
  | 'questionBlocks'
  | 'pipeSegment'
  | 'starBurst'
  | 'brickRow';

interface PixelDividerProps {
  variant?: DividerVariant;
  /** Optional vertical spacing */
  className?: string;
}

/* ─── Individual Variant Renderers ────────────────────────────── */

function CoinChain() {
  return (
    <div className="w-full flex items-center justify-center gap-1 py-2">
      {Array.from({ length: 15 }).map((_, i) => (
        <span key={i} className="flex items-center">
          {/* Coin */}
          <span
            className="inline-block w-3 h-3 bg-[var(--gold)] border border-[var(--gold-dark)]"
            style={{
              boxShadow: '0 0 6px rgba(212,175,55,0.3)',
            }}
          />
          {/* Connector dot (skip last) */}
          {i < 14 && (
            <span className="inline-block w-1 h-1 bg-[var(--gold-dark)] mx-0.5" />
          )}
        </span>
      ))}
    </div>
  );
}

function Ziggurat() {
  /* Art Deco stepped pyramid — symmetric, centered */
  const steps = [1, 3, 5, 7, 9, 7, 5, 3, 1];
  return (
    <div className="w-full flex flex-col items-center py-3 gap-0">
      {steps.map((width, row) => (
        <div
          key={row}
          className="bg-[var(--gold)]"
          style={{
            width: `${width * 8}px`,
            height: '4px',
            marginTop: row === 0 ? 0 : '2px',
            opacity: 0.4 + (row / steps.length) * 0.6,
          }}
        />
      ))}
      {/* Center accent dot */}
      <div className="w-2 h-2 bg-[var(--gold-bright)] mt-2" style={{ boxShadow: '0 0 8px rgba(212,175,55,0.5)' }} />
    </div>
  );
}

function QuestionBlocks() {
  return (
    <div className="w-full flex items-center justify-center gap-2 py-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="w-6 h-6 bg-[var(--charcoal-light)] border-2 border-[var(--gold)] flex items-center justify-center"
          style={{
            boxShadow: 'inset 0 0 0 1px rgba(212,175,55,0.2)',
          }}
        >
          <span
            className="text-[8px] text-[var(--gold-bright)] leading-none"
            style={{ fontFamily: 'var(--font-arcade)' }}
          >
            ?
          </span>
        </div>
      ))}
    </div>
  );
}

function PipeSegment() {
  return (
    <div className="w-full flex items-center justify-center gap-0 py-2">
      {/* Left pipe cap */}
      <div className="w-4 h-6 bg-[var(--emerald)] border-2 border-[var(--emerald-bright)]" />
      {/* Pipe body segments with gold bricks */}
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="flex items-center">
          <div
            className="w-8 h-3 border border-[rgba(242,240,228,0.08)]"
            style={{
              background: i % 2 === 0
                ? 'var(--emerald)'
                : 'var(--gold-dark)',
              borderColor: i % 2 === 0
                ? 'var(--emerald-bright)'
                : 'var(--gold)',
              height: i % 3 === 1 ? '5px' : '3px',
            }}
          />
          {i < 8 && <span className="w-0.5 h-1 bg-[var(--charcoal-mid)]" />}
        </span>
      ))}
      {/* Right pipe cap */}
      <div className="w-4 h-6 bg-[var(--emerald)] border-2 border-[var(--emerald-bright)]" />
    </div>
  );
}

function StarBurst() {
  return (
    <div className="w-full flex items-center justify-center py-3">
      <div className="flex items-center gap-0">
        {/* Left ray */}
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`l${i}`}
              className="bg-[var(--gold)]"
              style={{
                width: `${6 - i}px`,
                height: '2px',
                opacity: 0.2 + i * 0.14,
              }}
            />
          ))}
        </div>

        {/* Center star */}
        <div
          className="w-4 h-4 bg-[var(--gold-bright)] mx-1 flex items-center justify-center"
          style={{
            clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
            filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.5))',
          }}
        />

        {/* Right ray */}
        <div className="flex items-center gap-0.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`r${i}`}
              className="bg-[var(--gold)]"
              style={{
                width: `${i + 1}px`,
                height: '2px',
                opacity: 0.8 - i * 0.12,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BrickRow() {
  return (
    <div className="w-full py-2 overflow-hidden">
      <div className="flex items-stretch justify-center">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex flex-col">
            {/* Top brick */}
            <div
              className="w-5 h-2.5 border border-[var(--gold-dark)]"
              style={{
                background: i % 2 === 0
                  ? 'rgba(212,175,55,0.15)'
                  : 'rgba(212,175,55,0.08)',
              }}
            />
            {/* Bottom brick (offset) */}
            <div
              className="w-5 h-2.5 border border-[var(--gold-dark)] -mt-px"
              style={{
                background: i % 2 === 0
                  ? 'rgba(212,175,55,0.08)'
                  : 'rgba(212,175,55,0.15)',
                marginLeft: i % 2 === 0 ? '-2.5px' : '0',
                width: 'calc(1.25rem + 2.5px)',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────── */

const variantMap: Record<DividerVariant, React.FC> = {
  coinChain: CoinChain,
  ziggurat: Ziggurat,
  questionBlocks: QuestionBlocks,
  pipeSegment: PipeSegment,
  starBurst: StarBurst,
  brickRow: BrickRow,
};

export function PixelDivider({ variant = 'coinChain', className = '' }: PixelDividerProps) {
  const VariantComponent = variantMap[variant];

  return (
    <div
      className={`w-full select-none ${className}`}
      role="separator"
      aria-hidden="true"
    >
      <VariantComponent />
    </div>
  );
}
