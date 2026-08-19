/**
 * Inventory system — hotbar-based item storage.
 * Replaces ad-hoc boolean flags (hasGolfClub, hasAxe, hasTennisRacket) with
 * a unified slot system. Materials stack; weapons and tools occupy individual slots.
 */

export type ItemType = "weapon" | "tool" | "material" | "key_item";

export type ClubType = "driver" | "iron" | "wedge" | "putter";

export type WeaponType =
  | "tennis_racket"
  | "golf_club"
  | "axe"
  | "iron_sword"
  | "void_blade"
  | "flame_greatsword"
  | "void_daggers"
  | "crystal_bow";

export interface InventoryItem {
  id: string;
  name: string;
  icon: string;
  type: ItemType;
  quantity?: number;
  weaponType?: WeaponType;
  clubType?: ClubType;
  description?: string;
}

interface ItemDef {
  name: string;
  icon: string;
  type: ItemType;
  maxStack?: number;
  weaponType?: WeaponType;
  clubType?: ClubType;
  description?: string;
}

export const ITEM_DEFS: Record<string, ItemDef> = {
  golf_bag:      { name: "Golf Bag",      icon: "⛳", type: "key_item", description: "Holds your golf clubs. Found outside the office." },
  magic_sack:    { name: "Magic Sack",    icon: "🎒", type: "key_item", description: "Bigger on the inside. Expands inventory." },
  golf_club:     { name: "Golf Club",     icon: "⛳", type: "weapon", weaponType: "golf_club", description: "Hits slugs. Not effective on dogs." },
  driver:        { name: "Driver",        icon: "🏌️", type: "weapon", weaponType: "golf_club", clubType: "driver", description: "High power, low accuracy." },
  iron:          { name: "Iron",          icon: "🏏", type: "weapon", weaponType: "golf_club", clubType: "iron", description: "Medium power, medium accuracy." },
  wedge:         { name: "Sand Wedge",    icon: "🪃", type: "weapon", weaponType: "golf_club", clubType: "wedge", description: "Escapes sand traps. Magical on sand — the leprechaun wants it." },
  putter:        { name: "Putter",        icon: "🏒", type: "weapon", weaponType: "golf_club", clubType: "putter", description: "Low power, pinpoint accuracy." },
  axe:           { name: "Axe",           icon: "🪓", type: "weapon", weaponType: "axe", description: "Chops trees. Don't use on dogs." },
  tennis_racket: { name: "Tennis Racket", icon: "🎾", type: "weapon", weaponType: "tennis_racket", description: "Bonk. Almost useless." },
  iron_sword:    { name: "Iron Sword",    icon: "⚔️", type: "weapon", weaponType: "iron_sword", description: "25 dmg. Solid melee weapon." },
  void_blade:    { name: "Void Blade",    icon: "🗡️", type: "weapon", weaponType: "void_blade", description: "40 dmg. Fast cooldown." },
  flame_greatsword: { name: "Flame Greatsword", icon: "🔥", type: "weapon", weaponType: "flame_greatsword", description: "60 dmg. AoE splash." },
  void_daggers:  { name: "Void Daggers",  icon: "🔪", type: "weapon", weaponType: "void_daggers", description: "35 dmg x2. Fastest weapon." },
  crystal_bow:   { name: "Crystal Bow",   icon: "🏹", type: "weapon", weaponType: "crystal_bow", description: "50 dmg. Ranged." },
  wood:          { name: "Wood",          icon: "🪵", type: "material", maxStack: 99, description: "From chopping trees. Build stuff." },
  slug_slime:    { name: "Slug Slime",    icon: "🟢", type: "material", maxStack: 99, description: "Sticky. Smells like grass." },
  fish:          { name: "Fish",          icon: "🐟", type: "material", maxStack: 99, description: "Heals 10 HP when eaten." },
  fishing_rod:   { name: "Fishing Rod",   icon: "🎣", type: "tool", description: "For fishing at lakes." },
  tennis_ball:   { name: "Tennis Ball",   icon: "🎾", type: "material", maxStack: 99, description: "Throw it into a lake for the dog to fetch!" },
  stick:         { name: "Stick",         icon: "🪵", type: "material", maxStack: 99, description: "Throw it into a lake for the dog to fetch!" },
  gold_coin:     { name: "Gold Coin",     icon: "🪙", type: "material", maxStack: 99, description: "Leprechaun gold. Shiny. Maybe cursed." },
  four_leaf_clover: { name: "Four-Leaf Clover", icon: "🍀", type: "material", maxStack: 99, description: "Lucky charm from a leprechaun." },
};

const DEFAULT_MAX_SLOTS = 6;
const SACK_MAX_SLOTS = 12;
const MATERIAL_MAX_STACK = 99;

export class Inventory {
  private slots: (InventoryItem | null)[];
  private maxSlots: number;
  private activeIndex = 0;
  private listeners: (() => void)[] = [];

  constructor() {
    this.maxSlots = DEFAULT_MAX_SLOTS;
    this.slots = new Array(this.maxSlots).fill(null);
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  get maxSlotCount(): number {
    return this.maxSlots;
  }

  get activeSlot(): number {
    return this.activeIndex;
  }

  getItems(): (InventoryItem | null)[] {
    return [...this.slots];
  }

  getActive(): InventoryItem | null {
    return this.slots[this.activeIndex] ?? null;
  }

  setActive(index: number): void {
    if (index < 0 || index >= this.maxSlots) return;
    if (index === this.activeIndex) return;
    this.activeIndex = index;
    this.emit();
  }

  cycleActive(): void {
    let next = (this.activeIndex + 1) % this.maxSlots;
    // skip empty slots
    let attempts = 0;
    while (!this.slots[next] && attempts < this.maxSlots) {
      next = (next + 1) % this.maxSlots;
      attempts++;
    }
    this.activeIndex = next;
    this.emit();
  }

  hasItem(id: string): boolean {
    return this.slots.some((s) => s !== null && s.id === id);
  }

  getItem(id: string): InventoryItem | null {
    return this.slots.find((s) => s !== null && s.id === id) ?? null;
  }

  getQuantity(id: string): number {
    let total = 0;
    for (const s of this.slots) {
      if (s && s.id === id) total += s.quantity ?? 1;
    }
    return total;
  }

  hasGolfClub(): boolean {
    return this.slots.some(
      (s) => s !== null && s.type === "weapon" && s.weaponType === "golf_club",
    );
  }

  getActiveClub(): ClubType | null {
    const active = this.getActive();
    if (active && active.weaponType === "golf_club") return active.clubType ?? null;
    return null;
  }

  /**
   * Add an item. For materials, stacks onto existing slots first.
   * For weapons/tools/key_items, occupies a new slot.
   * Returns true if fully added, false if inventory full.
   */
  addItem(id: string, quantity = 1): boolean {
    const def = ITEM_DEFS[id];
    if (!def) return false;

    if (def.type === "material") {
      // Stack onto existing material slots first
      let remaining = quantity;
      for (let i = 0; i < this.maxSlots && remaining > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && (s.quantity ?? 0) < (def.maxStack ?? MATERIAL_MAX_STACK)) {
          const space = (def.maxStack ?? MATERIAL_MAX_STACK) - (s.quantity ?? 0);
          const add = Math.min(space, remaining);
          s.quantity = (s.quantity ?? 0) + add;
          remaining -= add;
        }
      }
      // Fill new slots with remaining
      while (remaining > 0) {
        const emptyIdx = this.slots.indexOf(null);
        if (emptyIdx === -1) {
          this.emit();
          return false; // full
        }
        const add = Math.min(remaining, def.maxStack ?? MATERIAL_MAX_STACK);
        this.slots[emptyIdx] = {
          id,
          name: def.name,
          icon: def.icon,
          type: def.type,
          quantity: add,
          description: def.description,
        };
        remaining -= add;
      }
      this.emit();
      return true;
    }

    // Non-stackable: check if already have it (weapons/tools/key_items don't duplicate)
    if (this.hasItem(id)) {
      this.emit();
      return true; // already have it, no-op success
    }

    const emptyIdx = this.slots.indexOf(null);
    if (emptyIdx === -1) {
      return false; // full
    }

    this.slots[emptyIdx] = {
      id,
      name: def.name,
      icon: def.icon,
      type: def.type,
      weaponType: def.weaponType,
      clubType: def.clubType,
      description: def.description,
    };

    // Auto-select first item if nothing active
    if (!this.getActive()) {
      this.activeIndex = emptyIdx;
    }

    this.emit();
    return true;
  }

  removeItem(id: string, quantity = 1): boolean {
    let remaining = quantity;
    for (let i = 0; i < this.maxSlots && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        if (s.type === "material") {
          const have = s.quantity ?? 0;
          const remove = Math.min(have, remaining);
          s.quantity = have - remove;
          remaining -= remove;
          if (s.quantity === 0) this.slots[i] = null;
        } else {
          this.slots[i] = null;
          remaining = 0;
        }
      }
    }
    // Fix active index if we removed the active slot
    if (!this.slots[this.activeIndex]) {
      const next = this.slots.findIndex((s) => s !== null);
      this.activeIndex = next >= 0 ? next : 0;
    }
    this.emit();
    return remaining === 0;
  }

  removeItemBySlot(index: number): void {
    if (index < 0 || index >= this.maxSlots) return;
    this.slots[index] = null;
    if (this.activeIndex === index) {
      const next = this.slots.findIndex((s) => s !== null);
      this.activeIndex = next >= 0 ? next : 0;
    }
    this.emit();
  }

  expandSack(): void {
    if (this.maxSlots >= SACK_MAX_SLOTS) return;
    this.maxSlots = SACK_MAX_SLOTS;
    while (this.slots.length < this.maxSlots) this.slots.push(null);
    this.emit();
  }

  getOwnedWeapons(): WeaponType[] {
    const weapons: WeaponType[] = [];
    for (const s of this.slots) {
      if (s && s.type === "weapon" && s.weaponType) {
        if (!weapons.includes(s.weaponType)) weapons.push(s.weaponType);
      }
    }
    return weapons;
  }

  getActiveWeaponType(): WeaponType | null {
    const active = this.getActive();
    if (active && active.type === "weapon" && active.weaponType) return active.weaponType;
    return null;
  }

  serialize(): string {
    return JSON.stringify({
      slots: this.slots,
      maxSlots: this.maxSlots,
      activeIndex: this.activeIndex,
    });
  }

  deserialize(json: string): void {
    try {
      const data = JSON.parse(json);
      if (data.maxSlots) this.maxSlots = data.maxSlots;
      if (data.slots) this.slots = data.slots;
      if (data.activeIndex !== undefined) this.activeIndex = data.activeIndex;
      // Ensure slots array length matches maxSlots
      while (this.slots.length < this.maxSlots) this.slots.push(null);
      this.slots = this.slots.slice(0, this.maxSlots);
      this.emit();
    } catch {
      // ignore corrupt data
    }
  }
}
