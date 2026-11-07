export const gems = {
  amber: { name: 'الكهرمان', color: '#be8416' },
  pearl: { name: 'اللؤلؤ', color: '#64748b' },
  emerald: { name: 'الزمرد', color: '#08765b' },
  sapphire: { name: 'الياقوت الأزرق', color: '#255cc0' },
  rose: { name: 'الكوارتز الوردي', color: '#b54471' },
  amethyst: { name: 'الجمشت', color: '#8051b0' },
} as const;
export type Gem = keyof typeof gems;
export interface MagicSettings { boxes: boolean; themes: boolean; price: number }
export interface MagicState { settings: MagicSettings; owned: { gem: Gem; count: number }[]; equipped: Record<string, Gem>; selected: Gem | null }
export function gemTheme(state: MagicState | null | undefined, employeeId: string): Gem | undefined {
  const gem = state?.equipped[employeeId];
  return state?.settings.themes && gem && Object.hasOwn(gems, gem) ? gem : undefined;
}
