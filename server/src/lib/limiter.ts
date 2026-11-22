import { conflict } from './errors';

const limits = new Map<string, { active: number; max: number }>();

export function acquireSlot(group: string, max: number): () => void {
  const state = limits.get(group) ?? { active: 0, max };
  if (state.active >= state.max) throw conflict(`${group} is busy. Wait for the running operation to finish.`);
  state.active += 1;
  limits.set(group, state);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.active -= 1;
  };
}
