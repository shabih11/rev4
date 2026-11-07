import { gems, type Gem } from '../lib/gems';
export function StoreGem({ gem, className = '' }: { gem: Gem; className?: string }) {
  const color = gems[gem].color;
  return <svg viewBox="0 0 80 100" role="img" aria-label={gems[gem].name} className={`store-gem ${className}`}><path d="M40 3 76 43 40 97 4 43Z" fill={color}/><path d="M40 3 23 43h34Z" fill="#fff" opacity=".65"/><path d="M4 43h19L40 97Z" fill="#fff" opacity=".25"/><path d="M57 43h19L40 97Z" fill="#172033" opacity=".35"/><path d="M23 43h34L40 97Z" fill="#fff" opacity=".1"/></svg>;
}
