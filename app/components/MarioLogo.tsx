'use client';

export function MarioLogo() {
  return (
    <div className="flex items-center gap-3">
      {/* Logo Container */}
      <div className="relative">
        {/* Mario-style colored boxes for logo */}
        <div className="relative w-14 h-14">
          {/* Red box (Mario hat) */}
          <div className="absolute top-0 left-2 w-10 h-6 bg-red-600 border-2 border-black rounded-sm shadow-lg"></div>
          
          {/* Flesh tone box (Mario face) */}
          <div className="absolute top-5 left-1 w-12 h-8 bg-yellow-200 border-2 border-black rounded-sm shadow-lg flex items-center justify-center">
            <span className="text-xl font-black">M</span>
          </div>
          
          {/* Blue overalls indicator */}
          <div className="absolute top-11 left-1 w-12 h-3 bg-blue-600 border-2 border-black rounded-sm shadow-lg"></div>
        </div>
      </div>

      {/* Text */}
      <div>
        <p className="text-sm font-black uppercase tracking-widest text-yellow-300 drop-shadow-lg">Muragoods</p>
        <p className="text-xs font-bold uppercase tracking-widest text-white drop-shadow-lg">Mario&apos;s Food</p>
      </div>
    </div>
  );
}

export function MarioLogoLarge() {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* Large Mario-style logo */}
      <div className="relative w-32 h-32">
        {/* Red box (Mario hat) */}
        <div className="absolute top-0 left-8 w-16 h-12 bg-red-600 border-4 border-black rounded-lg shadow-2xl flex items-center justify-center">
          <span className="text-4xl font-black">M</span>
        </div>
        
        {/* Flesh tone box (Mario face) */}
        <div className="absolute top-12 left-4 w-24 h-12 bg-yellow-200 border-4 border-black rounded-lg shadow-2xl flex items-center justify-center">
            <span className="text-2xl font-black">M</span>
        </div>
        
        {/* Blue overalls */}
        <div className="absolute top-24 left-4 w-24 h-8 bg-blue-600 border-4 border-black rounded-lg shadow-2xl"></div>
      </div>

      {/* Text */}
      <div className="text-center">
        <h1 className="text-4xl font-black uppercase tracking-widest text-yellow-300 drop-shadow-lg">Muragoods</h1>
        <p className="text-sm font-bold uppercase tracking-widest text-white drop-shadow-lg mt-2">Musubi • Churros • Coffee • Cookies</p>
      </div>
    </div>
  );
}
