'use client';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-mario-bg">
      {/* Spinner */}
      <div className="loading-spinner">
        <div className="line"></div>
        <div className="line"></div>
        <div className="line"></div>
        <div className="line"></div>
        <div className="line"></div>
        <div className="line"></div>
      </div>

      {/* Logo text */}
      <div className="mt-8 text-center">
        <p className="font-arcade text-mario-yellow text-sm tracking-widest animate-pulse">
          MURAGOODS
        </p>
        <p className="font-arcade text-mario-text-muted text-[8px] mt-2 tracking-wider">
          LOADING POWER-UPS...
        </p>
      </div>

      {/* Decorative dots */}
      <div className="mt-6 flex gap-2">
        <span className="w-2 h-2 rounded-full bg-mario-yellow animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 rounded-full bg-mario-red animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 rounded-full bg-mario-green animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}
