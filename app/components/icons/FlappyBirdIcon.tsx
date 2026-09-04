export default function FlappyBirdIcon({ size = 18, color = 'currentColor', className = '' }: { size?: number; color?: string; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill={color}
      viewBox="0 0 16 16"
      className={className}
      style={{ flexShrink: 0 }}
    >
      <path d="M0 0h16v16H0z" fill="none" />
      <path fill="currentColor" d="M10.743 1a3.26 3.26 0 0 1 3.222 2.778L16 5l-2 1.2V7a6 6 0 0 1-5 5.915V14.5a.5.5 0 0 1-1 0V13H6v1.5a.5.5 0 0 1-1 0V13H2.868a1 1 0 0 1-.832-1.555l1.52-2.28A5.45 5.45 0 0 1 1 4.545c0-.3.245-.545.546-.545H7l1.033-1.55A3.26 3.26 0 0 1 10.743 1M11 3a1 1 0 1 0 0 2a1 1 0 0 0 0-2" />
    </svg>
  );
}
