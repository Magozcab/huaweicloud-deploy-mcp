import fs from "node:fs/promises";
import path from "node:path";
import type { MigrationState } from "../types.js";

export class StateManager {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async load(): Promise<MigrationState | null> {
    try {
      const content = await fs.readFile(this.filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async save(state: MigrationState): Promise<void> {
    state.updatedAt = new Date().toISOString();
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(state, null, 2));
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  async reset(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch {}
  }

  createInitialState(planId: string, dryRun: boolean): MigrationState {
    return {
      planId,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phase: "planning",
      dryRun,
      users: [],
      groups: [],
      memberships: [],
      errors: [],
      userMap: {},
      groupMap: {},
    };
  }

  addError(state: MigrationState, phase: string, message: string): MigrationState {
    state.errors.push({
      phase,
      message,
      timestamp: new Date().toISOString(),
    });
    return state;
  }

  updateUserMap(state: MigrationState, userName: string, huaweiId: string): void {
    state.userMap[userName] = huaweiId;
  }

  updateGroupMap(state: MigrationState, displayName: string, huaweiId: string): void {
    state.groupMap[displayName] = huaweiId;
  }

  getHuaweiUserId(state: MigrationState, userName: string): string | undefined {
    return state.userMap[userName];
  }

  getHuaweiGroupId(state: MigrationState, displayName: string): string | undefined {
    return state.groupMap[displayName];
  }
}
