export type EncounterParticipantKind = "player" | "official_digimon" | "saved_digimon" | "saved_tamer";

export type EncounterParticipant = {
  id: string;
  encounter_id: string;
  participant_kind: EncounterParticipantKind;
  display_name: string;
  initiative: number | null;
  tie_order: number;
  source_id: string | null;
  snapshot: Record<string, unknown>;
  state: Record<string, unknown>;
};

export type EncounterResource = { current: number; maximum: number };
export type LightweightPlayerForm = {
  name: string;
  currentHp: number;
  maximumHp: number;
};
export type LightweightPlayerPartner = {
  slotNumber: number;
  activeFormIndex: number;
  forms: LightweightPlayerForm[];
  digislot: EncounterResource;
};
export type LightweightPlayerState = {
  tamerHp: EncounterResource;
  partnerPoints: EncounterResource;
  partners: LightweightPlayerPartner[];
};

export function sortEncounterParticipants<T extends Pick<EncounterParticipant, "initiative" | "tie_order">>(rows: T[]) {
  return [...rows].sort((a, b) => {
    if (a.initiative == null && b.initiative != null) return 1;
    if (a.initiative != null && b.initiative == null) return -1;
    if (a.initiative !== b.initiative) return Number(b.initiative ?? 0) - Number(a.initiative ?? 0);
    return a.tie_order - b.tie_order;
  });
}

export function adjacentTurn(
  participants: Array<Pick<EncounterParticipant, "id" | "initiative" | "tie_order">>,
  currentId: string | null,
  round: number,
  direction: 1 | -1,
) {
  const sorted = sortEncounterParticipants(participants);
  if (!sorted.length) return { participantId: null, round: 1 };
  const currentIndex = sorted.findIndex((row) => row.id === currentId);
  if (currentIndex < 0) return { participantId: sorted[0].id, round: Math.max(1, round) };
  const nextIndex = (currentIndex + direction + sorted.length) % sorted.length;
  const wrapped = direction === 1 ? nextIndex === 0 : currentIndex === 0;
  return {
    participantId: sorted[nextIndex].id,
    round: Math.max(1, round + (wrapped ? direction : 0)),
  };
}

export function clampTracker(value: unknown, maximum: unknown) {
  const max = Math.max(0, Math.trunc(Number(maximum) || 0));
  return Math.max(0, Math.min(max, Math.trunc(Number(value) || 0)));
}

export function normalizeResource(current: unknown, maximum: unknown): EncounterResource {
  const safeMaximum = Math.max(0, Math.trunc(Number(maximum) || 0));
  return { current: clampTracker(current, safeMaximum), maximum: safeMaximum };
}
