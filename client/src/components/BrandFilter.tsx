import { useState } from 'react';
import { BRANDS, type Brand } from '@volt/shared';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Heart, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  selected: Brand[];
  onChange: (next: Brand[]) => void;
  customTerms: string[];
  onCustomTermsChange: (next: string[]) => void;
  isFavorite?: (type: 'charger' | 'brand', id: string) => boolean;
  onToggleFavorite?: (type: 'charger' | 'brand', id: string) => void;
}

export function BrandFilter({
  selected,
  onChange,
  customTerms,
  onCustomTermsChange,
  isFavorite,
  onToggleFavorite,
}: Props) {
  const selectedIds = new Set(selected.map((b) => b.id));
  const [draft, setDraft] = useState('');

  function toggle(brand: Brand) {
    if (selectedIds.has(brand.id)) {
      onChange(selected.filter((b) => b.id !== brand.id));
    } else {
      onChange([...selected, brand]);
    }
  }

  function addTerm() {
    const term = draft.trim();
    setDraft('');
    if (!term) return;
    // Dedupe case-insensitively against existing terms.
    if (customTerms.some((t) => t.toLowerCase() === term.toLowerCase())) return;
    onCustomTermsChange([...customTerms, term]);
  }

  function removeTerm(term: string) {
    onCustomTermsChange(customTerms.filter((t) => t !== term));
  }

  const hasAny = selected.length > 0 || customTerms.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Restaurants near stops</Label>
        {hasAny && (
          <button
            type="button"
            onClick={() => {
              onChange([]);
              onCustomTermsChange([]);
            }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {BRANDS.map((brand) => {
          const isSelected = selectedIds.has(brand.id);
          const favorited = isFavorite?.('brand', brand.id) ?? false;
          return (
            <div key={brand.id} className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => toggle(brand)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs border transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-input hover:bg-muted',
                )}
              >
                {brand.name}
              </button>
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite('brand', brand.id);
                  }}
                  className="text-muted-foreground hover:text-red-500 transition-colors"
                  title={
                    favorited ? 'Remove from favorites' : 'Add to favorites'
                  }
                >
                  <Heart
                    className={cn(
                      'h-3 w-3',
                      favorited && 'fill-red-500 text-red-500',
                    )}
                  />
                </button>
              )}
            </div>
          );
        })}
        {customTerms.map((term) => (
          <span
            key={`q:${term}`}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border bg-primary text-primary-foreground border-primary"
          >
            {term}
            <button
              type="button"
              onClick={() => removeTerm(term)}
              className="hover:opacity-70"
              title="Remove"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addTerm();
          }
        }}
        onBlur={addTerm}
        placeholder="Type a restaurant, e.g. Wendy's"
        className="h-8 text-xs"
      />
    </div>
  );
}
