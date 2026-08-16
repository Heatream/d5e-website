"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MonsterManual } from "./MonsterManual";
import {
  clampTracker,
  sortEncounterParticipants,
  type EncounterParticipant,
  type EncounterParticipantKind,
} from "../lib/encounter-rules";
import { calculateHp, modifier, stageRange } from "../lib/digimon-rules";
import { armyXrossBonuses } from "../lib/digixrosser-rules";
import { parseTrackerExpression } from "../lib/tracker-expression";
import type {
  AttachmentSkill,
  Attribute,
  Digimon,
  DigimonStage,
  Feat,
  Field,
  Item,
  LevelChart,
  PersonalitySkill,
  TamerLevel,
  TamerSubclass,
  TamerSubclassFeature,
  TypeElement,
} from "../lib/supabase";

type Props = {
  digimon: Digimon[];
  fields: Field[];
  attributes: Attribute[];
  levels: LevelChart[];
  skills: AttachmentSkill[];
  types: TypeElement[];
  personalitySkills: PersonalitySkill[];
  stages: DigimonStage[];
  feats: Feat[];
  items: Item[];
  heldItemsTemplate: string | null;
  enhancementItemsTemplate: string | null;
  tamerSubclasses: TamerSubclass[];
  tamerLevels: TamerLevel[];
  tamerSubclassFeatures: TamerSubclassFeature[];
};
type Encounter = {
  id: string;
  name: string;
  round_number: number;
  active_participant_id: string | null;
  encounter_participants?: EncounterParticipant[];
};
type Saved = Record<string, unknown> & {
  id: string;
  name?: string;
  parent_digimon_id?: string | null;
  level?: number;
};
type Tamer = Record<string, unknown> & {
  id: string;
  name?: string;
  level?: number;
  player_tamer_partners?: Array<Record<string, unknown>>;
};
type DigiState = {
  level: number;
  currentHp: number;
  maxHp: number;
  currentDigislot: number;
  maxDigislot: number;
  formIndex?: number;
};
type FormExtra = {
  heldItems: Array<Item | null>;
  enhancementItem: Item | null;
  feats: Feat[];
};
type ArmyMember = {
  id?: number;
  slot_number: number;
  name: string;
  field_id: number;
  main_ability: string;
  stage: string;
  image_path?: string | null;
  is_xrossed?: boolean;
};

const skillAbilities: Array<[string, keyof Digimon]> = [
  ["Athletics", "strength"],
  ["Acrobatics", "dexterity"],
  ["Sleight of Hand", "dexterity"],
  ["Stealth", "dexterity"],
  ["Investigation", "intelligence"],
  ["Nature", "intelligence"],
  ["Religion", "intelligence"],
  ["Technology", "intelligence"],
  ["Animal Handling", "wisdom"],
  ["Insight", "wisdom"],
  ["Medicine", "wisdom"],
  ["Perception", "wisdom"],
  ["Survival", "wisdom"],
  ["Deception", "charisma"],
  ["Intimidation", "charisma"],
  ["Performance", "charisma"],
  ["Persuasion", "charisma"],
  ["Streetwise", "charisma"],
];
function split(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
function calculateTrackerInput(
  input: string,
  previous: number,
  maximum: number,
) {
  const result = parseTrackerExpression(input, previous);
  return result == null ? previous : clampTracker(result, maximum);
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  const value = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(value?.error ?? "Request failed.");
  return value as T;
}

function savedDigimon(row: Saved, props: Props): Digimon {
  const stage = props.stages.find((item) => item.id === Number(row.stage_id));
  const history = (
    Array.isArray(row.stage_attribute_ids)
      ? row.stage_attribute_ids
      : [row.attribute_id]
  ).map(String);
  const attribute = props.attributes.find((item) => item.id === history.at(-1));
  const field = props.fields.find((item) => item.id === Number(row.field_id));
  const attachments: Digimon["attachmentSkills"] = Array.from(
    { length: 4 },
    () => null,
  );
  const stored = Array.isArray(row.player_digimon_skills)
    ? (row.player_digimon_skills as Array<Record<string, unknown>>)
    : [];
  stored
    .filter((item) => item.skill_kind === "attachment")
    .forEach((item) => {
      const skill = props.skills.find(
        (entry) => entry.id === String(item.attachment_skill_id ?? ""),
      );
      if (!skill) return;
      const slot = Math.max(1, Math.min(4, Number(item.slot_number ?? 1)));
      const type = props.types.find(
        (entry) => entry.id === String(item.element_id ?? ""),
      );
      attachments[slot - 1] = {
        raw: skill.slug,
        slot,
        skill: skill.slug,
        typeToken: type?.name ?? null,
        powerOverride: null,
        startingStage: Math.max(
          1,
          Math.min(3, Number(item.attachment_stage ?? 1)),
        ) as 1 | 2 | 3,
        upgradeOrders: [],
        valid: true,
      };
    });
  const special = Array.isArray(row.special_skill)
    ? row.special_skill
    : row.special_skill
      ? [row.special_skill]
      : [];
  return {
    id: -1,
    name: String(row.name ?? "Digimon"),
    slug: `encounter-${row.id}`,
    stage: stage?.name ?? "Rookie",
    attribute: attribute?.name ?? "",
    attributeHistory: history
      .map((id) => props.attributes.find((item) => item.id === id)?.name)
      .filter(Boolean) as string[],
    field: field?.abbreviation ?? "",
    image: row.image_path ? String(row.image_path) : null,
    strength: Number(row.strength ?? 10),
    dexterity: Number(row.dexterity ?? 10),
    constitution: Number(row.constitution ?? 10),
    intelligence: Number(row.intelligence ?? 10),
    wisdom: Number(row.wisdom ?? 10),
    charisma: Number(row.charisma ?? 10),
    proficiencies: split(row.proficiencies),
    savingThrows: split(row.saving_throws),
    weakness: split(row.weaknesses),
    attachmentSkills: attachments,
    specialSkills: special.filter(
      (item) => item && typeof item === "object",
    ) as Digimon["specialSkills"],
    personalitySkill: String(row.personality_skill ?? ""),
    baseAc: stage?.baseAc ?? 10,
    parentId: row.parent_digimon_id ?? null,
  };
}
function digiState(
  digi: Digimon,
  level: number,
  props: Props,
  current?: unknown,
): DigiState {
  const row =
    props.levels.find((item) => item.level === level) ?? props.levels[0];
  const attribute = props.attributes.find(
    (item) => item.name.toLowerCase() === digi.attribute.toLowerCase(),
  );
  const die =
    attribute?.hpDice[
      digi.stage.toLowerCase() === "7th stage"
        ? "mega"
        : digi.stage.toLowerCase()
    ] ?? "1d6";
  const maxHp = calculateHp(die, level, modifier(digi.constitution));
  const maxDigislot = Number(row?.digislot ?? 1);
  return {
    level,
    currentHp: clampTracker(current ?? maxHp, maxHp),
    maxHp,
    currentDigislot: maxDigislot,
    maxDigislot,
  };
}
function formExtra(row: Saved, props: Props): FormExtra {
  const itemRows = Array.isArray(row.player_digimon_items)
    ? (row.player_digimon_items as Array<Record<string, unknown>>)
    : [];
  const bySlot = (slot: number) =>
    props.items.find(
      (item) =>
        item.id ===
        Number(
          itemRows.find((entry) => Number(entry.slot_number) === slot)?.item_id,
        ),
    ) ?? null;
  const featRows = Array.isArray(row.player_digimon_feats)
    ? (row.player_digimon_feats as Array<Record<string, unknown>>)
    : [];
  return {
    heldItems: [bySlot(1), bySlot(2)],
    enhancementItem: bySlot(3),
    feats: featRows
      .map((entry) =>
        props.feats.find((feat) => feat.id === Number(entry.feat_id)),
      )
      .filter((feat): feat is Feat => Boolean(feat)),
  };
}
const emptyExtra = (): FormExtra => ({
  heldItems: [null, null],
  enhancementItem: null,
  feats: [],
});
function hasExtra(extra?: FormExtra) {
  return Boolean(
    extra &&
      (extra.heldItems.some(Boolean) ||
        extra.enhancementItem ||
        extra.feats.length),
  );
}
function sharedEvolutionExtra(
  rows: Saved[],
  props: Props,
  stored: FormExtra[] = [],
) {
  return (
    stored.find(hasExtra) ??
    rows.map((row) => formExtra(row, props)).find(hasExtra) ??
    emptyExtra()
  );
}
function evolutionRows(selected: Saved, all: Saved[]) {
  let root = selected;
  while (root.parent_digimon_id)
    root = all.find((row) => row.id === root.parent_digimon_id) ?? root;
  const rows = [root];
  let child = all.find((row) => row.parent_digimon_id === rows.at(-1)?.id);
  while (child) {
    rows.push(child);
    child = all.find((row) => row.parent_digimon_id === rows.at(-1)?.id);
  }
  return rows;
}

function EncounterArmySlot({
  member,
  field,
  official,
  active,
  onToggle,
}: {
  member: ArmyMember;
  field?: Field;
  official: Digimon[];
  active: boolean;
  onToggle: () => void;
}) {
  const image =
    member.image_path ||
    official.find(
      (digi) =>
        digi.name.trim().toLowerCase() === member.name.trim().toLowerCase(),
    )?.image;
  return (
    <button
      type="button"
      className={`army-slot${active ? " xrossed" : ""}`}
      aria-pressed={active}
      aria-label={`${active ? "Un-Xross" : "Xross"} ${member.name}`}
      onClick={onToggle}
    >
      {image && <img className="army-digimon-image" src={image} alt="" />}
      <strong>{member.main_ability.slice(0, 3).toUpperCase()}</strong>
      <span className="army-field-symbol">
        {field?.symbol ? <img src={field.symbol} alt="" /> : "?"}
      </span>
    </button>
  );
}

function Proficiencies({
  digi,
  level,
  levels,
}: {
  digi: Digimon;
  level: number;
  levels: LevelChart[];
}) {
  const proficiency =
    Number(
      String(
        levels.find((item) => item.level === level)?.proficiency ?? 2,
      ).replace("+", ""),
    ) || 2;
  return (
    <div className="encounter-proficiency-panel">
      <h4>{digi.name} Proficiencies</h4>
      <div className="encounter-skill-grid">
        {skillAbilities.map(([name, ability]) => {
          const trained = digi.proficiencies.some(
            (item) => item.toLowerCase() === name.toLowerCase(),
          );
          const score = Number(digi[ability]) || 10;
          const value = modifier(score) + (trained ? proficiency : 0);
          return (
            <div className={trained ? "trained" : ""} key={name}>
              <span>{name}</span>
              <strong>
                {value >= 0 ? "+" : ""}
                {value}
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EncounterTamerSheet({
  tamer,
  state,
  props,
  firstPartner,
  army,
  xrossedSlots,
  onToggleXross,
  onState,
  onProficiencies,
  onFeature,
}: {
  tamer: Tamer;
  state: Record<string, unknown>;
  props: Props;
  firstPartner?: Digimon;
  army: ArmyMember[];
  xrossedSlots: number[];
  onToggleXross: (slot: number) => void;
  onState: (state: Record<string, unknown>) => void;
  onProficiencies: () => void;
  onFeature: (slug: string) => void;
}) {
  const level = Number(tamer.level ?? 1),
    levelRow = props.tamerLevels.find((row) => row.level === level),
    subclass = props.tamerSubclasses.find(
      (row) => row.id === Number(tamer.subclass_id),
    );
  const trainings = Array.isArray(tamer.player_tamer_trainings)
    ? (tamer.player_tamer_trainings as Array<Record<string, unknown>>)
    : [];
  const skills = trainings
    .filter((row) => row.training_kind === "skill")
    .map((row) => String(row.name));
  const saves = trainings
    .filter((row) => row.training_kind === "save")
    .map((row) => String(row.name));
  const featRows = Array.isArray(tamer.player_tamer_feats)
    ? (tamer.player_tamer_feats as Array<Record<string, unknown>>)
    : [];
  const feats = featRows
    .map(
      (row) =>
        props.feats.find((feat) => feat.id === Number(row.feat_id))?.name,
    )
    .filter(Boolean);
  const currentHp = Number(state.currentHp ?? 0),
    maxHp = Number(state.maxHp ?? 0),
    currentPp = Number(state.currentPp ?? 0),
    maxPp = Number(state.maxPp ?? 0);
  const subclassFeatures = props.tamerSubclassFeatures.filter(
    (feature) => feature.subclassId === subclass?.id,
  );
  const subclassSlug = subclass?.slug.toLowerCase() ?? "";
  const layouts: Record<string, Array<[string, string]>> = {
    digidestined: [
      ["power-of-friendship", "feature-power-of-friendship"],
      ["tamer-inspiration", "feature-tamer-inspiration"],
      ["field-mastery", "feature-field-mastery"],
      ["crested-strength", "feature-crested-strength"],
      ["adventurer", "feature-adventurer"],
    ],
    digixrosser: [["xross-warrior", "feature-xross-warrior"]],
    "dna-pulser": [
      ["charging-pulse", "feature-power-of-friendship feature-dna-charging"],
      ["aggressive-pulse", "feature-tamer-inspiration feature-dna-aggressive"],
      ["saving-pulse", "feature-field-mastery feature-dna-saving"],
      ["adaptation", "feature-crested-strength feature-dna-adaptation"],
      ["pulse-break", "feature-adventurer feature-dna-break"],
    ],
    digispirited: [["frontier-spirit", "feature-frontier-spirit"]],
  };
  return (
    <article
      className={`tamer-sheet encounter-tamer-sheet${subclass?.border ? " has-template" : ""}`}
    >
      <div className="tamer-portrait">
        {tamer.image_path ? (
          <img src={String(tamer.image_path)} alt="" />
        ) : (
          <span>Portrait</span>
        )}
      </div>
      {subclass?.border && (
        <img
          className="tamer-template"
          src={subclass.border}
          alt=""
          aria-hidden="true"
        />
      )}
      <strong className="tamer-name" data-fit>
        {String(tamer.name ?? "Tamer")}
      </strong>
      <span className="tamer-level">{level}</span>
      <div className="tamer-hp">
        <button
          className="tracker-value"
          onClick={() => {
            const value = prompt(
              "Current HP (simple + and - are accepted)",
              String(currentHp),
            );
            if (value !== null)
              onState({
                ...state,
                currentHp: calculateTrackerInput(value, currentHp, maxHp),
              });
          }}
        >
          <span className="sheet-current-value">{currentHp}</span>
          <span className="sheet-value-divider">/</span>
          <span className="sheet-maximum-value">{maxHp}</span>
        </button>
      </div>
      <div className="tamer-ac">
        <strong>{String(tamer.armor_class ?? 8)}</strong>
      </div>
      <div className="tamer-prof">
        <strong>+{levelRow?.proficiencyBonus ?? 2}</strong>
      </div>
      <div className="tamer-pp">
        <button
          className="tracker-value"
          onClick={() => {
            const value = prompt("Current Partner Points", String(currentPp));
            if (value !== null)
              onState({ ...state, currentPp: clampTracker(value, maxPp) });
          }}
        >
          <span className="sheet-current-value">{currentPp}</span>
          <span className="sheet-value-divider">/</span>
          <span className="sheet-maximum-value">{maxPp}</span>
        </button>
      </div>
      <div className="tamer-mv">
        <strong>{String(tamer.movement ?? 30)}ft</strong>
      </div>
      <div className="tamer-evolution">
        <strong>{levelRow?.maxEvolutionStage ?? "Rookie"}</strong>
      </div>
      <div className="tamer-we">
        <strong>+{levelRow?.proficiencyBonus ?? 2}</strong>
      </div>
      <div className="tamer-saves">
        <p>{saves.join(" · ") || "—"}</p>
      </div>
      <div className="tamer-abilities">
        {[
          "strength",
          "dexterity",
          "constitution",
          "intelligence",
          "wisdom",
          "charisma",
        ].map((ability) => (
          <div key={ability}>
            <strong>{String(tamer[ability] ?? 8)}</strong>
          </div>
        ))}
      </div>
      <div className="tamer-feats">
        <p>{feats.join(" · ") || "—"}</p>
      </div>
      <button
        type="button"
        className="tamer-proficiencies proficiency-square-button"
        onClick={onProficiencies}
      >
        <p>{skills.join(" · ") || "—"}</p>
      </button>
      {subclassSlug === "digixrosser" && (
        <div
          className="digixrosser-army"
          aria-label={`${String(tamer.name)} Digimon Army`}
        >
          <div className="army-promoted-slots">
            {level >= 9 &&
              army
                .slice(0, 3)
                .map((member, index) => (
                  <EncounterArmySlot
                    key={member.id ?? index}
                    member={member}
                    field={props.fields.find(
                      (field) => field.id === Number(member.field_id),
                    )}
                    official={props.digimon}
                    active={xrossedSlots.includes(member.slot_number)}
                    onToggle={() => onToggleXross(member.slot_number)}
                  />
                ))}
          </div>
          <div className="army-standard-slots">
            {(level >= 9 ? army.slice(3) : army).map((member, index) => (
              <EncounterArmySlot
                key={member.id ?? index}
                member={member}
                field={props.fields.find(
                  (field) => field.id === Number(member.field_id),
                )}
                official={props.digimon}
                active={xrossedSlots.includes(member.slot_number)}
                onToggle={() => onToggleXross(member.slot_number)}
              />
            ))}
          </div>
        </div>
      )}
      {(layouts[subclassSlug] ?? []).map(([slug, className]) => {
        const feature = subclassFeatures.find((item) => item.slug === slug);
        if (!feature) return null;
        const unlocked = level >= feature.levelRequired;
        let summary = feature.name;
        if (slug === "power-of-friendship")
          summary =
            level >= 14
              ? "1 PP. Add 1d10 to a roll."
              : "1 PP. Add 1d6 to a roll.";
        if (slug === "tamer-inspiration")
          summary = level >= 14 ? "1 PP. Heal 4d8+CHA." : "1 PP. Heal 2d4+CHA.";
        if (slug === "field-mastery")
          summary =
            props.fields.find(
              (field) =>
                field.abbreviation.toLowerCase() ===
                firstPartner?.field.toLowerCase(),
            )?.fieldMasteryEffect ?? "Field effect unavailable.";
        if (slug === "xross-warrior")
          summary =
            "Once per rest. Raid gains +5 per non-Xrossed Army Digimon.";
        return (
          <button
            type="button"
            className={`tamer-subclass-feature ${className}${unlocked ? "" : " locked"}`}
            key={slug}
            disabled={!unlocked}
            onClick={() => onFeature(slug)}
          >
            <span className="subclass-feature-content" data-fit>
              {unlocked ? summary : `Unlocks at level ${feature.levelRequired}`}
            </span>
          </button>
        );
      })}
    </article>
  );
}

function EncounterDigimonForms({
  participant,
  props,
  forms,
  extras,
  state,
  active,
  detailOpen,
  onDetail,
  onUpdate,
  sheetRef,
}: {
  participant: EncounterParticipant;
  props: Props;
  forms: Digimon[];
  extras: FormExtra[];
  state: Record<string, unknown>;
  active: boolean;
  detailOpen: boolean;
  onDetail: () => void;
  onUpdate: (state: Record<string, unknown>) => Promise<void>;
  sheetRef: (node: HTMLElement | null) => void;
}) {
  const activeIndex = Math.max(
    0,
    Math.min(forms.length - 1, Number(state.formIndex ?? 0)),
  );
  const storedStates = (state.formStates as DigiState[] | undefined) ?? [];
  const updateForm = (index: number, next: DigiState) => {
    const all = storedStates.length
      ? [...storedStates]
      : forms.map((form) => digiState(form, next.level, props));
    all[index] = next;
    return onUpdate({ ...state, formStates: all });
  };
  const sharedExtra = extras.find(hasExtra) ?? emptyExtra();
  return (
    <section
      className={`encounter-sheet-group ${active ? "active" : ""}`}
      ref={sheetRef}
    >
      {forms.map((digi, index) => {
        const shown = index === activeIndex,
          ds = storedStates[index] ?? (state as unknown as DigiState);
        return (
          <div
            className={`encounter-evolution-frame prerendered-form${shown ? " active" : ""}`}
            aria-hidden={!shown}
            key={`${participant.id}-${index}`}
          >
            {forms.length > 1 && (
              <>
                <button
                  className="encounter-evolution-arrow previous"
                  aria-label="De-Digivolve"
                  title="De-Digivolve"
                  disabled={index === 0}
                  onClick={() =>
                    void onUpdate({
                      ...state,
                      formIndex: index - 1,
                      xrossedArmySlots: [],
                    })
                  }
                >
                  ‹
                </button>
                <button
                  className="encounter-evolution-arrow next"
                  aria-label="Digivolve"
                  title="Digivolve"
                  disabled={index === forms.length - 1}
                  onClick={() =>
                    void onUpdate({
                      ...state,
                      formIndex: index + 1,
                      xrossedArmySlots: [],
                    })
                  }
                >
                  ›
                </button>
              </>
            )}
            <MonsterManual
              {...props}
              digimon={[digi]}
              feats={sharedExtra.feats}
              heldItems={sharedExtra.heldItems}
              enhancementItem={sharedExtra.enhancementItem}
              initialSelectedSlug={digi.slug}
              initialLevel={ds.level}
              embedded
              hideLevelControl
              currentHp={ds.currentHp}
              currentDigislot={ds.currentDigislot}
              onCurrentHpChange={(value) =>
                updateForm(index, { ...ds, currentHp: value })
              }
              onCurrentDigislotChange={(value) =>
                updateForm(index, { ...ds, currentDigislot: value })
              }
              onProficiencyClick={onDetail}
            />
            {shown && detailOpen && (
              <div className="anchored-detail">
                <Proficiencies
                  digi={digi}
                  level={ds.level}
                  levels={props.levels}
                />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export function EncounterManager(props: Props) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null),
    [encounters, setEncounters] = useState<Encounter[]>([]),
    [open, setOpen] = useState<Encounter | null>(null);
  const [newName, setNewName] = useState(""),
    [status, setStatus] = useState(""),
    [picker, setPicker] = useState<EncounterParticipantKind | null>(null),
    [query, setQuery] = useState("");
  const [owned, setOwned] = useState<Saved[]>([]),
    [tamers, setTamers] = useState<Tamer[]>([]),
    [levels, setLevels] = useState<Record<string, number>>({}),
    [detail, setDetail] = useState<string | null>(null);
  const sheetRefs = useRef<Record<string, HTMLElement | null>>({});
  const combatLayoutRef = useRef<HTMLDivElement | null>(null);
  const [sheetOffsets, setSheetOffsets] = useState<Record<string, number>>({});
  const [editingInitiative, setEditingInitiative] = useState<string | null>(
    null,
  );
  async function loadList() {
    setEncounters(await request<Encounter[]>("/api/encounters"));
  }
  async function loadEncounter(id: string) {
    const [encounter, savedRows, tamerRows] = await Promise.all([
      request<Encounter>(`/api/encounters?id=${encodeURIComponent(id)}`),
      request<Saved[]>("/api/player-digimon"),
      request<Tamer[]>("/api/player-tamers"),
    ]);
    setOpen(encounter);
    setOwned(savedRows);
    setTamers(tamerRows);
  }
  async function refresh() {
    if (open) await loadEncounter(open.id);
    await loadList();
  }
  useEffect(() => {
    void request<Record<string, unknown>>("/api/auth/session")
      .then((session) => {
        const authenticated = Boolean(session?.authenticated);
        setLoggedIn(authenticated);
        if (authenticated) void loadList();
      })
      .catch(() => setLoggedIn(false));
  }, []);
  const participants = useMemo(
    () => sortEncounterParticipants(open?.encounter_participants ?? []),
    [open],
  );
  useLayoutEffect(() => {
    const layout = combatLayoutRef.current;
    if (!layout) return;
    const measure = () => {
      const origin = layout.getBoundingClientRect().top;
      const next: Record<string, number> = {};
      let previous = -40;
      participants.forEach((participant) => {
        const sheet = sheetRefs.current[participant.id];
        const preferred = sheet
          ? sheet.getBoundingClientRect().top - origin + 24
          : previous + 58;
        const top = Math.max(preferred, previous + 58);
        next[participant.id] = top;
        previous = top;
      });
      setSheetOffsets((current) =>
        Object.keys(next).every((key) => next[key] === current[key]) &&
        Object.keys(current).length === Object.keys(next).length
          ? current
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(layout);
    Object.values(sheetRefs.current).forEach((sheet) => {
      if (sheet) observer.observe(sheet);
    });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [participants, detail]);
  async function openPicker(kind: EncounterParticipantKind) {
    setPicker(kind);
    setQuery("");
    if (kind === "saved_digimon" && !owned.length)
      setOwned(await request<Saved[]>("/api/player-digimon"));
    if (kind === "saved_tamer" && !tamers.length)
      setTamers(await request<Tamer[]>("/api/player-tamers"));
  }
  async function add(
    kind: EncounterParticipantKind,
    source: Digimon | Saved | Tamer | null,
    displayName: string,
  ) {
    if (!open) return;
    let snapshot: Record<string, unknown> = {},
      state: Record<string, unknown> = {},
      sourceId: string | null = null;
    if (kind === "official_digimon") {
      const digi = source as Digimon,
        bounds = stageRange(digi.stage),
        level = Math.max(
          bounds[0],
          Math.min(bounds[1], levels[digi.slug] ?? bounds[0]),
        );
      snapshot = {
        forms: [digi],
        formExtras: [
          { heldItems: [null, null], enhancementItem: null, feats: [] },
        ],
      };
      state = digiState(digi, level, props);
      sourceId = String(digi.id);
    }
    if (kind === "saved_digimon") {
      const selected = source as Saved;
      let root = selected;
      while (root.parent_digimon_id)
        root = owned.find((row) => row.id === root.parent_digimon_id) ?? root;
      const rows = [root];
      let child = owned.find(
        (row) => row.parent_digimon_id === rows.at(-1)?.id,
      );
      while (child) {
        rows.push(child);
        child = owned.find((row) => row.parent_digimon_id === rows.at(-1)?.id);
      }
      const forms = rows.map((row) => savedDigimon(row, props)),
        formIndex = Math.max(
          0,
          rows.findIndex((row) => row.id === selected.id),
        );
      const formStates = rows.map((row, index) =>
        digiState(
          forms[index],
          Number(row.level ?? stageRange(forms[index].stage)[0]),
          props,
          row.current_hp,
        ),
      );
      const sharedExtra = sharedEvolutionExtra(rows, props);
      snapshot = { forms, formExtras: rows.map(() => sharedExtra) };
      state = { formIndex, formStates };
      sourceId = selected.id;
    }
    if (kind === "saved_tamer") {
      const tamer = source as Tamer;
      const rows = (tamer.player_tamer_partners ?? [])
        .sort((a, b) => Number(a.slot_number) - Number(b.slot_number))
        .map((item) => item.player_digimon as Saved)
        .filter(Boolean);
      const partnerRows = rows.map((row) => evolutionRows(row, owned));
      const partnerForms = partnerRows.map((chain) =>
        chain.map((row) => savedDigimon(row, props)),
      );
      const activeFormIndexes = rows.map((row, index) =>
        Math.max(
          0,
          partnerRows[index].findIndex((form) => form.id === row.id),
        ),
      );
      const partners = partnerForms.map(
        (forms, index) => forms[activeFormIndexes[index]],
      );
      const partnerFormStates = partnerRows.map((chain, index) =>
        chain.map((row, formIndex) =>
          digiState(
            partnerForms[index][formIndex],
            Number(row.level ?? 1),
            props,
            row.current_hp,
          ),
        ),
      );
      const partnerFormExtras = partnerRows.map((chain) => {
        const shared = sharedEvolutionExtra(chain, props);
        return chain.map(() => shared);
      });
      const maxHp = Number(tamer.max_hp ?? tamer.maximum_hp ?? 6),
        secondContribution =
          Number(tamer.level ?? 1) >= 14 && partners[1]
            ? modifier(partners[1].charisma)
            : 0,
        maxPp = Math.max(
          0,
          1 +
            modifier(Number(tamer.charisma ?? 10)) +
            (partners[0] ? modifier(partners[0].charisma) : 0) +
            secondContribution,
        );
      snapshot = { tamer, partnerForms, partnerFormExtras };
      state = {
        currentHp: clampTracker(tamer.current_hp ?? maxHp, maxHp),
        maxHp,
        currentPp: clampTracker(tamer.current_partner_points ?? maxPp, maxPp),
        maxPp,
        activeFormIndexes,
        partnerFormStates,
        xrossedArmySlots: [],
      };
      sourceId = tamer.id;
    }
    if (kind === "player") snapshot = { player: true };
    try {
      await request("/api/encounters/participants", {
        method: "POST",
        body: JSON.stringify({
          encounter_id: open.id,
          participant_kind: kind,
          source_id: sourceId,
          display_name: displayName,
          snapshot,
          state,
        }),
      });
      setPicker(null);
      setStatus("");
      await refresh();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not add participant.",
      );
    }
  }
  async function update(
    participant: EncounterParticipant,
    patch: Record<string, unknown>,
  ) {
    const previous = open;
    setOpen((current) => current ? {
      ...current,
      encounter_participants: (current.encounter_participants ?? []).map((entry) =>
        entry.id === participant.id ? { ...entry, ...patch } as EncounterParticipant : entry),
    } : current);
    try {
      await request("/api/encounters/participants", {
        method: "PATCH",
        body: JSON.stringify({ id: participant.id, ...patch }),
      });
    } catch (error) {
      setOpen(previous);
      throw error;
    }
  }

  if (loggedIn === null)
    return <div className="loading-state">Loading encounters…</div>;
  if (!loggedIn)
    return (
      <section className="empty-state">
        <h2>Log in to manage encounters</h2>
        <p>Encounter Manager uses the same account as Character Creation.</p>
        <a className="primary-button" href="/character-creation">
          Log in
        </a>
      </section>
    );
  if (!open)
    return (
      <section className="encounter-list-panel">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Your encounters</p>
            <h2>Saved Encounters</h2>
          </div>
          <div className="encounter-create">
            <input
              placeholder="Encounter name"
              maxLength={80}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <button
              className="primary-button"
              disabled={!newName.trim()}
              onClick={async () => {
                try {
                  const value = await request<Encounter>("/api/encounters", {
                    method: "POST",
                    body: JSON.stringify({ name: newName }),
                  });
                  setNewName("");
                  await loadEncounter(value.id);
                  await loadList();
                } catch (error) {
                  setStatus(
                    error instanceof Error
                      ? error.message
                      : "Could not create encounter.",
                  );
                }
              }}
            >
              Create Encounter
            </button>
          </div>
        </div>
        {status && <p className="form-status error">{status}</p>}
        <div className="encounter-list">
          {encounters.map((encounter) => (
            <article key={encounter.id}>
              <button
                className="encounter-open"
                onClick={() => void loadEncounter(encounter.id)}
              >
                <strong>{encounter.name}</strong>
                <span>Round {encounter.round_number}</span>
              </button>
              <button
                className="danger-button"
                onClick={async () => {
                  if (confirm(`Delete ${encounter.name}?`)) {
                    await request(`/api/encounters?id=${encounter.id}`, {
                      method: "DELETE",
                    });
                    await loadList();
                  }
                }}
              >
                Delete
              </button>
            </article>
          ))}
        </div>
        {!encounters.length && (
          <div className="empty-state">
            Create your first encounter to begin.
          </div>
        )}
      </section>
    );

  const search = query.trim().toLowerCase();
  return (
    <div className="encounter-workspace">
      <div className="encounter-titlebar">
        <button onClick={() => setOpen(null)}>← Encounters</button>
        <input
          aria-label="Encounter name"
          value={open.name}
          onChange={(event) => setOpen({ ...open, name: event.target.value })}
          onBlur={() =>
            void request("/api/encounters", {
              method: "PATCH",
              body: JSON.stringify({ id: open.id, name: open.name }),
            }).then(refresh)
          }
        />
        <span>
          Round <strong>{open.round_number}</strong>
        </span>
      </div>
      {status && <p className="form-status error encounter-status">{status}</p>}
      <section className="initiative-panel">
        <div className="initiative-actions">
          <button onClick={() => void openPicker("official_digimon")}>
            + Monster Manual
          </button>
          <button onClick={() => void openPicker("saved_digimon")}>
            + My Digimon
          </button>
          <button onClick={() => void openPicker("saved_tamer")}>
            + My Characters
          </button>
          <button
            onClick={() => {
              const value = prompt("Player name");
              if (value?.trim()) void add("player", null, value.trim());
            }}
          >
            + Player
          </button>
        </div>
        <div className="initiative-list">
          {participants.map((participant) => (
            <div
              className={`initiative-row ${participant.id === open.active_participant_id ? "active" : ""}`}
              key={participant.id}
            >
              <button
                className="initiative-select"
                onClick={async () => {
                  await request("/api/encounters", {
                    method: "PATCH",
                    body: JSON.stringify({
                      id: open.id,
                      active_participant_id: participant.id,
                    }),
                  });
                  await refresh();
                  sheetRefs.current[participant.id]?.scrollIntoView({
                    behavior: "smooth",
                  });
                }}
              >
                <strong>{participant.display_name}</strong>
                <small>
                  {participant.participant_kind.replaceAll("_", " ")}
                </small>
              </button>
              <input
                type="number"
                aria-label={`${participant.display_name} initiative`}
                value={participant.initiative ?? ""}
                onChange={(event) =>
                  setOpen({
                    ...open,
                    encounter_participants: (
                      open.encounter_participants ?? []
                    ).map((row) =>
                      row.id === participant.id
                        ? {
                            ...row,
                            initiative:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          }
                        : row,
                    ),
                  })
                }
                onBlur={(event) =>
                  void update(participant, {
                    initiative:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
              <button
                className="icon-button"
                onClick={async () => {
                  await request(
                    `/api/encounters/participants?id=${participant.id}`,
                    { method: "DELETE" },
                  );
                  await refresh();
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>
      {picker && (
        <section className="encounter-picker">
          <div className="section-heading-row">
            <h3>Add {picker.replaceAll("_", " ")}</h3>
            <button className="icon-button" onClick={() => setPicker(null)}>
              ×
            </button>
          </div>
          <input
            type="search"
            placeholder="Search…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="encounter-picker-grid">
            {picker === "official_digimon" &&
              props.digimon
                .filter(
                  (digi) =>
                    !search ||
                    `${digi.name} ${digi.stage} ${digi.attribute} ${digi.field}`
                      .toLowerCase()
                      .includes(search),
                )
                .map((digi) => {
                  const bounds = stageRange(digi.stage),
                    value = levels[digi.slug] ?? bounds[0];
                  return (
                    <article key={digi.slug}>
                      <div>
                        <strong>{digi.name}</strong>
                        <small>
                          {digi.stage} · {digi.attribute} · {digi.field}
                        </small>
                      </div>
                      <label>
                        Level{" "}
                        <input
                          type="number"
                          min={bounds[0]}
                          max={bounds[1]}
                          value={value}
                          onChange={(event) =>
                            setLevels({
                              ...levels,
                              [digi.slug]: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <button
                        onClick={() =>
                          void add("official_digimon", digi, digi.name)
                        }
                      >
                        Add
                      </button>
                    </article>
                  );
                })}
            {picker === "saved_digimon" &&
              owned
                .filter(
                  (row) =>
                    !row.parent_digimon_id &&
                    (!search ||
                      String(row.name ?? "")
                        .toLowerCase()
                        .includes(search)),
                )
                .map((row) => (
                  <article key={row.id}>
                    <strong>{String(row.name ?? "Digimon")}</strong>
                    <button
                      onClick={() =>
                        void add(
                          "saved_digimon",
                          row,
                          String(row.name ?? "Digimon"),
                        )
                      }
                    >
                      Add
                    </button>
                  </article>
                ))}
            {picker === "saved_tamer" &&
              tamers
                .filter(
                  (row) =>
                    !search ||
                    String(row.name ?? "")
                      .toLowerCase()
                      .includes(search),
                )
                .map((row) => (
                  <article key={row.id}>
                    <strong>{String(row.name ?? "Character")}</strong>
                    <button
                      onClick={() =>
                        void add(
                          "saved_tamer",
                          row,
                          String(row.name ?? "Character"),
                        )
                      }
                    >
                      Add
                    </button>
                  </article>
                ))}
          </div>
        </section>
      )}
      <div className="encounter-combat-layout" ref={combatLayoutRef}>
        <div className="encounter-sheets">
          {participants
            .filter((participant) => participant.participant_kind !== "player")
            .map((participant) => {
              const snapshot = participant.snapshot as Record<string, unknown>,
                state = participant.state as Record<string, unknown>;
              if (participant.participant_kind === "saved_tamer") {
                const tamer = snapshot.tamer as Tamer,
                  liveTamer = tamers.find(
                    (row) => row.id === participant.source_id,
                  );
                const legacyPartners =
                  (snapshot.partners as Digimon[] | undefined) ?? [];
                const sourcePartnerRows = (
                  Array.isArray(tamer.player_tamer_partners)
                    ? (tamer.player_tamer_partners as Array<
                        Record<string, unknown>
                      >)
                    : []
                )
                  .sort((a, b) => Number(a.slot_number) - Number(b.slot_number))
                  .map((join) =>
                    owned.find(
                      (row) => row.id === String(join.player_digimon_id),
                    ),
                  )
                  .filter((row): row is Saved => Boolean(row));
                const livePartnerChains = sourcePartnerRows.map((row) =>
                  evolutionRows(row, owned),
                );
                const partnerForms =
                  (snapshot.partnerForms as Digimon[][] | undefined) ??
                  (livePartnerChains.length
                    ? livePartnerChains.map((chain) =>
                        chain.map((row) => savedDigimon(row, props)),
                      )
                    : legacyPartners.map((digi) => [digi]));
                const activeIndexes =
                  (state.activeFormIndexes as number[] | undefined) ??
                  (livePartnerChains.length
                    ? livePartnerChains.map((chain, index) =>
                        Math.max(
                          0,
                          chain.findIndex(
                            (row) => row.id === sourcePartnerRows[index]?.id,
                          ),
                        ),
                      )
                    : partnerForms.map(() => 0));
                const partnerFormStates =
                  (state.partnerFormStates as DigiState[][] | undefined) ??
                  (livePartnerChains.length
                    ? livePartnerChains.map((chain, index) =>
                        chain.map((row, formIndex) =>
                          digiState(
                            partnerForms[index][formIndex],
                            Number(row.level ?? 1),
                            props,
                            row.current_hp,
                          ),
                        ),
                      )
                    : (
                        (state.partnerStates as DigiState[] | undefined) ?? []
                      ).map((item) => [item]));
                const storedPartnerExtras =
                  (snapshot.partnerFormExtras as FormExtra[][] | undefined) ??
                  (
                    (snapshot.partnerExtras as FormExtra[] | undefined) ?? []
                  ).map((item) => [item]);
                const partnerExtras = partnerForms.map((forms, index) => {
                  const shared = sharedEvolutionExtra(
                    livePartnerChains[index] ?? [],
                    props,
                    storedPartnerExtras[index] ?? [],
                  );
                  return forms.map(() => shared);
                });
                const army = [
                  ...(Array.isArray(tamer.player_tamer_army)
                    ? (tamer.player_tamer_army as ArmyMember[])
                    : []),
                ].sort((a, b) => a.slot_number - b.slot_number);
                const xrossedSlots =
                  (state.xrossedArmySlots as number[] | undefined) ?? [];
                const xrossArmy = army.map((member) => ({
                  ...member,
                  is_xrossed: xrossedSlots.includes(member.slot_number),
                }));
                const bonuses = armyXrossBonuses(xrossArmy);
                const activePartners = partnerForms
                  .map(
                    (forms, index) =>
                      forms[
                        Math.max(
                          0,
                          Math.min(forms.length - 1, activeIndexes[index] ?? 0),
                        )
                      ],
                  )
                  .filter(Boolean);
                if (activePartners[0])
                  activePartners[0] = {
                    ...activePartners[0],
                    strength:
                      activePartners[0].strength + (bonuses.strength ?? 0),
                    dexterity:
                      activePartners[0].dexterity + (bonuses.dexterity ?? 0),
                    constitution:
                      activePartners[0].constitution +
                      (bonuses.constitution ?? 0),
                    intelligence:
                      activePartners[0].intelligence +
                      (bonuses.intelligence ?? 0),
                    wisdom: activePartners[0].wisdom + (bonuses.wisdom ?? 0),
                    charisma:
                      activePartners[0].charisma + (bonuses.charisma ?? 0),
                  };
                const tamerLevel = Number(tamer.level ?? 1),
                  subclass = props.tamerSubclasses.find(
                    (item) => item.id === Number(tamer.subclass_id),
                  );
                const recalculatedMaxPp = Math.max(
                  0,
                  1 +
                    modifier(Number(tamer.charisma ?? 10)) +
                    (activePartners[0]
                      ? modifier(activePartners[0].charisma)
                      : 0) +
                    (subclass?.slug.toLowerCase() === "dual-wielder" &&
                    tamerLevel >= 14 &&
                    activePartners[1]
                      ? modifier(activePartners[1].charisma)
                      : 0),
                );
                const tamerState = {
                  ...state,
                  maxPp: recalculatedMaxPp,
                  currentPp: clampTracker(state.currentPp, recalculatedMaxPp),
                };
                const featureKey = detail?.startsWith(
                  `${participant.id}:feature:`,
                )
                  ? detail.slice(`${participant.id}:feature:`.length)
                  : "";
                const feature = props.tamerSubclassFeatures.find(
                  (item) =>
                    item.subclassId === subclass?.id &&
                    item.slug === featureKey,
                );
                return (
                  <section
                    key={participant.id}
                    className={`encounter-sheet-group tamer-encounter-group ${participant.id === open.active_participant_id ? "active" : ""}`}
                    ref={(node) => {
                      sheetRefs.current[participant.id] = node;
                    }}
                  >
                    <EncounterTamerSheet
                      tamer={tamer}
                      state={tamerState}
                      props={props}
                      firstPartner={activePartners[0]}
                      army={army}
                      xrossedSlots={xrossedSlots}
                      onToggleXross={(slot) =>
                        void update(participant, {
                          state: {
                            ...state,
                            xrossedArmySlots: xrossedSlots.includes(slot)
                              ? xrossedSlots.filter((item) => item !== slot)
                              : [...xrossedSlots, slot],
                          },
                        })
                      }
                      onState={(next) =>
                        void update(participant, { state: next })
                      }
                      onProficiencies={() =>
                        setDetail(
                          detail === participant.id ? null : participant.id,
                        )
                      }
                      onFeature={(slug) =>
                        setDetail(
                          detail === `${participant.id}:feature:${slug}`
                            ? null
                            : `${participant.id}:feature:${slug}`,
                        )
                      }
                    />
                    {partnerForms.map((forms, partnerIndex) => (
                      <div
                        className="encounter-partner-evolution-stack"
                        key={`${participant.id}-partner-${partnerIndex}`}
                      >
                        {forms.map((baseDigi, formIndex) => {
                          const isActive =
                              formIndex === (activeIndexes[partnerIndex] ?? 0),
                            digi =
                              partnerIndex === 0 && isActive
                                ? activePartners[0]
                                : baseDigi,
                            ds =
                              partnerFormStates[partnerIndex]?.[formIndex] ??
                              digiState(digi, 1, props),
                            extra =
                              partnerExtras[partnerIndex]?.[formIndex] ??
                              emptyExtra();
                          const switchForm = (nextIndex: number) => {
                            const next = [...activeIndexes];
                            next[partnerIndex] = nextIndex;
                            void update(participant, {
                              state: {
                                ...state,
                                activeFormIndexes: next,
                                xrossedArmySlots: [],
                              },
                            });
                          };
                          const savePartnerForm = (next: DigiState) => {
                            const allStates = partnerFormStates.map((rows) => [
                              ...rows,
                            ]);
                            while (allStates.length <= partnerIndex)
                              allStates.push([]);
                            allStates[partnerIndex][formIndex] = next;
                            return update(participant, {
                              state: { ...state, partnerFormStates: allStates },
                            });
                          };
                          return (
                            <div
                              className={`encounter-digimon-wrap encounter-evolution-frame prerendered-form${isActive ? " active" : ""}`}
                              aria-hidden={!isActive}
                              key={`${participant.id}-${partnerIndex}-${formIndex}`}
                            >
                              {forms.length > 1 && (
                                <>
                                  <button
                                    className="encounter-evolution-arrow previous"
                                    aria-label={`De-Digivolve ${digi.name}`}
                                    title="De-Digivolve"
                                    disabled={formIndex === 0}
                                    onClick={() => switchForm(formIndex - 1)}
                                  >
                                    ‹
                                  </button>
                                  <button
                                    className="encounter-evolution-arrow next"
                                    aria-label={`Digivolve ${digi.name}`}
                                    title="Digivolve"
                                    disabled={formIndex === forms.length - 1}
                                    onClick={() => switchForm(formIndex + 1)}
                                  >
                                    ›
                                  </button>
                                </>
                              )}
                              <MonsterManual
                                {...props}
                                digimon={[digi]}
                                feats={extra.feats}
                                heldItems={extra.heldItems}
                                enhancementItem={extra.enhancementItem}
                                initialSelectedSlug={digi.slug}
                                initialLevel={ds.level}
                                embedded
                                hideLevelControl
                                currentHp={ds.currentHp}
                                currentDigislot={ds.currentDigislot}
                                onCurrentHpChange={(value) =>
                                  savePartnerForm({ ...ds, currentHp: value })
                                }
                                onCurrentDigislotChange={(value) =>
                                  savePartnerForm({
                                    ...ds,
                                    currentDigislot: value,
                                  })
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    {detail === participant.id && (
                      <div className="encounter-combined-proficiencies anchored-detail">
                        {activePartners.map((digi, index) => (
                          <Proficiencies
                            key={`${participant.id}-${index}`}
                            digi={digi}
                            level={
                              partnerFormStates[index]?.[
                                activeIndexes[index] ?? 0
                              ]?.level ?? 1
                            }
                            levels={props.levels}
                          />
                        ))}
                      </div>
                    )}
                    {feature && (
                      <section className="subclass-feature-details anchored-detail">
                        <div>
                          <span className="eyebrow">
                            {subclass?.name} feature · Level{" "}
                            {feature.levelRequired}
                          </span>
                          <h3>{feature.name}</h3>
                        </div>
                        <p>{feature.description}</p>
                      </section>
                    )}
                  </section>
                );
              }
              const forms = (snapshot.forms as Digimon[] | undefined) ?? [],
                storedExtras =
                  (snapshot.formExtras as FormExtra[] | undefined) ?? [],
                selectedLive = owned.find(
                  (row) => row.id === participant.source_id,
                ),
                liveChain = selectedLive
                  ? evolutionRows(selectedLive, owned)
                  : [],
                sharedExtra = sharedEvolutionExtra(
                  liveChain,
                  props,
                  storedExtras,
                ),
                extras = forms.map(() => sharedExtra);
              if (!forms.length) return null;
              return (
                <EncounterDigimonForms
                  key={participant.id}
                  participant={participant}
                  props={props}
                  forms={forms}
                  extras={extras}
                  state={state}
                  active={participant.id === open.active_participant_id}
                  detailOpen={detail === participant.id}
                  onDetail={() =>
                    setDetail(detail === participant.id ? null : participant.id)
                  }
                  onUpdate={(next) => update(participant, { state: next })}
                  sheetRef={(node) => {
                    sheetRefs.current[participant.id] = node;
                  }}
                />
              );
            })}
        </div>
        <aside className="encounter-turn-rail" aria-label="Turn order">
          <span className="turn-rail-line" aria-hidden="true" />
          {participants.map((participant, index) => {
            const top = sheetOffsets[participant.id] ?? 24 + index * 64;
            return (
              <div
                className={`turn-rail-entry${participant.id === open.active_participant_id ? " active" : ""}`}
                style={{ top }}
                key={participant.id}
              >
                <button
                  className="turn-rail-name"
                  title={`Select ${participant.display_name}`}
                  onClick={async () => {
                    await request("/api/encounters", {
                      method: "PATCH",
                      body: JSON.stringify({
                        id: open.id,
                        active_participant_id: participant.id,
                      }),
                    });
                    await refresh();
                    sheetRefs.current[participant.id]?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                >
                  {participant.display_name}
                </button>
                <input
                  className="turn-initiative-circle"
                  type="number"
                  readOnly={editingInitiative !== participant.id}
                  aria-label={`${participant.display_name} initiative`}
                  title={
                    editingInitiative === participant.id
                      ? "Edit initiative"
                      : "Click to select turn; double-click to edit initiative"
                  }
                  value={participant.initiative ?? ""}
                  placeholder="—"
                  onClick={async () => {
                    if (editingInitiative === participant.id) return;
                    await request("/api/encounters", {
                      method: "PATCH",
                      body: JSON.stringify({
                        id: open.id,
                        active_participant_id: participant.id,
                      }),
                    });
                    await refresh();
                  }}
                  onDoubleClick={(event) => {
                    setEditingInitiative(participant.id);
                    requestAnimationFrame(() => event.currentTarget.focus());
                  }}
                  onChange={(event) =>
                    setOpen({
                      ...open,
                      encounter_participants: (
                        open.encounter_participants ?? []
                      ).map((row) =>
                        row.id === participant.id
                          ? {
                              ...row,
                              initiative:
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                            }
                          : row,
                      ),
                    })
                  }
                  onBlur={(event) => {
                    if (editingInitiative !== participant.id) return;
                    setEditingInitiative(null);
                    void update(participant, {
                      initiative:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    });
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    if (editingInitiative === participant.id) event.currentTarget.blur();
                    else {
                      setEditingInitiative(participant.id);
                      requestAnimationFrame(() => event.currentTarget.focus());
                    }
                  }}
                />
                <button
                  className="turn-rail-remove"
                  aria-label={`Remove ${participant.display_name}`}
                  onClick={async () => {
                    await request(
                      `/api/encounters/participants?id=${participant.id}`,
                      { method: "DELETE" },
                    );
                    await refresh();
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
