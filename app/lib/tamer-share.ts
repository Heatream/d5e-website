import { calculateHistoryHp, modifier } from "./digimon-rules";
import { normalizeResource, type LightweightPlayerPartner, type LightweightPlayerState } from "./encounter-rules";
import { authConfig, serviceHeaders } from "./server-auth";

type Row = Record<string, unknown>;
export type SharedTamerPreview = {
  name: string;
  partners: Array<{ slotNumber: number; name: string; forms: string[] }>;
};
export type SharedTamerSnapshot = {
  displayName: string;
  snapshot: { player: true; imported: true };
  state: LightweightPlayerState;
};

async function serviceGet(path: string) {
  const { url } = authConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: serviceHeaders(), cache: "no-store" });
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error(rows?.message ?? "Could not load the shared character.");
  return Array.isArray(rows) ? rows as Row[] : [];
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

async function sharedData(code: string) {
  const normalized = code.trim().toLowerCase();
  if (!/^[a-f0-9]{36}$/.test(normalized)) return null;
  const tamers = await serviceGet(`player_tamers?encounter_share_code=eq.${encodeURIComponent(normalized)}&select=id,user_id,name,level,subclass_id,current_hp,max_hp,current_partner_points,charisma&limit=1`);
  const tamer = tamers[0];
  if (!tamer) return null;
  const joins = await serviceGet(`player_tamer_partners?tamer_id=eq.${encodeURIComponent(String(tamer.id))}&select=slot_number,player_digimon_id&order=slot_number.asc`);
  const allForms = await serviceGet(`player_digimon?user_id=eq.${encodeURIComponent(String(tamer.user_id))}&select=id,parent_digimon_id,name,level,stage_id,stage_attribute_ids,attribute_id,constitution,charisma,current_hp,current_digislot`);
  const stages = await serviceGet(`Digimon%20Stage?select=id,name`);
  const attributes = await serviceGet(`Attributes?select=*`);
  const levels = await serviceGet(`D%20Level%20Chart?select=level,digislot`);
  const subclasses = await serviceGet(`tamer_subclasses?select=id,slug`);
  const byId = new Map(allForms.map((row) => [String(row.id), row]));
  const children = new Map<string, Row>();
  allForms.forEach((row) => { if (row.parent_digimon_id) children.set(String(row.parent_digimon_id), row); });
  const stageName = (row: Row) => String(stages.find((stage) => Number(stage.id) === Number(row.stage_id))?.name ?? "Rookie");
  const diceFor = (row: Row) => {
    const ids = stringArray(row.stage_attribute_ids);
    if (!ids.length && row.attribute_id) ids.push(String(row.attribute_id));
    return ids.map((id, index) => {
      const attribute = attributes.find((entry) => String(entry.id) === id);
      const stage = ["rookie", "champion", "ultimate", "mega"][Math.min(index, 3)];
      return String(attribute?.[`hp dice ${stage}`] ?? "1d6");
    });
  };
  const chains = joins.map((join) => {
    const selected = byId.get(String(join.player_digimon_id));
    if (!selected) return null;
    let root = selected;
    const visited = new Set<string>();
    while (root.parent_digimon_id && !visited.has(String(root.id))) {
      visited.add(String(root.id));
      root = byId.get(String(root.parent_digimon_id)) ?? root;
    }
    const chain: Row[] = [root];
    while (children.has(String(chain.at(-1)?.id))) chain.push(children.get(String(chain.at(-1)?.id))!);
    return { slotNumber: Number(join.slot_number), selectedId: String(selected.id), chain };
  }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  return { tamer, levels, chains, subclasses, stageName, diceFor };
}

export async function previewSharedTamer(code: string): Promise<SharedTamerPreview | null> {
  const data = await sharedData(code);
  if (!data) return null;
  return {
    name: String(data.tamer.name ?? "Player"),
    partners: data.chains.map(({ slotNumber, chain }) => ({
      slotNumber,
      name: String(chain.find((row) => String(row.id) === data.chains.find((item) => item.slotNumber === slotNumber)?.selectedId)?.name ?? chain[0]?.name ?? "Partner"),
      forms: chain.map((row) => String(row.name ?? "Partner")),
    })),
  };
}

export async function snapshotSharedTamer(code: string, selectedSlots: number[]): Promise<SharedTamerSnapshot | null> {
  const data = await sharedData(code);
  if (!data) return null;
  const allowed = [...new Set(selectedSlots.map(Number))].slice(0, 2);
  const partners: LightweightPlayerPartner[] = data.chains
    .filter((entry) => allowed.includes(entry.slotNumber))
    .map(({ slotNumber, selectedId, chain }) => {
      const activeFormIndex = Math.max(0, chain.findIndex((row) => String(row.id) === selectedId));
      const forms = chain.map((row) => {
        const level = Math.max(1, Math.min(20, Number(row.level ?? 1)));
        const maximumHp = calculateHistoryHp(data.diceFor(row), data.stageName(row), level, Number(row.constitution ?? 10));
        return { name: String(row.name ?? "Partner"), currentHp: Math.min(maximumHp, Math.max(0, Number(row.current_hp ?? maximumHp))), maximumHp };
      });
      const active = chain[activeFormIndex];
      const levelRow = data.levels.find((row) => Number(row.level) === Number(active?.level ?? 1));
      const maximumDigislot = Math.max(0, Number(levelRow?.digislot ?? 1));
      return { slotNumber, activeFormIndex, forms, digislot: normalizeResource(active?.current_digislot ?? maximumDigislot, maximumDigislot) };
    });
  const maximumHp = Math.max(0, Number(data.tamer.max_hp ?? 0));
  const chosenChains = data.chains.filter((entry) => allowed.includes(entry.slotNumber));
  const partnerCharisma = chosenChains.map(({ selectedId, chain }) => Number(chain.find((row) => String(row.id) === selectedId)?.charisma ?? 10));
  const subclass = data.subclasses.find((row) => Number(row.id) === Number(data.tamer.subclass_id));
  const maximumPp = Math.max(0, 1 + modifier(Number(data.tamer.charisma ?? 10))
    + (partnerCharisma[0] == null ? 0 : modifier(partnerCharisma[0]))
    + (String(subclass?.slug ?? "").toLowerCase() === "dual-wielder" && Number(data.tamer.level ?? 1) >= 14 && partnerCharisma[1] != null ? modifier(partnerCharisma[1]) : 0));
  return {
    displayName: String(data.tamer.name ?? "Player"),
    snapshot: { player: true, imported: true },
    state: {
      tamerHp: normalizeResource(data.tamer.current_hp ?? maximumHp, maximumHp),
      partnerPoints: normalizeResource(data.tamer.current_partner_points ?? maximumPp, maximumPp),
      partners,
    },
  };
}
