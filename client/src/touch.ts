export interface TouchInputState {
  moveX: number;
  moveY: number;
  action: "interact" | "teleport" | null;
}

export const touchInput: TouchInputState = {
  moveX: 0,
  moveY: 0,
  action: null,
};

export function isTouchDevice(): boolean {
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia("(pointer: coarse)").matches
  );
}
