'use client';

export function MarioLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <div className="relative w-14 h-14">
          <div className="absolute top-0 left-2 w-10 h-6 bg-[var(--crimson)] border-2 border-[var(--gold)] shadow-lg" />
          <div className="absolute top-5 left-1 w-12 h-8 bg-[var(--gold)] border-2 border-[var(--gold-dark)] shadow-lg flex items-center justify-center">
            <span className="text-xl font-black text-[var(--obsidian)]">M</span>
          </div>
          <div className="absolute top-11 left-1 w-12 h-3 bg-[#2563EB] border-2 border-[var(--gold)] shadow-lg" />
        </div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--gold-bright)] drop-shadow-lg" style={{ fontFamily: 'var(--font-arcade)' }}>Muragoods</p>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--cream)] drop-shadow-lg">Mario&apos;s Food</p>
      </div>
    </div>
  );
}

export function MarioLogoLarge() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-32 h-32">
        <div className="absolute top-0 left-8 w-16 h-12 bg-[var(--crimson)] border-2 border-[var(--gold)] shadow-2xl flex items-center justify-center">
          <span className="text-4xl font-black text-[var(--cream)]">M</span>
        </div>
        <div className="absolute top-12 left-4 w-24 h-12 bg-[var(--gold)] border-2 border-[var(--gold-dark)] shadow-2xl flex items-center justify-center">
          <span className="text-2xl font-black text-[var(--obsidian)]">M</span>
        </div>
        <div className="absolute top-24 left-4 w-24 h-8 bg-[#2563EB] border-2 border-[var(--gold)] shadow-2xl" />
      </div>
      <div className="text-center">
        <h1 className="text-3xl text-[var(--gold-bright)] uppercase tracking-widest drop-shadow-lg" style={{ fontFamily: 'var(--font-arcade)' }}>Muragoods</h1>
        <p className="text-sm font-semibold uppercase tracking-widest text-[var(--cream)] drop-shadow-lg mt-2">Musubi · Churros · Coffee · Cookies</p>
      </div>
    </div>
  );
}
