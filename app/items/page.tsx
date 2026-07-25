import type { Metadata } from "next";
import { ItemsDirectory } from "../components/ItemsDirectory";
import { getItems } from "../lib/supabase";

export const metadata: Metadata = {
  title: "Items",
  description: "Browse D5e held items and enhancements.",
};

export default async function ItemsPage() {
  const items = await getItems();

  return (
    <main>
      <section className="page-hero items-hero">
        <div className="hero-orbit orbit-one" />
        <div className="hero-orbit orbit-two" />
        <div className="page-shell hero-content">
          <p className="eyebrow light">D5e Equipment Archive</p>
          <h1>Items</h1>
          <p>Browse held items, enhancement tools, and the effects they grant your Digimon.</p>
        </div>
      </section>
      <div className="page-shell directory-shell">
        {items.length
          ? <ItemsDirectory items={items} />
          : <div className="empty-state permanent"><h2>No items available</h2><p>The archive does not have any published items yet.</p></div>}
      </div>
    </main>
  );
}
