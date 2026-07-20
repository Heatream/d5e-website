"use client";

import { useEffect, useMemo, useState } from "react";
import type { TypeElement } from "../lib/supabase";

const colors: Record<string, string> = {
  darkness: "#71617d",
  earth: "#a8743a",
  fire: "#df4b32",
  ice: "#4d9bb6",
  light: "#d19b23",
  lightning: "#c39416",
  null: "#68727b",
  plant: "#4d8b55",
  steel: "#637783",
  water: "#3d78b6",
  wind: "#4b947c",
};

function validNavigationType(types: TypeElement[]) {
  if (typeof window === "undefined") return null;
  const candidate = window.history.state?.d5eSkillType;
  if (typeof candidate !== "string") return null;
  return types.find((type) => type.name.toLowerCase() === candidate.toLowerCase()) ?? null;
}

export function TypeSelector({
  skillName,
  description,
  types,
}: {
  skillName: string;
  description: string;
  types: TypeElement[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assigned, setAssigned] = useState(false);

  useEffect(() => {
    const navigationType = validNavigationType(types);
    if (navigationType) {
      setSelectedId(navigationType.id);
      setAssigned(true);
    }
  }, [types]);

  const selected = useMemo(
    () => types.find((type) => type.id === selectedId) ?? null,
    [selectedId, types],
  );

  return (
    <>
      <div className="detail-title-row">
        <div>
          <p className="eyebrow">Attachment Skill</p>
          <h1>{selected ? `${selected.name} ${skillName}` : skillName}</h1>
        </div>
        {selected && (
          <span
            className="selected-type-badge"
            style={{ "--type-color": colors[selected.name.toLowerCase()] ?? "#68727b" } as React.CSSProperties}
          >
            {selected.name}
          </span>
        )}
      </div>

      <section className="description-block" aria-labelledby="description-title">
        <h2 id="description-title">Description</h2>
        <p>{description}</p>
        {selected && (
          <div className="type-effect" aria-live="polite">
            <span style={{ background: colors[selected.name.toLowerCase()] ?? "#68727b" }} aria-hidden="true" />
            <div>
              <strong>{selected.name} effect</strong>
              <p>{selected.effect}</p>
            </div>
          </div>
        )}
      </section>

      <section className="type-control" aria-labelledby="type-title">
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">Elemental modifier</p>
            <h2 id="type-title">Type</h2>
          </div>
          {selected && !assigned && (
            <button className="clear-type" type="button" onClick={() => setSelectedId(null)}>
              Clear type
            </button>
          )}
        </div>

        {assigned && selected ? (
          <div className="assigned-type-note">
            This move was assigned the <strong>{selected.name}</strong> type by its character sheet.
          </div>
        ) : (
          <label className="detail-type-select">
            <span>Choose an element to preview its name and combat effect.</span>
            <select value={selectedId ?? ""} onChange={(event) => setSelectedId(event.target.value || null)}>
              <option value="">No type selected</option>
              {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </label>
        )}
      </section>
    </>
  );
}
