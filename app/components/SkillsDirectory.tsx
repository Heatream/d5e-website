"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AttachmentSkill } from "../lib/supabase";

export function SkillsDirectory({ skills }: { skills: AttachmentSkill[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return skills;
    return skills.filter((skill) =>
      skill.name.toLocaleLowerCase().includes(normalized),
    );
  }, [query, skills]);

  return (
    <section className="directory" aria-labelledby="directory-heading">
      <div className="directory-tools">
        <label className="search-field">
          <span className="sr-only">Search skills by name</span>
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skills..."
            autoComplete="off"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
              Clear
            </button>
          )}
        </label>
        <p className="result-count" aria-live="polite">
          <strong>{filtered.length}</strong> / {skills.length} skills
        </p>
      </div>

      <h2 id="directory-heading" className="sr-only">Attachment skills</h2>
      {filtered.length ? (
        <div className="skill-table-wrap">
          <table className="skill-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Power</th>
                <th>Time</th>
                <th>Range</th>
                <th>Damage</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((skill) => (
                <tr key={skill.id}>
                  <td data-label="Name">
                    <Link href={`/skills/${skill.slug}`} className="skill-name-link">
                      {skill.name}<span aria-hidden="true">›</span>
                    </Link>
                  </td>
                  <td data-label="Power">{skill.power}</td>
                  <td data-label="Time">{skill.time}</td>
                  <td data-label="Range">{skill.range}</td>
                  <td data-label="Damage">
                    <span className={skill.damage === "-" || skill.damage === "—" ? "muted" : "damage-chip"}>
                      {skill.damage}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <span aria-hidden="true">◇</span>
          <h3>No skills found</h3>
          <p>Try a different name or clear your search.</p>
          <button type="button" onClick={() => setQuery("")}>Clear search</button>
        </div>
      )}
    </section>
  );
}
