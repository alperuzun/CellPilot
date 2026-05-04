import React, { useEffect, useRef, useState } from 'react';
import { useVizTheme } from '../../theme/ThemeContext';
import { api, OntologySearchResult } from '../../services/api';

interface CLLabelInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Optional callback fired when the user picks a CL suggestion. The parent
   * may want to record the cl_id alongside the label string for downstream
   * grounding; if omitted, only the cl_name flows back through onChange. */
  onSelectCL?: (result: OntologySearchResult) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

/**
 * Free-text input with a Cell-Ontology autocomplete dropdown. Debounces
 * queries (250ms) to /ontology_search and renders the top 5 suggestions
 * below the input. Falls back silently to a plain text input when the
 * mapper is unavailable on the backend (`available: false`), so the
 * Annotation Manager keeps working in mapper-free environments.
 */
export const CLLabelInput: React.FC<CLLabelInputProps> = ({
  value,
  onChange,
  onSelectCL,
  placeholder,
  className,
  style,
  onFocus,
  onBlur,
}) => {
  const { v } = useVizTheme();
  const [suggestions, setSuggestions] = useState<OntologySearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [mapperAvailable, setMapperAvailable] = useState<boolean>(true);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Debounced search whenever the value changes.
  useEffect(() => {
    if (!mapperAvailable) return;
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const resp = await api.ontologySearch(query, 5);
        if (!resp.available) {
          setMapperAvailable(false);
          setSuggestions([]);
          return;
        }
        setSuggestions(resp.results);
      } catch {
        // Network/transient error — silently degrade to free-text entry.
        setSuggestions([]);
      }
    }, 250);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [value, mapperAvailable]);

  // Close the dropdown on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pick = (s: OntologySearchResult) => {
    onChange(s.cl_name);
    onSelectCL?.(s);
    setOpen(false);
  };

  const showDropdown = open && suggestions.length > 0 && mapperAvailable;

  return (
    <div ref={wrapRef} className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={onBlur}
        placeholder={placeholder}
        className={className}
        style={style}
      />
      {showDropdown && (
        <ul
          className="absolute left-0 right-0 mt-1 z-50 rounded-md shadow-lg max-h-64 overflow-y-auto custom-scrollbar"
          style={{
            background: v.panelBg,
            border: `1px solid ${v.panelBorder}`,
          }}
        >
          {suggestions.map((s) => (
            <li
              key={s.cl_id}
              onMouseDown={(e) => e.preventDefault()}  // keep focus on input
              onClick={() => pick(s)}
              className="px-3 py-2 cursor-pointer text-sm flex items-center justify-between gap-2"
              style={{ color: v.textBody }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = v.panelBgSecondary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span className="flex flex-col min-w-0">
                <span className="truncate">{s.cl_name}</span>
                <span className="text-[10px]" style={{ color: v.textFaint }}>
                  {s.cl_id}
                </span>
              </span>
              <span
                className="text-[10px] tabular-nums shrink-0"
                style={{ color: v.textMuted }}
              >
                {s.similarity.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CLLabelInput;
