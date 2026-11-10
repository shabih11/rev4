// Shoe names follow the source avatar numbering. Bundles are administrative previews.
export const bundledAvatarPrice = 300;
export const bundledAvatarShoes = [
  "Nike V2K Run",
  "Nike Vomero 5",
  "New Balance 530",
  "Adidas Ultraboost",
  "ASICS GEL-1130",
  "Nike P-6000",
  "On Cloud 6",
  "New Balance 1906R",
  "ASICS GEL-KAYANO 14",
  "Nike Initiator",
  "Adidas Puremotion 2.0",
  "New Balance 2002R",
  "On Cloudtilt",
  "Nike Motiva",
  "ASICS GT-2160",
  "Adidas Supernova Rise",
  "New Balance Fresh Foam X 1080",
  "Nike Pegasus",
  "HOKA Clifton",
  "On Cloudnova 2",
  "ASICS GEL-NYC",
  "Adidas Duramo SL",
  "New Balance 9060",
  "Nike Revolution",
  "HOKA Bondi",
  "Puma RS-X",
  "Skechers GO WALK Arch Fit",
  "New Balance Fresh Foam Arishi",
  "Salomon XT-6",
  "Adidas NMD_R1"
];

const abayaThemes = [
  'الليل', 'المساء', 'المها', 'الأصيل', 'المسك', 'العنبر', 'العقيق', 'الألماس',
  'اللؤلؤ', 'الزمرد', 'الياقوت', 'الندى', 'الغيم', 'الدجى', 'الحرير', 'السندس',
  'الرقي', 'الأناقة', 'الهيبة', 'الوقار', 'الفخامة', 'الوسن', 'السراب', 'السكون',
  'النخيل', 'الواحة', 'الرياض', 'نجد', 'الحجاز', 'الدرعية',
];
const abayaNamePrefixes = ['ترف', 'هالة', 'سحر', 'همس', 'رونق', 'ألق'];
export const bundledAvatarNames = abayaThemes.map(theme => abayaNamePrefixes.map(prefix => `${prefix} ${theme}`));
