import Image from 'next/image';

/**
 * Avatar with a real fallback: the account's initial on a hue derived from its
 * id, so every account without a picture still looks like a distinct person
 * rather than the same grey silhouette repeated down the timeline.
 */
export function Avatar({
  src,
  name,
  seed,
  size = 40,
  className = '',
}: {
  src?: string | null;
  name?: string | null;
  seed: string;
  size?: number;
  className?: string;
}) {
  const label = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  const hue = hueFromSeed(seed);

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center font-semibold text-black"
          style={{
            background: `linear-gradient(145deg, hsl(${hue} 70% 62%), hsl(${(hue + 38) % 360} 68% 44%))`,
            fontSize: size * 0.42,
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

function hueFromSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  return hash;
}
