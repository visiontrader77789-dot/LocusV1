/**
 * Curated local emoji library.
 *
 * A small, hand-picked set of emoji organised into categories, each with
 * search keywords (including the category label itself so "nature" finds
 * nature emoji). Everything is stored/cached locally — nothing is fetched.
 *
 * Recency + frequency history lives in localStorage so it survives reloads
 * and is cheap to read on every picker open.
 */
import { normalize } from "./util";

export interface EmojiEntry {
  char: string;
  keywords: string[];
}

export interface EmojiCategory {
  id: string;
  label: string;
  emojis: EmojiEntry[];
}

const E = (char: string, keywords: string): EmojiEntry => ({ char, keywords: keywords.split(" ") });

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys",
    label: "Smileys",
    emojis: [
      E("😀", "smile happy grin"),
      E("😄", "smile laugh joy open"),
      E("😂", "lol laugh joy tears"),
      E("🤣", "laugh rolling floor"),
      E("😊", "smile blush happy"),
      E("😇", "smile innocent angel halo"),
      E("🙂", "smile slight"),
      E("😉", "wink cheeky flirt"),
      E("😍", "love heart eyes adore"),
      E("🤩", "star struck amazed wow"),
      E("😎", "cool sunglasses chill"),
      E("🥳", "party celebrate birthday"),
      E("😅", "sweat smile nervous"),
      E("🤗", "hug open arms warm"),
      E("🤔", "thinking ponder hmm"),
      E("🤨", "suspicious eyebrow doubt"),
      E("🫠", "melting face"),
      E("😏", "smirk sly"),
      E("😌", "relieved calm content"),
      E("😴", "sleepy tired"),
      E("😢", "cry sad tear"),
      E("😭", "sob cry tears"),
      E("😡", "angry rage mad"),
      E("😱", "scream shocked horrified"),
      E("🤯", "mind blown explosion"),
    ],
  },
  {
    id: "gestures",
    label: "Gestures",
    emojis: [
      E("👍", "thumbs up yes approve"),
      E("👎", "thumbs down no disapprove"),
      E("👏", "clap applause praise"),
      E("🙌", "hands raised celebrate"),
      E("🤝", "handshake agree deal"),
      E("✌️", "peace victory two fingers"),
      E("🤞", "fingers crossed luck"),
      E("💪", "flex bicep strong muscle"),
      E("👋", "wave hello goodbye"),
      E("🫡", "salute respect"),
      E("🙏", "pray please thank you bow"),
      E("💯", "hundred perfect full marks"),
      E("🫶", "heart hands love"),
      E("👌", "ok okay perfect"),
      E("🤟", "rock on love you"),
    ],
  },
  {
    id: "objects",
    label: "Objects",
    emojis: [
      E("📝", "memo note pencil writing"),
      E("📌", "pushpin pin keep"),
      E("📁", "folder organize files"),
      E("🗂️", "card index dividers organize"),
      E("📅", "calendar date schedule"),
      E("📆", "calendar tear off"),
      E("⏰", "alarm clock time wake"),
      E("⏱️", "stopwatch timer speed"),
      E("🗓️", "spiral calendar plan"),
      E("📎", "paperclip attach"),
      E("✂️", "scissors cut"),
      E("🔒", "lock closed secure private"),
      E("🔓", "unlock open"),
      E("🔑", "key access pass"),
      E("💾", "floppy disk save storage"),
      E("📚", "books library study"),
      E("📖", "open book read story"),
      E("🗒️", "spiral notepad notes"),
      E("📋", "clipboard checklist"),
      E("📦", "package box parcel"),
    ],
  },
  {
    id: "nature",
    label: "Nature",
    emojis: [
      E("🌱", "sprout plant grow seed"),
      E("🌿", "herb leaf green"),
      E("🌳", "tree forest"),
      E("🌸", "cherry blossom flower"),
      E("🌼", "blossom flower"),
      E("🌞", "sun sunny shine"),
      E("🌙", "moon night"),
      E("⭐", "star favorite top"),
      E("☀️", "sun bright warm"),
      E("🌧️", "rain cloud wet"),
      E("❄️", "snowflake winter cold"),
      E("🍂", "falling leaf autumn"),
      E("🌵", "cactus desert"),
      E("🌊", "ocean wave water sea"),
      E("⛰️", "mountain peak"),
    ],
  },
  {
    id: "travel",
    label: "Travel",
    emojis: [
      E("✈️", "airplane plane flight travel"),
      E("🚀", "rocket launch space fast"),
      E("🗺️", "map world atlas"),
      E("🧭", "compass navigate direction"),
      E("🌍", "globe earth world"),
      E("🏝️", "island beach vacation"),
      E("🏔️", "mountain snow summit"),
      E("🚗", "car auto drive"),
      E("🚲", "bicycle bike cycle"),
      E("⛺", "tent camping outdoors"),
      E("🏠", "home house"),
      E("🧳", "luggage suitcase travel"),
    ],
  },
  {
    id: "food",
    label: "Food & Drink",
    emojis: [
      E("☕", "coffee drink cafe"),
      E("🍵", "tea cup drink"),
      E("🍎", "apple fruit"),
      E("🍊", "orange citrus fruit"),
      E("🍋", "lemon fruit citrus"),
      E("🍓", "strawberry fruit berry"),
      E("🍰", "cake dessert birthday"),
      E("🍕", "pizza food"),
      E("🍔", "burger hamburger food"),
      E("🥗", "salad healthy food"),
      E("🍿", "popcorn movie snack"),
      E("🍫", "chocolate sweet"),
    ],
  },
  {
    id: "symbols",
    label: "Symbols",
    emojis: [
      E("⭐", "star favorite top"),
      E("❤️", "heart love red"),
      E("✅", "check done complete yes"),
      E("❌", "cross wrong no cancel"),
      E("⚠️", "warning alert caution"),
      E("🎯", "target goal aim"),
      E("🔥", "fire hot lit"),
      E("💡", "bulb idea light"),
      E("🧠", "brain mind smart"),
      E("💚", "heart green"),
      E("💜", "heart purple"),
      E("💙", "heart blue"),
      E("🎨", "art palette paint design"),
      E("🎵", "music note song"),
      E("⚡", "zap lightning energy"),
      E("💤", "zzz sleep tired"),
      E("🕊️", "dove peace"),
    ],
  },
  {
    id: "activities",
    label: "Activities",
    emojis: [
      E("🏃", "run running sprint"),
      E("🎧", "headphones music listen"),
      E("🎤", "mic microphone sing"),
      E("🎹", "piano keyboard music"),
      E("⚽", "soccer football"),
      E("🏀", "basketball"),
      E("🎮", "video game controller play"),
      E("📷", "camera photo picture"),
      E("🎬", "film movie clapper"),
      E("🧘", "meditation yoga calm"),
      E("♟️", "chess strategy"),
      E("📺", "tv television watch"),
    ],
  },
];

/** Every emoji flattened, with its category label added as a keyword. */
export const ALL_EMOJI: EmojiEntry[] = EMOJI_CATEGORIES.flatMap((c) =>
  c.emojis.map((e) => ({ ...e, keywords: [...e.keywords, c.label.toLowerCase(), c.id] })),
);

const ALL_SET = new Map(ALL_EMOJI.map((e) => [e.char, e]));

/** Normalized search across char + keywords + category. */
export function searchEmoji(query: string): EmojiEntry[] {
  const q = normalize(query);
  if (!q) return ALL_EMOJI;
  return ALL_EMOJI.filter((e) => {
    if (e.char === q) return true;
    const words = e.keywords.join(" ").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    return words.includes(q);
  });
}

// ---------------------------------------------------------------------------
// Recency / frequency history (localStorage)
// ---------------------------------------------------------------------------

const EMOJI_STORE_KEY = "locus:emoji-history";
const RECENT_LIMIT = 24;
const FREQUENT_LIMIT = 12;

interface EmojiHistory {
  recent: string[];
  counts: Record<string, number>;
}

function readHistory(): EmojiHistory {
  try {
    const raw = localStorage.getItem(EMOJI_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as EmojiHistory;
      if (Array.isArray(parsed.recent) && typeof parsed.counts === "object" && parsed.counts) {
        return {
          recent: parsed.recent.filter((c) => typeof c === "string" && ALL_SET.has(c)).slice(0, RECENT_LIMIT),
          counts: parsed.counts,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return { recent: [], counts: {} };
}

function writeHistory(h: EmojiHistory): void {
  try {
    localStorage.setItem(EMOJI_STORE_KEY, JSON.stringify(h));
  } catch {
    /* ignore */
  }
}

/** Record an emoji use (moves it to the front of recents, bumps frequency). */
export function recordEmojiUse(char: string): void {
  if (!ALL_SET.has(char)) return;
  const h = readHistory();
  h.recent = [char, ...h.recent.filter((c) => c !== char)].slice(0, RECENT_LIMIT);
  h.counts[char] = (h.counts[char] ?? 0) + 1;
  writeHistory(h);
}

/** Most recently used emoji, newest first. */
export function getRecentEmoji(): EmojiEntry[] {
  return readHistory().recent.map((c) => ALL_SET.get(c)!).filter(Boolean);
}

/** Most frequently used emoji, by usage count. */
export function getFrequentEmoji(): EmojiEntry[] {
  const h = readHistory();
  return Object.entries(h.counts)
    .filter(([c]) => ALL_SET.has(c))
    .sort((a, b) => b[1] - a[1])
    .slice(0, FREQUENT_LIMIT)
    .map(([c]) => ALL_SET.get(c)!)
    .filter(Boolean);
}
