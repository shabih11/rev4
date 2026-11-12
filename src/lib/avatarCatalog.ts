import type { AvatarCollection } from './employeeFeatures';

// Catalogue art always previews the included gold style. Equipped avatars keep
// their independently resolved path and entitlement state.
export function avatarCatalog(collections: AvatarCollection[]): AvatarCollection[] {
  const premium = (collection: AvatarCollection) => collection.name.trim().toLowerCase() === 'lv olympia';
  return collections.map(collection => ({ ...collection, variants: collection.variants.map(variant => ({ ...variant,
    imagePath: premium(collection)
      ? variant.imagePath?.replace('saudi-abaya-lv-olympia-v1/', 'saudi-abaya-lv-olympia-gold-v1/') ?? variant.imagePath
      : variant.imagePath,
  })) })).sort((a, b) => Number(premium(b)) - Number(premium(a)));
}
