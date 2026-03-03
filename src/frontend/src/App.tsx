import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import {
  Camera,
  CheckCircle2,
  Circle,
  GripVertical,
  Loader2,
  Lock,
  Plus,
  Unlock,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useActor } from "./hooks/useActor";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LocalStaffingCard {
  id: string;
  personName: string;
  login: string;
  shiftCoHost: string;
  shiftPattern: string;
  col: string;
  createdBy: string;
  createdAt: string;
  status?: "IN" | "OUT";
}

interface LocalUniversityCard {
  id: string;
  title: string;
  term: string;
  col: string;
  createdBy: string;
  createdAt: string;
  // Assignment-specific fields (optional — course cards don't have these)
  assignmentTitle?: string;
  course?: string;
  dueDate?: string;
  week?: number; // 1–8 for the drop list
  completed?: boolean; // encoded in the week backend string as "N:done"
}

interface ColSection {
  key: string;
  title: string;
}

interface ColConfig {
  key: string;
  title: string;
  sections: ColSection[] | null;
  dropKey?: string;
}

// ─── Board Config ─────────────────────────────────────────────────────────────

const STAFFING_COLS: ColConfig[] = [
  {
    key: "stow",
    title: "STOW",
    sections: [
      { key: "stow_decanter", title: "Decanter/Process Guide" },
      { key: "stow_pallet_auditor", title: "Pallet Auditor" },
      { key: "stow_downstacker", title: "Downstacker" },
      { key: "stow_stower", title: "Stower (To Stow)" },
      { key: "stow_transporter", title: "Stow Transporter" },
    ],
  },
  {
    key: "pick",
    title: "PICK",
    sections: [
      { key: "pick_pg_loading", title: "Process Guide/Loading Picks" },
      { key: "pick_pallet_transfer", title: "8ft-6ft Pallet Transfer" },
      { key: "pick_picker", title: "Picker (To Pick)" },
      { key: "pick_transporter", title: "Pick Transporter" },
    ],
  },
  {
    key: "ls",
    title: "LaborShare",
    sections: [
      { key: "ls_in_ps", title: "XLX7 Inbound Problem Solve" },
      { key: "ls_out_ps", title: "XLX7 Outbound Problem Solve" },
      { key: "ls_ws", title: "XLX7 WaterSpider" },
    ],
  },
  {
    key: "ps",
    title: "PS",
    sections: [
      { key: "ps_qxy2", title: "QXY2 Problem Solve" },
      { key: "ps_icqa_iol", title: "ICQA IOL" },
      { key: "ps_icqa_bin", title: "ICQA Bin Counter" },
    ],
  },
  {
    key: "na",
    title: "Expected Employee",
    sections: null,
    dropKey: "staff_na",
  },
];

const SNHU_COLS: ColConfig[] = [
  {
    key: "mcs",
    title: "My Class Schedule",
    sections: [
      { key: "mcs_current", title: "Current Term" },
      { key: "mcs_upcoming", title: "Upcoming Term" },
    ],
  },
  {
    key: "ca",
    title: "Current Assignments",
    sections: null,
    dropKey: "ca_general",
  },
];

// Each week has two sub-buckets: not_started and in_progress
const WEEK_NUMS = [1, 2, 3, 4, 5, 6, 7, 8];
const WEEK_KEYS = WEEK_NUMS.map((w) => `ca_week_${w}`);
const weekNotStartedKey = (w: number) => `ca_week_${w}_not_started`;
const weekInProgressKey = (w: number) => `ca_week_${w}_in_progress`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () =>
  `${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;

const encodeId = (id: string): Uint8Array => new TextEncoder().encode(id);
const decodeId = (id: Uint8Array): string => new TextDecoder().decode(id);

const nowStamp = () => new Date().toLocaleString();

const todayStr = () =>
  new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const liveClockStr = () =>
  new Date().toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

// ─── Migration ────────────────────────────────────────────────────────────────

function migrateStaffingCol(oldCol: string): string {
  const validKeys = new Set([
    // STOW column sections
    "stow_decanter",
    "stow_pallet_auditor",
    "stow_downstacker",
    "stow_stower",
    "stow_transporter",
    // PICK column sections
    "pick_pg_loading",
    "pick_pallet_transfer",
    "pick_picker",
    "pick_transporter",
    // LaborShare sections
    "ls_in_ps",
    "ls_out_ps",
    "ls_ws",
    // PS sections
    "ps_qxy2",
    "ps_icqa_iol",
    "ps_icqa_bin",
    // Expected Employee
    "staff_na",
  ]);
  if (validKeys.has(oldCol)) return oldCol;

  // Old Process Guide sections → STOW
  if (oldCol === "pg_stow") return "stow_stower";
  if (oldCol === "pg_pick") return "pick_picker";

  // Old In Path Function sections → nearest STOW/PICK equivalent
  if (oldCol === "ipf_down") return "stow_downstacker";
  if (oldCol === "ipf_stow") return "stow_stower";
  if (oldCol === "ipf_pick") return "pick_picker";
  if (oldCol === "ipf_trans") return "stow_transporter";

  // Old IPF problem solve sections → PS column
  if (oldCol === "ipf_qxy2_ps") return "ps_qxy2";
  if (oldCol === "ipf_icqa_iol") return "ps_icqa_iol";

  // Old LaborShare keys
  if (oldCol === "ls_in") return "ls_in_ps";
  if (oldCol === "ls_out") return "ls_out_ps";

  // Old PS column keys
  if (oldCol === "ps_iol") return "ps_icqa_iol";
  if (oldCol === "ps_xlx7") return "ls_in_ps";

  return "staff_na";
}

function migrateSnhuCol(oldCol: string): string {
  const valid = new Set<string>(["mcs_current", "mcs_upcoming", "ca_general"]);
  // Add all week not-started and in-progress keys as valid
  for (const w of WEEK_NUMS) {
    valid.add(weekNotStartedKey(w));
    valid.add(weekInProgressKey(w));
  }
  if (valid.has(oldCol)) return oldCol;
  // Old keys → new keys
  if (
    oldCol === "cur_term" ||
    oldCol === "cur_pending" ||
    oldCol === "cur_progress"
  )
    return "mcs_current";
  if (
    oldCol === "up_term" ||
    oldCol === "up_pending" ||
    oldCol === "up_progress"
  )
    return "mcs_upcoming";
  // Any old week buckets (without _not_started/_in_progress suffix) → ca_general
  if (
    oldCol === "ca_not_started" ||
    oldCol === "ca_in_progress" ||
    oldCol === "snhu_na" ||
    WEEK_KEYS.includes(oldCol)
  )
    return "ca_general";
  return "ca_general";
}

// ─── Default Data ─────────────────────────────────────────────────────────────

const LOGIN_NAME = "migudavc";
const LS_STAFFING_KEY = `swb_staffing_${LOGIN_NAME}`;
const LS_UNIVERSITY_KEY = `swb_university_${LOGIN_NAME}`;

function miguelCard(): LocalStaffingCard {
  return {
    id: `miguel-${uid()}`,
    personName: "Miguel A Davalos",
    login: "migudavc",
    shiftCoHost: "DB3T0700",
    shiftPattern: "Back Half Days",
    col: "staff_na",
    createdBy: "migudavc",
    createdAt: new Date().toISOString(),
    status: "OUT",
  };
}

function normalizeSnhuCards(
  cards: LocalUniversityCard[],
): LocalUniversityCard[] {
  // Filter out the old canonical default courses (if present from prior sessions)
  const defaultIds = new Set([
    "snhu-eng190",
    "snhu-ids105",
    "snhu-eco202",
    "snhu-phl260",
  ]);
  return cards
    .filter((c) => c && !defaultIds.has(c.id))
    .map((c) => ({ ...c, col: migrateSnhuCol(c.col) }));
}

// ─── UI State Encoding ────────────────────────────────────────────────────────
// We piggyback UI state (selected section / week) onto the lastUpdated backend
// field as a JSON envelope so it syncs cross-device without new backend APIs.

interface UIStateEnvelope {
  ts: string;
  sel: Record<string, string>;
  week: number | null;
}

function decodeLastUpdated(raw: string): UIStateEnvelope {
  try {
    const parsed = JSON.parse(raw) as UIStateEnvelope;
    if (parsed && typeof parsed.ts === "string") return parsed;
  } catch {
    // plain string timestamp (legacy)
  }
  return { ts: raw, sel: {}, week: null };
}

// Build the lastUpdated envelope — module-level so it is stable (no useCallback dep needed)
function buildEnvelope(
  stamp: string,
  sel: Record<string, string>,
  week: number | null,
  dev: string,
  seq: number,
): string {
  return JSON.stringify({ ts: stamp, sel, week, dev, seq });
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  activeBoard: "amazon" | "snhu";
  onBoardChange: (b: "amazon" | "snhu") => void;
  lastUpdated: string;
  isLocked: boolean;
  onLock: () => void;
  onRequestUnlock: () => void;
  headCount: number;
}

function TopBar({
  activeBoard,
  onBoardChange,
  lastUpdated,
  isLocked,
  onLock,
  onRequestUnlock,
  headCount,
}: TopBarProps) {
  const [liveTime, setLiveTime] = useState(liveClockStr);

  useEffect(() => {
    const t = setInterval(() => setLiveTime(liveClockStr()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header
      className="glass-panel rounded-2xl shadow-panel"
      style={{ padding: "14px 16px" }}
    >
      <div
        className="topbar-grid grid items-center gap-3"
        style={{ gridTemplateColumns: "1fr auto 1fr" }}
      >
        {/* Left: board selector + meta */}
        <div className="flex flex-col gap-2 items-start min-w-0">
          <select
            value={activeBoard}
            onChange={(e) => onBoardChange(e.target.value as "amazon" | "snhu")}
            className="w-full max-w-[360px] rounded-xl text-sm outline-none transition-colors"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.92)",
              padding: "10px 12px",
            }}
          >
            <option value="amazon">
              Amazon Workplace: Demorians Department
            </option>
            <option value="snhu">
              Southern New Hampshire University (SNHU)
            </option>
          </select>

          <div
            className="flex flex-wrap items-center gap-3"
            style={{ fontSize: 12, color: "var(--text-muted)" }}
          >
            <span>
              <strong>Last Updated:</strong> {lastUpdated}
            </span>
          </div>
        </div>

        {/* Center: title + date/clock */}
        <div className="flex flex-col items-center justify-center gap-1.5 text-center">
          <h1
            className="font-display font-extrabold m-0 tracking-tight"
            style={{ fontSize: 18, color: "var(--text-primary)" }}
          >
            My Digital Board 2.0
          </h1>
          <div
            className="flex items-center gap-2 whitespace-nowrap"
            style={{ fontSize: 14, opacity: 0.86 }}
          >
            {todayStr()}
            <span style={{ opacity: 0.55 }}>•</span>
            {liveTime}
          </div>
        </div>

        {/* Right: lock/unlock + HC */}
        <div className="flex flex-col items-end gap-2">
          {isLocked ? (
            <button
              type="button"
              onClick={onRequestUnlock}
              className="flex items-center gap-1.5 text-xs rounded-xl transition-colors"
              style={{
                background: "var(--btn-unlock)",
                border: "1px solid var(--btn-unlock-border)",
                color: "rgba(255,120,120,0.9)",
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              <Lock size={13} />
              Unlock
            </button>
          ) : (
            <button
              type="button"
              onClick={onLock}
              className="flex items-center gap-1.5 text-xs rounded-xl transition-colors"
              style={{
                background: "var(--btn-lock)",
                border: "1px solid var(--btn-lock-border)",
                color: "rgba(255,200,60,0.9)",
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              <Unlock size={13} />
              Lock
            </button>
          )}
          {activeBoard === "amazon" && (
            <div
              style={{
                fontSize: 16,
                color: "var(--text-muted)",
                fontWeight: 700,
                letterSpacing: "0.3px",
              }}
            >
              HC: {headCount}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── MiguelPhotoUpload ────────────────────────────────────────────────────────

const MIGUEL_PHOTO_KEY = "miguel_photo";

interface MiguelPhotoUploadProps {
  photoDataUrl: string | null;
  onPhotoChange: (dataUrl: string) => void;
}

function MiguelPhotoUpload({
  photoDataUrl,
  onPhotoChange,
}: MiguelPhotoUploadProps) {
  const [hovered, setHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target?.result as string;
      // Compress/resize to a small thumbnail so it always fits in localStorage
      const img = new Image();
      img.onload = () => {
        const MAX = 200; // max dimension in px
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          onPhotoChange(rawDataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", 0.82);
        onPhotoChange(compressed);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={photoDataUrl ? "Click to change photo" : "Click to upload photo"}
      aria-label={
        photoDataUrl ? "Change profile photo" : "Upload profile photo"
      }
      style={{
        width: 56,
        height: 56,
        flexShrink: 0,
        borderRadius: 12,
        border: photoDataUrl
          ? "1px solid rgba(255,255,255,0.18)"
          : "1.5px dashed rgba(255,255,255,0.30)",
        background: photoDataUrl ? "transparent" : "rgba(255,255,255,0.06)",
        cursor: "pointer",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        transition: "border-color 0.15s, background 0.15s",
        padding: 0,
      }}
    >
      {photoDataUrl ? (
        <>
          <img
            src={photoDataUrl}
            alt="Miguel A Davalos"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              transition: "opacity 0.15s",
              opacity: hovered ? 0.55 : 1,
            }}
          />
          {hovered && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
              }}
            >
              <Camera size={18} style={{ color: "rgba(255,255,255,0.9)" }} />
            </div>
          )}
        </>
      ) : (
        <Camera
          size={20}
          style={{
            color: hovered
              ? "rgba(255,255,255,0.75)"
              : "rgba(255,255,255,0.40)",
            transition: "color 0.15s",
          }}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
        aria-label="Upload photo"
      />
    </button>
  );
}

// ─── StaffingCard ─────────────────────────────────────────────────────────────

interface StaffingCardViewProps {
  card: LocalStaffingCard;
  isLocked: boolean;
  onDragStart: (e: React.DragEvent, cardId: string) => void;
  miguelPhoto: string | null;
  onMiguelPhotoChange: (dataUrl: string) => void;
  onStatusToggle: (cardId: string) => void;
}

function StaffingCardView({
  card,
  isLocked,
  onDragStart,
  miguelPhoto,
  onMiguelPhotoChange,
  onStatusToggle,
}: StaffingCardViewProps) {
  const isMiguel = card.login === "migudavc";
  const status = card.status ?? "OUT";
  const isIn = status === "IN";

  return (
    <div
      draggable={!isLocked}
      onDragStart={(e) => onDragStart(e, card.id)}
      title={isLocked ? "Locked" : "Drag to move"}
      style={{
        transition: "transform 0.45s cubic-bezier(0.4, 0.2, 0.2, 1)",
        transform: isIn ? "rotate(0deg)" : "rotate(180deg)",
        transformOrigin: "center center",
      }}
    >
      <div
        className="glass-card rounded-2xl no-select transition-shadow"
        style={{
          padding: "12px",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          className="flex items-center justify-between gap-2"
          style={{
            // Counter-rotate content so text is always readable
            transform: isIn ? "rotate(0deg)" : "rotate(180deg)",
            transition: "transform 0.45s cubic-bezier(0.4, 0.2, 0.2, 1)",
          }}
        >
          {/* Photo upload square — only for Miguel */}
          {isMiguel && (
            <div
              draggable={false}
              onDragStart={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              style={{ flexShrink: 0 }}
            >
              <MiguelPhotoUpload
                photoDataUrl={miguelPhoto}
                onPhotoChange={onMiguelPhotoChange}
              />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p
              className="font-bold truncate m-0"
              style={{ fontSize: 14, color: "var(--text-primary)" }}
            >
              {card.personName}{" "}
              <span style={{ fontWeight: 500, opacity: 0.75 }}>
                ({card.login})
              </span>
            </p>
            <div
              className="mt-1"
              style={{ fontSize: 13, color: "rgba(255,255,255,0.82)" }}
            >
              {card.shiftCoHost} &mdash; {card.shiftPattern}
            </div>

            {/* IN / OUT status toggle */}
            <div
              className="flex gap-1.5 mt-2"
              draggable={false}
              onDragStart={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isIn) onStatusToggle(card.id);
                }}
                style={{
                  padding: "3px 10px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: isIn ? "default" : "pointer",
                  border: isIn
                    ? "1px solid rgba(29,185,84,0.55)"
                    : "1px solid rgba(255,255,255,0.15)",
                  background: isIn
                    ? "rgba(29,185,84,0.22)"
                    : "rgba(255,255,255,0.05)",
                  color: isIn
                    ? "rgba(80,220,130,0.95)"
                    : "rgba(255,255,255,0.40)",
                  transition: "all 0.15s",
                }}
              >
                IN
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isIn) onStatusToggle(card.id);
                }}
                style={{
                  padding: "3px 10px",
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: !isIn ? "default" : "pointer",
                  border: !isIn
                    ? "1px solid rgba(255,77,77,0.55)"
                    : "1px solid rgba(255,255,255,0.15)",
                  background: !isIn
                    ? "rgba(255,77,77,0.20)"
                    : "rgba(255,255,255,0.05)",
                  color: !isIn
                    ? "rgba(255,120,120,0.95)"
                    : "rgba(255,255,255,0.40)",
                  transition: "all 0.15s",
                }}
              >
                OUT
              </button>
            </div>
          </div>

          {!isLocked && (
            <div
              draggable={false}
              onDragStart={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <GripVertical
                size={14}
                style={{
                  color: "var(--text-dim)",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── UniversityCard ───────────────────────────────────────────────────────────

interface UniversityCardViewProps {
  card: LocalUniversityCard;
  isLocked: boolean;
  onDragStart: (e: React.DragEvent, cardId: string) => void;
  onToggleCompleted: (cardId: string) => void;
}

function UniversityCardView({
  card,
  isLocked,
  onDragStart,
  onToggleCompleted,
}: UniversityCardViewProps) {
  const isAssignment = Boolean(card.assignmentTitle);
  const isCompleted = Boolean(card.completed);

  return (
    <div
      className="glass-card rounded-2xl no-select transition-shadow"
      draggable={!isLocked}
      onDragStart={(e) => onDragStart(e, card.id)}
      title={isLocked ? "Locked" : "Drag to move"}
      style={{
        padding: "12px",
        boxShadow: "var(--shadow-card)",
        cursor: isLocked ? "default" : "grab",
        opacity: isCompleted ? 0.72 : 1,
        transition: "opacity 0.2s",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {/* Completed checkmark — only on assignment cards */}
            {isAssignment && (
              <button
                type="button"
                draggable={false}
                onDragStart={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCompleted(card.id);
                }}
                title={isCompleted ? "Mark as incomplete" : "Mark as complete"}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  flexShrink: 0,
                  marginTop: 1,
                  color: isCompleted
                    ? "rgba(29,185,84,0.9)"
                    : "rgba(255,255,255,0.30)",
                  transition: "color 0.15s",
                }}
              >
                {isCompleted ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <Circle size={17} />
                )}
              </button>
            )}
            <p
              className="font-bold m-0"
              style={{
                fontSize: 14,
                color: "var(--text-primary)",
                textDecoration: isCompleted ? "line-through" : "none",
                opacity: isCompleted ? 0.65 : 1,
              }}
            >
              {isAssignment ? card.assignmentTitle : card.title}
            </p>
          </div>
          {isAssignment ? (
            <div
              className="flex flex-col gap-0.5 mt-1"
              style={{ paddingLeft: isAssignment ? 25 : 0 }}
            >
              {card.course && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                  Course: {card.course}
                </div>
              )}
              {card.term && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                  Term: {card.term}
                </div>
              )}
              {card.dueDate && (
                <div
                  style={{
                    fontSize: 12,
                    color: isCompleted
                      ? "rgba(255,255,255,0.4)"
                      : "rgba(255,200,80,0.85)",
                  }}
                >
                  Due: {card.dueDate}
                </div>
              )}
              {isCompleted && (
                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(29,185,84,0.8)",
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  Completed
                </div>
              )}
            </div>
          ) : (
            <div
              className="mt-1"
              style={{ fontSize: 13, color: "rgba(255,255,255,0.82)" }}
            >
              {card.term}
            </div>
          )}
        </div>
        {!isLocked && (
          <GripVertical
            size={14}
            style={{ color: "var(--text-dim)", flexShrink: 0, marginTop: 2 }}
          />
        )}
      </div>
    </div>
  );
}

// ─── DropBucket ───────────────────────────────────────────────────────────────

interface DropBucketProps {
  bucketKey: string;
  label?: string;
  count: number;
  dragOverId: string | null;
  isLocked: boolean;
  children: React.ReactNode;
  onDragOver: (e: React.DragEvent, key: string) => void;
  onDrop: (e: React.DragEvent, key: string) => void;
  onDragLeave: () => void;
  showHeader?: boolean;
}

function DropBucket({
  bucketKey,
  label,
  count,
  dragOverId,
  isLocked,
  children,
  onDragOver,
  onDrop,
  onDragLeave,
  showHeader = true,
}: DropBucketProps) {
  const isDragOver = !isLocked && dragOverId === bucketKey;

  return (
    <div
      className={`glass-sub rounded-2xl overflow-hidden transition-all ${isDragOver ? "drag-over-highlight" : ""}`}
      onDragOverCapture={(e) => onDragOver(e, bucketKey)}
      onDragEnterCapture={(e) => onDragOver(e, bucketKey)}
      onDropCapture={(e) => onDrop(e, bucketKey)}
      onDragLeave={onDragLeave}
    >
      {showHeader && label && (
        <div
          className="flex items-center justify-between"
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.10)",
            fontSize: 13,
          }}
        >
          <span
            className="font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {label}
          </span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {count > 0 ? count : ""}
          </span>
        </div>
      )}

      <div
        className="flex flex-col gap-2"
        style={{ padding: 10, minHeight: 80 }}
      >
        {count === 0 && (
          <div
            className="rounded-xl"
            style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.40)",
              border: "1px dashed rgba(255,255,255,0.18)",
              padding: "10px 12px",
              minHeight: 26,
            }}
          />
        )}
        {children}
      </div>
    </div>
  );
}

// ─── AddCourseModal ───────────────────────────────────────────────────────────

interface AddCourseModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (
    card: Omit<LocalUniversityCard, "id" | "createdAt" | "col" | "createdBy">,
  ) => void;
}

function AddCourseModal({ open, onClose, onAdd }: AddCourseModalProps) {
  const [title, setTitle] = useState("");
  const [term, setTerm] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), term: term.trim() });
    setTitle("");
    setTerm("");
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    fontSize: 14,
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="border-0 max-w-md"
        style={{
          background: "rgba(18,26,51,0.97)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 18,
          boxShadow: "var(--shadow-modal)",
          color: "rgba(255,255,255,0.92)",
        }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontSize: 15, color: "rgba(255,255,255,0.92)" }}
          >
            Add Course
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-1">
          <div className="flex flex-col gap-1.5">
            <Label style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Course Title *
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. MAT 140: Precalculus"
              required
              style={inputStyle}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Term
            </Label>
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="e.g. C-4 Term - July thru August 2026"
              style={inputStyle}
            />
          </div>

          <DialogFooter className="mt-1 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl text-sm transition-colors"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.75)",
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl text-sm font-semibold transition-colors"
              style={{
                background: "var(--btn-primary)",
                border: "1px solid var(--btn-primary-border)",
                color: "var(--btn-primary-text)",
                padding: "8px 18px",
                cursor: "pointer",
              }}
            >
              Add
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── AddAssignmentModal ───────────────────────────────────────────────────────

interface AddAssignmentModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (
    card: Omit<LocalUniversityCard, "id" | "createdAt" | "col" | "createdBy">,
  ) => void;
}

function AddAssignmentModal({ open, onClose, onAdd }: AddAssignmentModalProps) {
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [course, setCourse] = useState("");
  const [term, setTerm] = useState("");
  const [dueDate, setDueDate] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignmentTitle.trim()) return;
    onAdd({
      title: assignmentTitle.trim(), // keep title field for compatibility
      assignmentTitle: assignmentTitle.trim(),
      course: course.trim(),
      term: term.trim(),
      dueDate: dueDate.trim(),
    });
    setAssignmentTitle("");
    setCourse("");
    setTerm("");
    setDueDate("");
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    fontSize: 14,
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="border-0 max-w-md"
        style={{
          background: "rgba(18,26,51,0.97)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 18,
          boxShadow: "var(--shadow-modal)",
          color: "rgba(255,255,255,0.92)",
        }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontSize: 15, color: "rgba(255,255,255,0.92)" }}
          >
            Add Assignment
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-1">
          <div className="flex flex-col gap-1.5">
            <Label style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Assignment Title *
            </Label>
            <Input
              value={assignmentTitle}
              onChange={(e) => setAssignmentTitle(e.target.value)}
              placeholder="e.g. Week 1 Discussion Post"
              required
              style={inputStyle}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Course
            </Label>
            <Input
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. ENG 190: Research and Persuasion"
              style={inputStyle}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Term
            </Label>
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="e.g. C-2 Term - March thru April 2026"
              style={inputStyle}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Due Date
            </Label>
            <Input
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              placeholder="e.g. March 15, 2026"
              style={inputStyle}
            />
          </div>

          <DialogFooter className="mt-1 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl text-sm transition-colors"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.75)",
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl text-sm font-semibold transition-colors"
              style={{
                background: "var(--btn-primary)",
                border: "1px solid var(--btn-primary-border)",
                color: "var(--btn-primary-text)",
                padding: "8px 18px",
                cursor: "pointer",
              }}
            >
              Add Assignment
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── DeleteCourseModal ────────────────────────────────────────────────────────

interface DeleteCourseModalProps {
  open: boolean;
  cards: LocalUniversityCard[];
  onClose: () => void;
  onDelete: (cardId: string) => void;
}

function DeleteCourseModal({
  open,
  cards,
  onClose,
  onDelete,
}: DeleteCourseModalProps) {
  const [selectedId, setSelectedId] = useState("");

  function handleDelete() {
    if (!selectedId) return;
    onDelete(selectedId);
    setSelectedId("");
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.14)",
    color: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    fontSize: 14,
    width: "100%",
    padding: "10px 12px",
    outline: "none",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="border-0 max-w-md"
        style={{
          background: "rgba(18,26,51,0.97)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 18,
          boxShadow: "var(--shadow-modal)",
          color: "rgba(255,255,255,0.92)",
        }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontSize: 15, color: "rgba(255,255,255,0.92)" }}
          >
            Delete Course
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-1">
          <div className="flex flex-col gap-1.5">
            <Label style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Select course to delete
            </Label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              style={inputStyle}
            >
              <option value="">-- Choose a course --</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter className="mt-1 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl text-sm transition-colors"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.75)",
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!selectedId}
              className="rounded-xl text-sm font-semibold transition-colors"
              style={{
                background: selectedId
                  ? "rgba(255,77,77,0.18)"
                  : "rgba(255,255,255,0.05)",
                border: selectedId
                  ? "1px solid rgba(255,77,77,0.4)"
                  : "1px solid rgba(255,255,255,0.10)",
                color: selectedId
                  ? "rgba(255,120,120,0.95)"
                  : "rgba(255,255,255,0.3)",
                padding: "8px 18px",
                cursor: selectedId ? "pointer" : "not-allowed",
              }}
            >
              Delete
            </button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── UnlockModal ──────────────────────────────────────────────────────────────

interface UnlockModalProps {
  open: boolean;
  onClose: () => void;
  onUnlock: () => void;
}

function UnlockModal({ open, onClose, onUnlock }: UnlockModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="border-0 max-w-sm"
        style={{
          background: "rgba(18,26,51,0.97)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 18,
          boxShadow: "var(--shadow-modal)",
          color: "rgba(255,255,255,0.92)",
        }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontSize: 15, color: "rgba(255,255,255,0.92)" }}
          >
            Unlock board?
          </DialogTitle>
        </DialogHeader>

        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            margin: "4px 0 0 0",
            lineHeight: 1.5,
          }}
        >
          This enables editing and moving cards.
        </p>

        <DialogFooter className="mt-3 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl text-sm transition-colors"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.75)",
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onUnlock}
            className="rounded-xl text-sm font-semibold transition-colors"
            style={{
              background: "var(--btn-primary)",
              border: "1px solid var(--btn-primary-border)",
              color: "var(--btn-primary-text)",
              padding: "8px 18px",
              cursor: "pointer",
            }}
          >
            Unlock
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── StaffingBoard ────────────────────────────────────────────────────────────

interface StaffingBoardProps {
  cards: LocalStaffingCard[];
  isLocked: boolean;
  onMove: (cardId: string, newCol: string) => void;
  onStatusToggle: (cardId: string) => void;
  miguelPhoto: string | null;
  onMiguelPhotoChange: (dataUrl: string) => void;
  selectedSection: Record<string, string>;
  onSelectedSectionChange: (next: Record<string, string>) => void;
}

function StaffingBoard({
  cards,
  isLocked,
  onMove,
  onStatusToggle,
  miguelPhoto,
  onMiguelPhotoChange,
  selectedSection,
  onSelectedSectionChange,
}: StaffingBoardProps) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const buckets = useMemo(() => {
    const m: Record<string, LocalStaffingCard[]> = {};
    for (const col of STAFFING_COLS) {
      if (col.sections) for (const s of col.sections) m[s.key] = [];
      if (!col.sections && col.dropKey) m[col.dropKey] = [];
    }
    for (const c of cards) {
      if (!m[c.col]) m[c.col] = [];
      m[c.col].push(c);
    }
    return m;
  }, [cards]);

  function onDragStart(e: React.DragEvent, cardId: string) {
    if (isLocked) {
      e.preventDefault();
      toast.warning("Locked. Unlock to edit.");
      return;
    }
    e.dataTransfer.setData("text/plain", cardId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent, key: string) {
    if (isLocked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(key);
  }

  function onDrop(e: React.DragEvent, bucketKey: string) {
    if (isLocked) {
      toast.warning("Locked. Unlock to edit.");
      return;
    }
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain");
    if (!cardId) return;
    onMove(cardId, bucketKey);
    setDragOverId(null);
  }

  const selectStyle: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.92)",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 14,
    outline: "none",
    cursor: "pointer",
  };

  return (
    <>
      <div
        className="board-grid mt-3"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
        }}
      >
        {STAFFING_COLS.map((col) => {
          const colCount = col.sections
            ? col.sections.reduce(
                (sum, s) => sum + (buckets[s.key]?.length ?? 0),
                0,
              )
            : (buckets[col.dropKey ?? ""]?.length ?? 0);

          const activeSectionKey = selectedSection[col.key] ?? "";
          const activeSection = col.sections?.find(
            (s) => s.key === activeSectionKey,
          );

          return (
            <div
              key={col.key}
              className="glass-panel rounded-2xl overflow-hidden flex flex-col"
              style={{ boxShadow: "var(--shadow-panel)", minHeight: 420 }}
            >
              <div
                className="flex items-center justify-between"
                style={{
                  padding: "12px 12px 10px",
                  borderBottom: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <h2
                  className="m-0 font-semibold"
                  style={{ fontSize: 14, color: "var(--text-primary)" }}
                >
                  {col.title}
                </h2>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {colCount > 0 ? colCount : ""}
                </span>
              </div>

              <div
                className="flex flex-col gap-2 flex-1"
                style={{ padding: 12 }}
              >
                {col.sections ? (
                  <>
                    {/* Section select toggle — styled like the board toggle */}
                    <select
                      value={activeSectionKey}
                      onChange={(e) =>
                        onSelectedSectionChange({
                          ...selectedSection,
                          [col.key]: e.target.value,
                        })
                      }
                      style={selectStyle}
                      data-ocid={`staffing.${col.key}.section.select`}
                    >
                      <option value="" />
                      {col.sections.map((sec) => (
                        <option key={sec.key} value={sec.key}>
                          {sec.title}
                          {(buckets[sec.key]?.length ?? 0) > 0
                            ? ` (${buckets[sec.key].length})`
                            : ""}
                        </option>
                      ))}
                    </select>

                    {/* Show the selected section's drop bucket */}
                    {activeSection && (
                      <DropBucket
                        bucketKey={activeSection.key}
                        label={activeSection.title}
                        count={buckets[activeSection.key]?.length ?? 0}
                        dragOverId={dragOverId}
                        isLocked={isLocked}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        onDragLeave={() => setDragOverId(null)}
                      >
                        {(buckets[activeSection.key] ?? []).map((card) => (
                          <StaffingCardView
                            key={card.id}
                            card={card}
                            isLocked={isLocked}
                            onDragStart={onDragStart}
                            miguelPhoto={miguelPhoto}
                            onMiguelPhotoChange={onMiguelPhotoChange}
                            onStatusToggle={onStatusToggle}
                          />
                        ))}
                      </DropBucket>
                    )}
                  </>
                ) : (
                  <DropBucket
                    bucketKey={col.dropKey!}
                    count={buckets[col.dropKey ?? ""]?.length ?? 0}
                    dragOverId={dragOverId}
                    isLocked={isLocked}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onDragLeave={() => setDragOverId(null)}
                    showHeader={false}
                  >
                    {(buckets[col.dropKey ?? ""] ?? []).map((card) => (
                      <StaffingCardView
                        key={card.id}
                        card={card}
                        isLocked={isLocked}
                        onDragStart={onDragStart}
                        miguelPhoto={miguelPhoto}
                        onMiguelPhotoChange={onMiguelPhotoChange}
                        onStatusToggle={onStatusToggle}
                      />
                    ))}
                  </DropBucket>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── SnhuBoard ────────────────────────────────────────────────────────────────

interface SnhuBoardProps {
  cards: LocalUniversityCard[];
  isLocked: boolean;
  onMove: (cardId: string, newCol: string) => void;
  onAdd: (
    card: Omit<LocalUniversityCard, "id" | "createdAt" | "col" | "createdBy">,
  ) => void;
  onAddAssignment: (
    card: Omit<LocalUniversityCard, "id" | "createdAt" | "col" | "createdBy">,
  ) => void;
  onDelete: (cardId: string) => void;
  onToggleCompleted: (cardId: string) => void;
  selectedWeek: number | null;
  onSelectedWeekChange: (week: number | null) => void;
}

function SnhuBoard({
  cards,
  isLocked,
  onMove,
  onAdd,
  onAddAssignment,
  onDelete,
  onToggleCompleted,
  selectedWeek,
  onSelectedWeekChange,
}: SnhuBoardProps) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addAssignOpen, setAddAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const buckets = useMemo(() => {
    const m: Record<string, LocalUniversityCard[]> = {
      mcs_current: [],
      mcs_upcoming: [],
      ca_general: [],
    };
    // Initialize all week buckets
    for (const w of WEEK_NUMS) {
      m[weekNotStartedKey(w)] = [];
      m[weekInProgressKey(w)] = [];
    }
    for (const c of cards) {
      if (!m[c.col]) m[c.col] = [];
      m[c.col].push(c);
    }
    return m;
  }, [cards]);

  function onDragStart(e: React.DragEvent, cardId: string) {
    if (isLocked) {
      e.preventDefault();
      toast.warning("Locked. Unlock to edit.");
      return;
    }
    e.dataTransfer.setData("text/plain", cardId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent, key: string) {
    if (isLocked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(key);
  }

  function onDrop(e: React.DragEvent, bucketKey: string) {
    if (isLocked) {
      toast.warning("Locked. Unlock to edit.");
      return;
    }
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain");
    if (!cardId) return;
    onMove(cardId, bucketKey);
    setDragOverId(null);
  }

  function renderCards(bucketKey: string) {
    return (buckets[bucketKey] ?? []).map((card) => (
      <UniversityCardView
        key={card.id}
        card={card}
        isLocked={isLocked}
        onDragStart={onDragStart}
        onToggleCompleted={onToggleCompleted}
      />
    ));
  }

  return (
    <>
      <div
        className="board-grid-2 mt-3"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
          alignItems: "start",
        }}
      >
        {SNHU_COLS.map((col) => {
          const isMyClassSchedule = col.key === "mcs";
          const isCurrentAssignments = col.key === "ca";

          const colCount = isMyClassSchedule
            ? (col.sections ?? []).reduce(
                (sum, s) => sum + (buckets[s.key]?.length ?? 0),
                0,
              )
            : isCurrentAssignments
              ? WEEK_NUMS.reduce(
                  (sum, w) =>
                    sum +
                    (buckets[weekNotStartedKey(w)]?.length ?? 0) +
                    (buckets[weekInProgressKey(w)]?.length ?? 0),
                  0,
                )
              : (buckets[col.dropKey ?? ""]?.length ?? 0);

          return (
            <div
              key={col.key}
              className="glass-panel rounded-2xl overflow-hidden flex flex-col"
              style={{ boxShadow: "var(--shadow-panel)", minHeight: 420 }}
            >
              {/* Column header */}
              <div
                className="flex items-center justify-between"
                style={{
                  padding: "12px 12px 10px",
                  borderBottom: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <h2
                  className="m-0 font-semibold"
                  style={{ fontSize: 14, color: "var(--text-primary)" }}
                >
                  {col.title}
                </h2>
                <div className="flex items-center gap-2">
                  {/* Add/Delete Course buttons inside My Class Schedule column */}
                  {isMyClassSchedule && !isLocked && (
                    <>
                      <button
                        type="button"
                        onClick={() => setDeleteOpen(true)}
                        className="flex items-center gap-1 text-xs rounded-lg transition-colors"
                        style={{
                          background: "rgba(255,77,77,0.14)",
                          border: "1px solid rgba(255,77,77,0.35)",
                          color: "rgba(255,120,120,0.9)",
                          padding: "4px 10px",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        Delete Course
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddOpen(true)}
                        className="flex items-center gap-1 text-xs rounded-lg transition-colors"
                        style={{
                          background: "var(--btn-primary)",
                          border: "1px solid var(--btn-primary-border)",
                          color: "var(--btn-primary-text)",
                          padding: "4px 10px",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        <Plus size={11} />
                        Add Course
                      </button>
                    </>
                  )}
                  {/* Add Assignment button inside Current Assignments column */}
                  {isCurrentAssignments && !isLocked && (
                    <button
                      type="button"
                      onClick={() => setAddAssignOpen(true)}
                      className="flex items-center gap-1 text-xs rounded-lg transition-colors"
                      style={{
                        background: "var(--btn-primary)",
                        border: "1px solid var(--btn-primary-border)",
                        color: "var(--btn-primary-text)",
                        padding: "4px 10px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      <Plus size={11} />
                      Add Assignment
                    </button>
                  )}
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {colCount > 0 ? colCount : ""}
                  </span>
                </div>
              </div>

              <div
                className="flex flex-col gap-2 flex-1"
                style={{ padding: 12 }}
              >
                {isMyClassSchedule ? (
                  (col.sections ?? []).map((sec) => (
                    <DropBucket
                      key={sec.key}
                      bucketKey={sec.key}
                      label={sec.title}
                      count={buckets[sec.key]?.length ?? 0}
                      dragOverId={dragOverId}
                      isLocked={isLocked}
                      onDragOver={onDragOver}
                      onDrop={onDrop}
                      onDragLeave={() => setDragOverId(null)}
                      showHeader={true}
                    >
                      {renderCards(sec.key)}
                    </DropBucket>
                  ))
                ) : isCurrentAssignments ? (
                  <div className="flex flex-col gap-2">
                    {/* Week select dropdown — styled like the board toggle */}
                    <select
                      value={selectedWeek ?? ""}
                      onChange={(e) =>
                        onSelectedWeekChange(
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      style={{
                        width: "100%",
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "rgba(255,255,255,0.92)",
                        borderRadius: 12,
                        padding: "10px 12px",
                        fontSize: 14,
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value="" />
                      {WEEK_NUMS.map((w) => (
                        <option key={w} value={w}>
                          Week {w}
                        </option>
                      ))}
                    </select>

                    {/* Not Started + In Progress sub-sections — shown when a week is selected */}
                    {selectedWeek !== null && (
                      <>
                        <DropBucket
                          bucketKey={weekNotStartedKey(selectedWeek)}
                          label="Not Started"
                          count={
                            buckets[weekNotStartedKey(selectedWeek)]?.length ??
                            0
                          }
                          dragOverId={dragOverId}
                          isLocked={isLocked}
                          onDragOver={onDragOver}
                          onDrop={onDrop}
                          onDragLeave={() => setDragOverId(null)}
                          showHeader={true}
                        >
                          {renderCards(weekNotStartedKey(selectedWeek))}
                        </DropBucket>
                        <DropBucket
                          bucketKey={weekInProgressKey(selectedWeek)}
                          label="In Progress"
                          count={
                            buckets[weekInProgressKey(selectedWeek)]?.length ??
                            0
                          }
                          dragOverId={dragOverId}
                          isLocked={isLocked}
                          onDragOver={onDragOver}
                          onDrop={onDrop}
                          onDragLeave={() => setDragOverId(null)}
                          showHeader={true}
                        >
                          {renderCards(weekInProgressKey(selectedWeek))}
                        </DropBucket>
                      </>
                    )}
                  </div>
                ) : (
                  <DropBucket
                    bucketKey={col.dropKey!}
                    count={buckets[col.dropKey ?? ""]?.length ?? 0}
                    dragOverId={dragOverId}
                    isLocked={isLocked}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onDragLeave={() => setDragOverId(null)}
                    showHeader={false}
                  >
                    {renderCards(col.dropKey!)}
                  </DropBucket>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AddCourseModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={onAdd}
      />
      <AddAssignmentModal
        open={addAssignOpen}
        onClose={() => setAddAssignOpen(false)}
        onAdd={onAddAssignment}
      />
      <DeleteCourseModal
        open={deleteOpen}
        cards={cards}
        onClose={() => setDeleteOpen(false)}
        onDelete={onDelete}
      />
    </>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { actor, isFetching } = useActor();

  const [loaded, setLoaded] = useState(false);
  const [activeBoard, setActiveBoard] = useState<"amazon" | "snhu">("amazon");
  const [lastUpdated, setLastUpdated] = useState(
    () => localStorage.getItem("swb_lastUpdated") ?? nowStamp(),
  );
  const [isLocked, setIsLocked] = useState(
    () => localStorage.getItem(`swb_locked_${LOGIN_NAME}`) === "1",
  );
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);

  const [staffingCards, setStaffingCards] = useState<LocalStaffingCard[]>([]);
  const [universityCards, setUniversityCards] = useState<LocalUniversityCard[]>(
    [],
  );
  // UI state — synced cross-device via backend lastUpdated field
  const [selectedSection, setSelectedSection] = useState<
    Record<string, string>
  >({});
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const [miguelPhoto, setMiguelPhoto] = useState<string | null>(() => {
    try {
      return localStorage.getItem(MIGUEL_PHOTO_KEY);
    } catch {
      return null;
    }
  });

  function handleMiguelPhotoChange(dataUrl: string) {
    setMiguelPhoto(dataUrl);
    // The dataUrl is already compressed to a small thumbnail, so this should always succeed
    try {
      localStorage.setItem(MIGUEL_PHOTO_KEY, dataUrl);
    } catch (err) {
      // Extremely unlikely now that the image is compressed; just log it
      console.warn("Could not save photo to localStorage", err);
    }
  }

  // Load from backend on mount (once actor is ready)
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!actor || isFetching || loadedRef.current) return;
    loadedRef.current = true;

    async function loadData() {
      try {
        const [rawStaff, rawUni, lu] = await Promise.all([
          actor!.getAllStaffingCards(),
          actor!.getAllUniversityCards(),
          actor!.getLastUpdated(),
        ]);

        // Process staffing cards — all fields including status now come from backend
        let sCards: LocalStaffingCard[] = rawStaff.map((c) => {
          const id = decodeId(c.id);
          return {
            id,
            personName: c.personName,
            login: c.login,
            shiftCoHost: c.shiftCoHost,
            shiftPattern: c.shiftPattern,
            col: migrateStaffingCol(c.col),
            createdBy: c.createdBy,
            createdAt: c.createdAt,
            status: (c.status === "IN" ? "IN" : "OUT") as "IN" | "OUT",
          };
        });

        if (sCards.length === 0) {
          sCards = [miguelCard()];
          // Save defaults
          await actor!.saveAllStaffingCards(
            sCards.map((c) => ({
              id: encodeId(c.id),
              personName: c.personName,
              login: c.login,
              shiftCoHost: c.shiftCoHost,
              shiftPattern: c.shiftPattern,
              col: c.col,
              createdBy: c.createdBy,
              createdAt: c.createdAt,
              status: c.status ?? "OUT",
            })),
          );
        } else {
          // Ensure Miguel is present
          const hasMiguel = sCards.some(
            (c) =>
              c.login === "migudavc" &&
              c.personName.toLowerCase().includes("miguel"),
          );
          if (!hasMiguel) sCards = [miguelCard(), ...sCards];
        }

        // Process university cards — decode all fields from backend
        // week encoding: "N" = week N not completed, "N:done" = week N completed
        let uCards: LocalUniversityCard[] = rawUni.map((c) => {
          const weekRaw = c.week ?? "";
          const isDone = weekRaw.endsWith(":done");
          const weekNumStr = isDone ? weekRaw.slice(0, -5) : weekRaw;
          const weekNum =
            weekNumStr && weekNumStr !== "0" ? Number(weekNumStr) : undefined;
          return {
            id: decodeId(c.id),
            title: c.title,
            term: c.term,
            col: migrateSnhuCol(c.col),
            createdBy: c.createdBy,
            createdAt: c.createdAt,
            assignmentTitle: c.assignmentTitle || undefined,
            course: c.course || undefined,
            dueDate: c.dueDate || undefined,
            week: weekNum,
            completed: isDone,
          };
        });

        uCards = normalizeSnhuCards(uCards);

        // Always save to keep backend in sync after migration/normalization
        await actor!.saveAllUniversityCards(
          uCards.map((c) => ({
            id: encodeId(c.id),
            title: c.title,
            term: c.term,
            col: c.col,
            createdBy: c.createdBy,
            createdAt: c.createdAt,
            assignmentTitle: c.assignmentTitle ?? "",
            course: c.course ?? "",
            dueDate: c.dueDate ?? "",
            week:
              c.week !== undefined
                ? c.completed
                  ? `${c.week}:done`
                  : String(c.week)
                : "0",
          })),
        );

        if (lu) {
          const env = decodeLastUpdated(lu);
          setLastUpdated(env.ts || lu);
          localStorage.setItem("swb_lastUpdated", env.ts || lu);
          // Restore UI state from backend on initial load — apply all values
          // including empty-object sel and null week so the board matches
          // exactly what was last saved (even if that means "nothing selected").
          const initSel = env.sel ?? {};
          setSelectedSection(initSel);
          selectedSectionRef.current = initSel;
          // week can legitimately be null (no week selected)
          const initWeek = env.week !== undefined ? env.week : null;
          setSelectedWeek(initWeek);
          selectedWeekRef.current = initWeek;
        }

        // Sync latest data into localStorage for offline fallback
        localStorage.setItem(LS_STAFFING_KEY, JSON.stringify(sCards));
        localStorage.setItem(LS_UNIVERSITY_KEY, JSON.stringify(uCards));

        setStaffingCards(sCards);
        setUniversityCards(uCards);
        setLoaded(true);
      } catch (err) {
        console.error("Failed to load data from backend", err);
        // Try localStorage fallback before using hardcoded defaults
        try {
          const lsStaff = localStorage.getItem(LS_STAFFING_KEY);
          const lsUni = localStorage.getItem(LS_UNIVERSITY_KEY);

          let sCards: LocalStaffingCard[] = lsStaff
            ? (JSON.parse(lsStaff) as LocalStaffingCard[]).map((c) => ({
                ...c,
                col: migrateStaffingCol(c.col),
              }))
            : [miguelCard()];

          const hasMiguel = sCards.some(
            (c) =>
              c.login === "migudavc" &&
              c.personName.toLowerCase().includes("miguel"),
          );
          if (!hasMiguel) sCards = [miguelCard(), ...sCards];

          let uCards: LocalUniversityCard[] = lsUni
            ? (JSON.parse(lsUni) as LocalUniversityCard[]).map((c) => ({
                ...c,
                col: migrateSnhuCol(c.col),
              }))
            : [];
          uCards = normalizeSnhuCards(uCards);

          setStaffingCards(sCards);
          setUniversityCards(uCards);
        } catch {
          setStaffingCards([miguelCard()]);
          setUniversityCards(normalizeSnhuCards([]));
        }
        setLoaded(true);
      }
    }

    loadData();
  }, [actor, isFetching]);

  // Persist lock state
  useEffect(() => {
    localStorage.setItem(`swb_locked_${LOGIN_NAME}`, isLocked ? "1" : "0");
  }, [isLocked]);

  // ─── Save tracking ────────────────────────────────────────────────────────────
  // Unique device token — embedded in every save so polls can tell "is this from me?"
  const mySaveGen = useRef(
    `dev-${Math.random().toString(36).slice(2)}-${Date.now()}`,
  );
  // Monotonically-increasing sequence number for our own saves
  const saveSeqRef = useRef(0);
  // Seq of the most recently *completed* save to the backend from this device
  const lastCompletedSeqRef = useRef(-1);
  // Number of saves currently in-flight (started but not yet completed)
  const pendingSaveCount = useRef(0);
  // Wall-clock time (ms) of the most recently completed save — used to apply a
  // short grace period so polls don't overwrite our fresh UI state immediately.
  const lastSaveCompletedAtMs = useRef(0);
  // Refs to always have the latest UI state available in callbacks
  const selectedSectionRef = useRef<Record<string, string>>({});
  const selectedWeekRef = useRef<number | null>(null);
  useEffect(() => {
    selectedSectionRef.current = selectedSection;
  }, [selectedSection]);
  useEffect(() => {
    selectedWeekRef.current = selectedWeek;
  }, [selectedWeek]);

  // ─── Save helpers ─────────────────────────────────────────────────────────────
  // localStorage is written immediately (synchronous). Backend is async.
  // Every completed save records its seq + wall-clock time so the poll can
  // distinguish "my own fresh write" from "a write from another device".

  const completeSave = useCallback((seq: number) => {
    lastCompletedSeqRef.current = Math.max(lastCompletedSeqRef.current, seq);
    lastSaveCompletedAtMs.current = Date.now();
    pendingSaveCount.current = Math.max(0, pendingSaveCount.current - 1);
  }, []);

  const saveStaffing = useCallback(
    (cards: LocalStaffingCard[]) => {
      localStorage.setItem(LS_STAFFING_KEY, JSON.stringify(cards));
      const stamp = nowStamp();
      setLastUpdated(stamp);
      localStorage.setItem("swb_lastUpdated", stamp);

      if (!actor) return;
      pendingSaveCount.current += 1;
      const seq = ++saveSeqRef.current;
      const encoded = buildEnvelope(
        stamp,
        selectedSectionRef.current,
        selectedWeekRef.current,
        mySaveGen.current,
        seq,
      );
      actor
        .saveAllStaffingCards(
          cards.map((c) => ({
            id: encodeId(c.id),
            personName: c.personName,
            login: c.login,
            shiftCoHost: c.shiftCoHost,
            shiftPattern: c.shiftPattern,
            col: c.col,
            createdBy: c.createdBy,
            createdAt: c.createdAt,
            status: c.status ?? "OUT",
          })),
        )
        .then(() => actor.setLastUpdated(encoded))
        .then(() => completeSave(seq))
        .catch(() => {
          pendingSaveCount.current = Math.max(0, pendingSaveCount.current - 1);
          toast.warning("Saved locally.", { id: "save-warn", duration: 2500 });
        });
    },
    [actor, completeSave],
  );

  const saveUniversity = useCallback(
    (cards: LocalUniversityCard[]) => {
      localStorage.setItem(LS_UNIVERSITY_KEY, JSON.stringify(cards));
      const stamp = nowStamp();
      setLastUpdated(stamp);
      localStorage.setItem("swb_lastUpdated", stamp);

      if (!actor) return;
      pendingSaveCount.current += 1;
      const seq = ++saveSeqRef.current;
      const encoded = buildEnvelope(
        stamp,
        selectedSectionRef.current,
        selectedWeekRef.current,
        mySaveGen.current,
        seq,
      );
      actor
        .saveAllUniversityCards(
          cards.map((c) => ({
            id: encodeId(c.id),
            title: c.title,
            term: c.term,
            col: c.col,
            createdBy: c.createdBy,
            createdAt: c.createdAt,
            assignmentTitle: c.assignmentTitle ?? "",
            course: c.course ?? "",
            dueDate: c.dueDate ?? "",
            week:
              c.week !== undefined
                ? c.completed
                  ? `${c.week}:done`
                  : String(c.week)
                : "0",
          })),
        )
        .then(() => actor.setLastUpdated(encoded))
        .then(() => completeSave(seq))
        .catch(() => {
          pendingSaveCount.current = Math.max(0, pendingSaveCount.current - 1);
          toast.warning("Saved locally.", { id: "save-warn", duration: 2500 });
        });
    },
    [actor, completeSave],
  );

  // Save only UI state (selectedSection / selectedWeek) to the backend.
  const saveUIState = useCallback(
    (sel: Record<string, string>, week: number | null) => {
      if (!actor) return;
      const stamp = nowStamp();
      setLastUpdated(stamp);
      localStorage.setItem("swb_lastUpdated", stamp);
      pendingSaveCount.current += 1;
      const seq = ++saveSeqRef.current;
      const encoded = buildEnvelope(stamp, sel, week, mySaveGen.current, seq);
      actor
        .setLastUpdated(encoded)
        .then(() => completeSave(seq))
        .catch(() => {
          pendingSaveCount.current = Math.max(0, pendingSaveCount.current - 1);
        });
    },
    [actor, completeSave],
  );

  // ─── Background polling for cross-device sync ────────────────────────────────
  // Grace period (ms) after a completed save during which we suppress applying
  // remote UI state, to avoid bouncing our own just-saved selection back.
  // Card data is ALWAYS applied regardless.
  const UI_STATE_GRACE_MS = 8_000;

  const fetchAndMerge = useCallback(async () => {
    if (!actor) return;

    try {
      const [rawStaff, rawUni, lu] = await Promise.all([
        actor.getAllStaffingCards(),
        actor.getAllUniversityCards(),
        actor.getLastUpdated(),
      ]);

      // ── Card data: ALWAYS apply — never skip due to pending saves ──────────
      const sCards: LocalStaffingCard[] = rawStaff.map((c) => ({
        id: decodeId(c.id),
        personName: c.personName,
        login: c.login,
        shiftCoHost: c.shiftCoHost,
        shiftPattern: c.shiftPattern,
        col: migrateStaffingCol(c.col),
        createdBy: c.createdBy,
        createdAt: c.createdAt,
        status: (c.status === "IN" ? "IN" : "OUT") as "IN" | "OUT",
      }));

      const hasMiguel = sCards.some(
        (c) =>
          c.login === "migudavc" &&
          c.personName.toLowerCase().includes("miguel"),
      );
      const finalStaff = hasMiguel ? sCards : [miguelCard(), ...sCards];

      let uCards: LocalUniversityCard[] = rawUni.map((c) => {
        const weekRaw = c.week ?? "";
        const isDone = weekRaw.endsWith(":done");
        const weekNumStr = isDone ? weekRaw.slice(0, -5) : weekRaw;
        const weekNum =
          weekNumStr && weekNumStr !== "0" ? Number(weekNumStr) : undefined;
        return {
          id: decodeId(c.id),
          title: c.title,
          term: c.term,
          col: migrateSnhuCol(c.col),
          createdBy: c.createdBy,
          createdAt: c.createdAt,
          assignmentTitle: c.assignmentTitle || undefined,
          course: c.course || undefined,
          dueDate: c.dueDate || undefined,
          week: weekNum,
          completed: isDone,
        };
      });
      uCards = normalizeSnhuCards(uCards);

      // Apply card data unconditionally
      setStaffingCards(finalStaff);
      setUniversityCards(uCards);
      localStorage.setItem(LS_STAFFING_KEY, JSON.stringify(finalStaff));
      localStorage.setItem(LS_UNIVERSITY_KEY, JSON.stringify(uCards));

      // ── UI state: apply unless we just saved it from this device ──────────
      if (lu) {
        let env: UIStateEnvelope & { dev?: string; seq?: number };
        try {
          const parsed = JSON.parse(lu);
          env =
            parsed && typeof parsed.ts === "string"
              ? parsed
              : { ts: lu, sel: {}, week: null };
        } catch {
          env = { ts: lu, sel: {}, week: null };
        }

        setLastUpdated(env.ts || lu);
        localStorage.setItem("swb_lastUpdated", env.ts || lu);

        // Decide whether to apply the remote UI state.
        // Skip only when ALL THREE are true:
        //   1. The write came from THIS device (same dev token)
        //   2. Its seq is within what we've already written
        //   3. We completed a save within the grace window
        //      (so the backend still reflects our latest selection)
        const isFromThisDevice = env.dev === mySaveGen.current;
        const remoteSeq = typeof env.seq === "number" ? env.seq : -1;
        const withinGrace =
          Date.now() - lastSaveCompletedAtMs.current < UI_STATE_GRACE_MS;
        const isOurOwnFreshWrite =
          isFromThisDevice &&
          remoteSeq <= lastCompletedSeqRef.current &&
          withinGrace;

        if (!isOurOwnFreshWrite) {
          const remoteSel = env.sel ?? {};
          setSelectedSection(remoteSel);
          selectedSectionRef.current = remoteSel;
          const remoteWeek =
            env.week !== undefined && env.week !== null ? env.week : null;
          setSelectedWeek(remoteWeek);
          selectedWeekRef.current = remoteWeek;
        }
      }
    } catch {
      // Silent fail — offline or transient error
    }
  }, [actor]);

  useEffect(() => {
    if (!loaded || !actor) return;

    // Poll every 5 seconds for fast cross-device sync
    const interval = setInterval(fetchAndMerge, 5_000);

    // Re-fetch immediately when user switches back to this tab
    const onFocus = () => fetchAndMerge();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loaded, actor, fetchAndMerge]);

  // Staffing card handlers
  function handleStaffingMove(cardId: string, newCol: string) {
    const next = staffingCards.map((c) =>
      c.id === cardId ? { ...c, col: newCol } : c,
    );
    setStaffingCards(next);
    saveStaffing(next);
  }

  function handleStaffingStatusToggle(cardId: string) {
    const next = staffingCards.map((c) =>
      c.id === cardId
        ? {
            ...c,
            status:
              (c.status ?? "OUT") === "IN" ? ("OUT" as const) : ("IN" as const),
          }
        : c,
    );
    setStaffingCards(next);
    saveStaffing(next);
  }

  // University card handlers
  function handleUniversityMove(cardId: string, newCol: string) {
    const next = universityCards.map((c) =>
      c.id === cardId ? { ...c, col: newCol } : c,
    );
    setUniversityCards(next);
    saveUniversity(next);
  }

  function handleUniversityAdd(
    data: Omit<LocalUniversityCard, "id" | "createdAt" | "col" | "createdBy">,
  ) {
    const newCard: LocalUniversityCard = {
      ...data,
      id: `snhu-${uid()}`,
      col: "mcs_current",
      createdBy: LOGIN_NAME,
      createdAt: new Date().toISOString(),
    };
    const next = [...universityCards, newCard];
    setUniversityCards(next);
    toast.success("Course added.");
    saveUniversity(next);
  }

  function handleUniversityAddAssignment(
    data: Omit<LocalUniversityCard, "id" | "createdAt" | "col" | "createdBy">,
  ) {
    // Place the new assignment into the currently selected week's Not Started
    // bucket. If no week is selected, default to week 1.
    const targetWeek = selectedWeek ?? 1;
    // Auto-select week 1 in the UI if nothing was selected — update refs
    // synchronously BEFORE calling saveUniversity so the single save encodes
    // the correct week (avoids a second racing saveUIState call).
    if (selectedWeek === null) {
      setSelectedWeek(1);
      selectedWeekRef.current = 1;
      // DO NOT call saveUIState here — saveUniversity below will encode
      // the updated week in one atomic backend write.
    }
    const newCard: LocalUniversityCard = {
      ...data,
      id: `assign-${uid()}`,
      col: weekNotStartedKey(targetWeek),
      week: targetWeek, // store the week number so backend encodes it correctly
      createdBy: LOGIN_NAME,
      createdAt: new Date().toISOString(),
      completed: false,
    };
    const next = [...universityCards, newCard];
    setUniversityCards(next);
    toast.success("Assignment added.");
    // Single save — encodes both the card data AND the updated week UI state
    saveUniversity(next);
  }

  function handleUniversityDelete(cardId: string) {
    const next = universityCards.filter((c) => c.id !== cardId);
    setUniversityCards(next);
    toast.success("Course deleted.");
    saveUniversity(next);
  }

  function handleUniversityToggleCompleted(cardId: string) {
    const next = universityCards.map((c) =>
      c.id === cardId ? { ...c, completed: !c.completed } : c,
    );
    setUniversityCards(next);
    saveUniversity(next);
  }

  function handleSelectedSectionChange(next: Record<string, string>) {
    setSelectedSection(next);
    selectedSectionRef.current = next;
    saveUIState(next, selectedWeekRef.current);
  }

  function handleSelectedWeekChange(week: number | null) {
    setSelectedWeek(week);
    selectedWeekRef.current = week;
    saveUIState(selectedSectionRef.current, week);
  }

  function handleLock() {
    setIsLocked(true);
    toast.info("Board locked.");
  }

  function handleRequestUnlock() {
    setUnlockModalOpen(true);
  }

  function handleUnlock() {
    setIsLocked(false);
    setUnlockModalOpen(false);
    toast.info("Board unlocked.");
  }

  // Loading state
  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2
            size={28}
            className="animate-spin"
            style={{ color: "rgba(255,255,255,0.5)" }}
          />
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Loading board...
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: "rgba(18,26,51,0.95)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "rgba(255,255,255,0.92)",
            fontSize: 13,
            borderRadius: 14,
          },
          duration: 1800,
        }}
      />

      <div className="mx-auto" style={{ maxWidth: 1500, padding: 20 }}>
        <TopBar
          activeBoard={activeBoard}
          onBoardChange={setActiveBoard}
          lastUpdated={lastUpdated}
          isLocked={isLocked}
          onLock={handleLock}
          onRequestUnlock={handleRequestUnlock}
          headCount={
            activeBoard === "amazon"
              ? staffingCards.length
              : universityCards.length
          }
        />

        <main>
          {activeBoard === "amazon" ? (
            <StaffingBoard
              cards={staffingCards}
              isLocked={isLocked}
              onMove={handleStaffingMove}
              onStatusToggle={handleStaffingStatusToggle}
              miguelPhoto={miguelPhoto}
              onMiguelPhotoChange={handleMiguelPhotoChange}
              selectedSection={selectedSection}
              onSelectedSectionChange={handleSelectedSectionChange}
            />
          ) : (
            <SnhuBoard
              cards={universityCards}
              isLocked={isLocked}
              onMove={handleUniversityMove}
              onAdd={handleUniversityAdd}
              onAddAssignment={handleUniversityAddAssignment}
              onDelete={handleUniversityDelete}
              onToggleCompleted={handleUniversityToggleCompleted}
              selectedWeek={selectedWeek}
              onSelectedWeekChange={handleSelectedWeekChange}
            />
          )}
        </main>

        <footer
          className="mt-8 text-center"
          style={{ fontSize: 12, color: "var(--text-dim)" }}
        >
          © {new Date().getFullYear()}.{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text-dim)", textDecoration: "none" }}
          >
            Built with ♥ using caffeine.ai
          </a>
        </footer>
      </div>

      <UnlockModal
        open={unlockModalOpen}
        onClose={() => setUnlockModalOpen(false)}
        onUnlock={handleUnlock}
      />
    </>
  );
}
