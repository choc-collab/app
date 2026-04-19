"use client";

import { useState, useEffect } from "react";
import { Pencil } from "lucide-react";

interface InlineNameEditorProps {
  name: string;
  onSave: (name: string) => Promise<void> | void;
  className?: string;
  initialEditing?: boolean;
}

export function InlineNameEditor({
  name,
  onSave,
  className = "text-xl font-bold",
  initialEditing = false,
}: InlineNameEditorProps) {
  const [editing, setEditing] = useState(initialEditing);
  const [value, setValue] = useState(name);

  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  async function commit() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) {
      await onSave(trimmed);
    }
    setValue(trimmed || name);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setValue(name);
            setEditing(false);
          }
        }}
        className={`${className} w-full bg-transparent border-b border-primary outline-none pb-0.5`}
      />
    );
  }

  return (
    <span className="group inline-flex items-center gap-1.5 min-w-0">
      <span className={`${className} truncate`}>{name}</span>
      <button
        onClick={() => setEditing(true)}
        aria-label="Rename"
        className="opacity-30 hover:opacity-100 focus:opacity-100 p-0.5 rounded transition-all shrink-0"
      >
        <Pencil className="w-3 h-3 text-muted-foreground" />
      </button>
    </span>
  );
}
