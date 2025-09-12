"use client";

import React, { useEffect, useRef, useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  value: string[];
  options: MultiSelectOption[];
  placeholder?: string;
  onChange: (values: string[]) => void;
  className?: string;
}

export default function MultiSelect({
  value,
  options,
  placeholder = "Select",
  onChange,
  className = "w-full",
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selectedLabels = options
    .filter((opt) => value.includes(opt.value))
    .map((opt) => opt.label);

  const display =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length === 1
      ? selectedLabels[0]
      : `${selectedLabels.length} selected`;

  const toggle = (val: string) => {
    if (value.includes(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-12 w-full flex items-center gap-2 px-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200 leading-5"
      >
        <span className={`text-sm truncate ${selectedLabels.length ? "text-gray-900" : "text-gray-500"}`}>{display}</span>
        <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="popup-panel p-2 max-h-60 overflow-auto">
          {options.map((opt) => {
            const checked = value.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded"
              >
                <span className={`w-4 h-4 border rounded flex items-center justify-center ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}></span>
                <span className="text-sm">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

