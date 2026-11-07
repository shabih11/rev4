import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';

export function LeaderboardLink({ className = 'text-blue-600 hover:bg-blue-50' }: { className?: string }) {
  return (
    <Link to="/" title="لوحة الترتيب" aria-label="لوحة الترتيب" className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition-colors ${className}`}>
      <Trophy size={18} aria-hidden="true" />
      <span className="hidden sm:inline">لوحة الترتيب</span>
    </Link>
  );
}
