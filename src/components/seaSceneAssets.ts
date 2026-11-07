import gallery_wreck_0 from '../assets/sea/scenarios/gallery-wreck-overturned.webp';
import gallery_wreck_1 from '../assets/sea/scenarios/gallery-wreck-half-submerged.webp';
import gallery_wreck_2 from '../assets/sea/scenarios/gallery-wreck-broken-sails.webp';
import gallery_wreck_3 from '../assets/sea/scenarios/gallery-wreck-vertical.webp';
import daview_wreck_0 from '../assets/sea/scenarios/daview-wreck-overturned.webp';
import daview_wreck_1 from '../assets/sea/scenarios/daview-wreck-half-submerged.webp';
import daview_wreck_2 from '../assets/sea/scenarios/daview-wreck-broken-sails.webp';
import daview_wreck_3 from '../assets/sea/scenarios/daview-wreck-vertical.webp';
import salam_wreck_0 from '../assets/sea/scenarios/salam-wreck-overturned.webp';
import salam_wreck_1 from '../assets/sea/scenarios/salam-wreck-half-submerged.webp';
import salam_wreck_2 from '../assets/sea/scenarios/salam-wreck-broken-sails.webp';
import salam_wreck_3 from '../assets/sea/scenarios/salam-wreck-vertical.webp';
import qasr_wreck_0 from '../assets/sea/scenarios/qasr-wreck-overturned.webp';
import qasr_wreck_1 from '../assets/sea/scenarios/qasr-wreck-half-submerged.webp';
import qasr_wreck_2 from '../assets/sea/scenarios/qasr-wreck-broken-sails.webp';
import qasr_wreck_3 from '../assets/sea/scenarios/qasr-wreck-vertical.webp';
import kingdom_wreck_0 from '../assets/sea/scenarios/kingdom-wreck-overturned.webp';
import kingdom_wreck_1 from '../assets/sea/scenarios/kingdom-wreck-half-submerged.webp';
import kingdom_wreck_2 from '../assets/sea/scenarios/kingdom-wreck-broken-sails.webp';
import kingdom_wreck_3 from '../assets/sea/scenarios/kingdom-wreck-vertical.webp';
import east_wreck_0 from '../assets/sea/scenarios/east-wreck-overturned.webp';
import east_wreck_1 from '../assets/sea/scenarios/east-wreck-half-submerged.webp';
import east_wreck_2 from '../assets/sea/scenarios/east-wreck-broken-sails.webp';
import east_wreck_3 from '../assets/sea/scenarios/east-wreck-vertical.webp';
import { seaWreckVariant, type SeaLight, type SeaScene } from '../lib/seaScene';
import type { SeaBranch } from '../lib/seaMission';
import rescue from '../assets/sea/scenarios/rescue.webp';
import sunnyDesktop from '../assets/sea/ocean-sunny-desktop.webp';
import sunnyMobile from '../assets/sea/ocean-sunny-mobile.webp';
import softDesktop from '../assets/sea/ocean-soft-desktop.webp';
import softMobile from '../assets/sea/ocean-soft-mobile.webp';
import nightDesktop from '../assets/sea/ocean-night-desktop.webp';
import nightMobile from '../assets/sea/ocean-night-mobile.webp';
import gallery_sleep from '../assets/sea/scenarios/gallery-sleep.webp';
import gallery_coffee from '../assets/sea/scenarios/gallery-coffee.webp';
import gallery_adventure from '../assets/sea/scenarios/gallery-adventure.webp';
import gallery_halfway from '../assets/sea/scenarios/gallery-halfway.webp';
import gallery_celebrate from '../assets/sea/scenarios/gallery-celebrate.webp';
import gallery_distress from '../assets/sea/scenarios/gallery-distress.webp';
import gallery_capsized from '../assets/sea/scenarios/gallery-capsized.webp';
import daview_sleep from '../assets/sea/scenarios/daview-sleep.webp';
import daview_coffee from '../assets/sea/scenarios/daview-coffee.webp';
import daview_adventure from '../assets/sea/scenarios/daview-adventure.webp';
import daview_halfway from '../assets/sea/scenarios/daview-halfway.webp';
import daview_celebrate from '../assets/sea/scenarios/daview-celebrate.webp';
import daview_distress from '../assets/sea/scenarios/daview-distress.webp';
import daview_capsized from '../assets/sea/scenarios/daview-capsized.webp';
import salam_sleep from '../assets/sea/scenarios/salam-sleep.webp';
import salam_coffee from '../assets/sea/scenarios/salam-coffee.webp';
import salam_adventure from '../assets/sea/scenarios/salam-adventure.webp';
import salam_halfway from '../assets/sea/scenarios/salam-halfway.webp';
import salam_celebrate from '../assets/sea/scenarios/salam-celebrate.webp';
import salam_distress from '../assets/sea/scenarios/salam-distress.webp';
import salam_capsized from '../assets/sea/scenarios/salam-capsized.webp';
import qasr_sleep from '../assets/sea/scenarios/qasr-sleep.webp';
import qasr_coffee from '../assets/sea/scenarios/qasr-coffee.webp';
import qasr_adventure from '../assets/sea/scenarios/qasr-adventure.webp';
import qasr_halfway from '../assets/sea/scenarios/qasr-halfway.webp';
import qasr_celebrate from '../assets/sea/scenarios/qasr-celebrate.webp';
import qasr_distress from '../assets/sea/scenarios/qasr-distress.webp';
import qasr_capsized from '../assets/sea/scenarios/qasr-capsized.webp';
import kingdom_sleep from '../assets/sea/scenarios/kingdom-sleep.webp';
import kingdom_coffee from '../assets/sea/scenarios/kingdom-coffee.webp';
import kingdom_adventure from '../assets/sea/scenarios/kingdom-adventure.webp';
import kingdom_halfway from '../assets/sea/scenarios/kingdom-halfway.webp';
import kingdom_celebrate from '../assets/sea/scenarios/kingdom-celebrate.webp';
import kingdom_distress from '../assets/sea/scenarios/kingdom-distress.webp';
import kingdom_capsized from '../assets/sea/scenarios/kingdom-capsized.webp';
import east_sleep from '../assets/sea/scenarios/east-sleep.webp';
import east_coffee from '../assets/sea/scenarios/east-coffee.webp';
import east_adventure from '../assets/sea/scenarios/east-adventure.webp';
import east_halfway from '../assets/sea/scenarios/east-halfway.webp';
import east_celebrate from '../assets/sea/scenarios/east-celebrate.webp';
import east_distress from '../assets/sea/scenarios/east-distress.webp';
import east_capsized from '../assets/sea/scenarios/east-capsized.webp';

export const SEA_BACKDROPS: Record<SeaLight, { desktop: string; mobile: string }> = {
  sunny: { desktop: sunnyDesktop, mobile: sunnyMobile },
  soft: { desktop: softDesktop, mobile: softMobile },
  dusk: { desktop: softDesktop, mobile: softMobile },
  night: { desktop: nightDesktop, mobile: nightMobile },
};

export const SEA_SCENE_ASSETS: Record<string, Record<SeaScene, string>> = {
  'جاليري': { sleep: gallery_sleep, coffee: gallery_coffee, adventure: gallery_adventure, halfway: gallery_halfway, celebrate: gallery_celebrate, distress: gallery_distress, capsized: gallery_capsized, rescue, wreck: gallery_wreck_0 },
  'ذافيو': { sleep: daview_sleep, coffee: daview_coffee, adventure: daview_adventure, halfway: daview_halfway, celebrate: daview_celebrate, distress: daview_distress, capsized: daview_capsized, rescue, wreck: daview_wreck_0 },
  'سلام': { sleep: salam_sleep, coffee: salam_coffee, adventure: salam_adventure, halfway: salam_halfway, celebrate: salam_celebrate, distress: salam_distress, capsized: salam_capsized, rescue, wreck: salam_wreck_0 },
  'القصر': { sleep: qasr_sleep, coffee: qasr_coffee, adventure: qasr_adventure, halfway: qasr_halfway, celebrate: qasr_celebrate, distress: qasr_distress, capsized: qasr_capsized, rescue, wreck: qasr_wreck_0 },
  'المملكة': { sleep: kingdom_sleep, coffee: kingdom_coffee, adventure: kingdom_adventure, halfway: kingdom_halfway, celebrate: kingdom_celebrate, distress: kingdom_distress, capsized: kingdom_capsized, rescue, wreck: kingdom_wreck_0 },
  'شرق': { sleep: east_sleep, coffee: east_coffee, adventure: east_adventure, halfway: east_halfway, celebrate: east_celebrate, distress: east_distress, capsized: east_capsized, rescue, wreck: east_wreck_0 },
};

const SEA_WRECK_ASSETS: Record<string, readonly string[]> = {
  'جاليري': [gallery_wreck_0, gallery_wreck_1, gallery_wreck_2, gallery_wreck_3],
  'ذافيو': [daview_wreck_0, daview_wreck_1, daview_wreck_2, daview_wreck_3],
  'سلام': [salam_wreck_0, salam_wreck_1, salam_wreck_2, salam_wreck_3],
  'القصر': [qasr_wreck_0, qasr_wreck_1, qasr_wreck_2, qasr_wreck_3],
  'المملكة': [kingdom_wreck_0, kingdom_wreck_1, kingdom_wreck_2, kingdom_wreck_3],
  'شرق': [east_wreck_0, east_wreck_1, east_wreck_2, east_wreck_3],
};

export function seaSceneAsset(branch: SeaBranch, scene: SeaScene, now: number) {
  return scene === 'wreck' ? SEA_WRECK_ASSETS[branch.name][seaWreckVariant(branch, now)] : SEA_SCENE_ASSETS[branch.name][scene];
}
