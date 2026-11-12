import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useData } from '../context/DataContext';
import employeeImg from '../assets/employee.png';
const signedImages = new Map<string, { expires: number; promise: Promise<string | null> }>();
async function signedImage(path: string, account: string) {
  const key = `${account}:${path}`;
  const cached = signedImages.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = supabase.storage.from('avatar-store').createSignedUrl(path, 3600).then(({ data, error }) => {
    if (error || !data?.signedUrl) { signedImages.delete(key); return null; }
    return data.signedUrl;
  }).catch(() => { signedImages.delete(key); return null; });
  signedImages.set(key, { expires: Date.now() + 3300000, promise });
  if (signedImages.size > 300) for (const [entry, value] of signedImages) if (value.expires < Date.now()) signedImages.delete(entry);
  return promise;
}
export function AvatarImage({ path, alt, className = '' }: { path: string | null; alt: string; className?: string }) {
  const { currentAccount } = useData();
  const bundled = path?.startsWith('bundled/') ? `${import.meta.env.BASE_URL}avatars/${path.slice('bundled/'.length)}` : null;
  const accountId = currentAccount?.id || '';
  const [image, setImage] = useState<{ key: string; url: string } | null>(null);
  const key = `${accountId}:${path}`;
  useEffect(() => {
    if (!path || bundled || !accountId) return;
    let active = true;
    void signedImage(path, accountId).then(url => { if (active && url) setImage({ key: `${accountId}:${path}`, url }); });
    return () => { active = false; };
  }, [path, bundled, accountId]);
  return <img src={bundled ?? (image?.key === key ? image.url : employeeImg)} alt={alt} className={className} style={path ? { scale: '0.85 1', transformOrigin: 'center' } : undefined} />;
}
