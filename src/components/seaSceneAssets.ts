import type { SeaLight, SeaScene } from '../lib/seaScene';
import sunnyDesktop from '../assets/sea/ocean-sunny-desktop.webp';
import sunnyMobile from '../assets/sea/ocean-sunny-mobile.webp';
import softDesktop from '../assets/sea/ocean-soft-desktop.webp';
import softMobile from '../assets/sea/ocean-soft-mobile.webp';
import nightDesktop from '../assets/sea/ocean-night-desktop.webp';
import nightMobile from '../assets/sea/ocean-night-mobile.webp';
import gallery_sleep from '../assets/sea/scenarios/gallery-sleep.webp';
import gallery_coffee from '../assets/sea/scenarios/gallery-coffee.webp';
import gallery_adventure from '../assets/sea/scenarios/gallery-adventure.webp';
import gallery_celebrate from '../assets/sea/scenarios/gallery-celebrate.webp';
import gallery_distress from '../assets/sea/scenarios/gallery-distress.webp';
import daview_sleep from '../assets/sea/scenarios/daview-sleep.webp';
import daview_coffee from '../assets/sea/scenarios/daview-coffee.webp';
import daview_adventure from '../assets/sea/scenarios/daview-adventure.webp';
import daview_celebrate from '../assets/sea/scenarios/daview-celebrate.webp';
import daview_distress from '../assets/sea/scenarios/daview-distress.webp';
import salam_sleep from '../assets/sea/scenarios/salam-sleep.webp';
import salam_coffee from '../assets/sea/scenarios/salam-coffee.webp';
import salam_adventure from '../assets/sea/scenarios/salam-adventure.webp';
import salam_celebrate from '../assets/sea/scenarios/salam-celebrate.webp';
import salam_distress from '../assets/sea/scenarios/salam-distress.webp';
import qasr_sleep from '../assets/sea/scenarios/qasr-sleep.webp';
import qasr_coffee from '../assets/sea/scenarios/qasr-coffee.webp';
import qasr_adventure from '../assets/sea/scenarios/qasr-adventure.webp';
import qasr_celebrate from '../assets/sea/scenarios/qasr-celebrate.webp';
import qasr_distress from '../assets/sea/scenarios/qasr-distress.webp';
import kingdom_sleep from '../assets/sea/scenarios/kingdom-sleep.webp';
import kingdom_coffee from '../assets/sea/scenarios/kingdom-coffee.webp';
import kingdom_adventure from '../assets/sea/scenarios/kingdom-adventure.webp';
import kingdom_celebrate from '../assets/sea/scenarios/kingdom-celebrate.webp';
import kingdom_distress from '../assets/sea/scenarios/kingdom-distress.webp';
import east_sleep from '../assets/sea/scenarios/east-sleep.webp';
import east_coffee from '../assets/sea/scenarios/east-coffee.webp';
import east_adventure from '../assets/sea/scenarios/east-adventure.webp';
import east_celebrate from '../assets/sea/scenarios/east-celebrate.webp';
import east_distress from '../assets/sea/scenarios/east-distress.webp';

export const SEA_BACKDROPS: Record<SeaLight, { desktop: string; mobile: string }> = {
  sunny: { desktop: sunnyDesktop, mobile: sunnyMobile },
  soft: { desktop: softDesktop, mobile: softMobile },
  night: { desktop: nightDesktop, mobile: nightMobile },
};

export const SEA_SCENE_ASSETS: Record<string, Record<SeaScene, string>> = {
  'جاليري': { sleep: gallery_sleep, coffee: gallery_coffee, adventure: gallery_adventure, celebrate: gallery_celebrate, distress: gallery_distress },
  'ذافيو': { sleep: daview_sleep, coffee: daview_coffee, adventure: daview_adventure, celebrate: daview_celebrate, distress: daview_distress },
  'سلام': { sleep: salam_sleep, coffee: salam_coffee, adventure: salam_adventure, celebrate: salam_celebrate, distress: salam_distress },
  'القصر': { sleep: qasr_sleep, coffee: qasr_coffee, adventure: qasr_adventure, celebrate: qasr_celebrate, distress: qasr_distress },
  'المملكة': { sleep: kingdom_sleep, coffee: kingdom_coffee, adventure: kingdom_adventure, celebrate: kingdom_celebrate, distress: kingdom_distress },
  'شرق': { sleep: east_sleep, coffee: east_coffee, adventure: east_adventure, celebrate: east_celebrate, distress: east_distress },
};
