"use client";
import { useState, useRef, useEffect } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  models: string[];
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}

export default function ModelCombobox({ value, onChange, models, className = "", inputClassName, placeholder = "e.g. gpt-4o" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep query in sync when value changes externally (e.g. editing an existing agent)
  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query
    ? models.filter((m) => m.toLowerCase().includes(query.toLowerCase()))
    : models;

  const handleInput = (v: string) => {
    setQuery(v);
    onChange(v);
    setOpen(true);
  };

  const handleSelect = (m: string) => {
    setQuery(m);
    onChange(m);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={inputClassName ?? "w-full bg-gray-800 rounded px-3 py-2 text-sm text-white outline-none focus:ring-2 ring-indigo-500"}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
          {filtered.map((m) => (
            <li
              key={m}
              onMouseDown={() => handleSelect(m)}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-600/40 ${
                m === value ? "text-indigo-300" : "text-gray-200"
              }`}
            >
              {m}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
