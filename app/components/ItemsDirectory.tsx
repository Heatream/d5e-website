"use client";

import { useMemo, useState } from "react";
import type { Item } from "../lib/supabase";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function ItemsDirectory({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const typeOptions = useMemo(() => [...new Set(items.map((item) => item.type).filter(Boolean))], [items]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return items.filter((item) => {
      if (search && !`${item.name} ${item.type} ${item.description}`.toLowerCase().includes(search)) return false;
      return !typeFilter || item.type.toLowerCase() === typeFilter.toLowerCase();
    });
  }, [items, query, typeFilter]);

  return (
    <section className="items-directory" aria-label="Item directory">
      <div className="directory-tools items-tools">
        <div className="directory-search-and-filters">
          <label className="search-field">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <span className="sr-only">Search items</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by item or effect…" />
            {query && <button type="button" onClick={() => setQuery("")}>Clear</button>}
          </label>
          <div className="filter-row"><label><span>Type</span><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">All types</option>{typeOptions.map((type) => <option value={type} key={type}>{type}</option>)}</select></label></div>
        </div>
        <p className="result-count"><strong>{filtered.length}</strong> / {items.length} items</p>
      </div>

      {filtered.length ? (
        <div className="item-list">
          {filtered.map((item) => (
            <article className="item-card" key={item.id}>
              <div className={`item-image ${item.image ? "has-image" : ""}`}>
                {item.image
                  ? <img src={item.image} alt="" />
                  : <span aria-hidden="true">{initials(item.name)}</span>}
              </div>
              <div className="item-copy">
                <div className="item-heading">
                  <h2>{item.name}</h2>
                  <span>{item.type}</span>
                </div>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No matching items</h2>
          <p>Try searching for another name, type, or effect.</p>
          <button type="button" onClick={() => { setQuery(""); setTypeFilter(""); }}>Clear filters</button>
        </div>
      )}
    </section>
  );
}
