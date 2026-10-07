import type {
  ScimUser,
  ScimGroup,
  ScimListResponse,
  ScimPatchRequest,
  GroupFilterSupport,
} from "../types.js";

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

export class ScimClient {
  private baseUrl: string;
  private token: string;
  private groupFilterSupport: GroupFilterSupport | null = null;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; data: unknown }> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/scim+json",
      Accept: "application/scim+json",
      Authorization: `Bearer ${this.token}`,
    };

    try {
      const resp = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      let data: unknown = null;
      const text = await resp.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      return { status: resp.status, data };
    } catch (err: any) {
      throw new Error(`SCIM request failed: ${method} ${path} - ${err.message}`);
    }
  }

  async testConnection(): Promise<{
    connected: boolean;
    userCount?: number;
    groupCount?: number;
    error?: string;
  }> {
    try {
      const users = await this.listUsers(1, 1);
      const groups = await this.listGroups(1, 1);
      return {
        connected: true,
        userCount: users.totalResults,
        groupCount: groups.totalResults,
      };
    } catch (err: any) {
      return { connected: false, error: err.message };
    }
  }

  async listUsers(startIndex = 1, count = 100): Promise<ScimListResponse<ScimUser>> {
    const { status, data } = await this.request(
      "GET",
      `/Users?startIndex=${startIndex}&count=${count}`
    );
    if (status === 200) return data as ScimListResponse<ScimUser>;
    throw new Error(`Failed to list users: status ${status}`);
  }

  async getUserByUserName(userName: string): Promise<{
    found: boolean;
    huaweiUserId?: string;
    raw?: { id?: string; userName?: string; displayName?: string; active?: boolean };
  }> {
    const filter = `userName eq "${userName}"`;
    const { status, data } = await this.request(
      "GET",
      `/Users?filter=${encodeURIComponent(filter)}`
    );

    if (status === 200 && data) {
      const list = data as ScimListResponse<ScimUser>;
      if (list.Resources && list.Resources.length > 0) {
        const user = list.Resources[0];
        return {
          found: true,
          huaweiUserId: user.id,
          raw: {
            id: user.id,
            userName: user.userName,
            displayName: user.displayName,
            active: user.active,
          },
        };
      }
    }
    return { found: false };
  }

  async createUser(input: {
    userName: string;
    displayName?: string;
    givenName?: string;
    familyName?: string;
    email?: string;
    active?: boolean;
    externalId?: string;
  }): Promise<{ huaweiUserId: string; userName: string }> {
    const existing = await this.getUserByUserName(input.userName);
    if (existing.found) {
      return { huaweiUserId: existing.huaweiUserId!, userName: input.userName };
    }

    const user: any = {
      schemas: [SCIM_USER_SCHEMA],
      userName: input.userName,
      active: input.active !== undefined ? input.active : true,
    };

    if (input.displayName) user.displayName = input.displayName;
    if (input.externalId) user.externalId = input.externalId;

    if (input.givenName || input.familyName) {
      user.name = {};
      if (input.givenName) user.name.givenName = input.givenName;
      if (input.familyName) user.name.familyName = input.familyName;
      if (input.givenName && input.familyName) {
        user.name.formatted = `${input.givenName} ${input.familyName}`;
      }
    }

    if (input.email) {
      user.emails = [{ value: input.email, primary: true, type: "work" }];
    }

    const { status, data } = await this.request("POST", "/Users", user);
    if (status === 201) {
      const created = data as ScimUser;
      return { huaweiUserId: created.id!, userName: created.userName };
    }
    throw new Error(
      `Failed to create user ${input.userName}: status ${status}, ${JSON.stringify(data)}`
    );
  }

  async buildDryRunCreateUserPayload(input: {
    userName: string;
    displayName?: string;
    givenName?: string;
    familyName?: string;
    email?: string;
    active?: boolean;
    externalId?: string;
  }): Promise<Record<string, unknown>> {
    const user: any = {
      schemas: [SCIM_USER_SCHEMA],
      userName: input.userName,
      active: input.active !== undefined ? input.active : true,
    };
    if (input.displayName) user.displayName = input.displayName;
    if (input.externalId) user.externalId = input.externalId;
    if (input.givenName || input.familyName) {
      user.name = {};
      if (input.givenName) user.name.givenName = input.givenName;
      if (input.familyName) user.name.familyName = input.familyName;
      if (input.givenName && input.familyName) user.name.formatted = `${input.givenName} ${input.familyName}`;
    }
    if (input.email) user.emails = [{ value: input.email, primary: true, type: "work" }];
    return user;
  }

  async listGroups(startIndex = 1, count = 100): Promise<ScimListResponse<ScimGroup>> {
    const { status, data } = await this.request(
      "GET",
      `/Groups?startIndex=${startIndex}&count=${count}`
    );
    if (status === 200) return data as ScimListResponse<ScimGroup>;
    throw new Error(`Failed to list groups: status ${status}`);
  }

  async getGroupByDisplayName(displayName: string): Promise<{
    found: boolean;
    huaweiGroupId?: string;
    filterSupported: boolean;
    error?: string;
  }> {
    if (this.groupFilterSupport && !this.groupFilterSupport.supported) {
      return {
        found: false,
        filterSupported: false,
        error: `displayName filter not supported by Huawei. Last check: ${this.groupFilterSupport.error || "unsupported"}`,
      };
    }

    const filter = `displayName eq "${displayName}"`;
    const { status, data } = await this.request(
      "GET",
      `/Groups?filter=${encodeURIComponent(filter)}`
    );

    if (status === 200 && data) {
      const list = data as ScimListResponse<ScimGroup>;
      this.groupFilterSupport = { supported: true, checkedAt: new Date().toISOString() };
      if (list.Resources && list.Resources.length > 0) {
        return {
          found: true,
          huaweiGroupId: list.Resources[0].id,
          filterSupported: true,
        };
      }
      return { found: false, filterSupported: true };
    }

    this.groupFilterSupport = {
      supported: false,
      checkedAt: new Date().toISOString(),
      error: `filter returned status ${status}`,
    };

    return {
      found: false,
      filterSupported: false,
      error: `displayName filter not supported (status ${status}). Must use group ID from state or creation response. Do not guess group IDs.`,
    };
  }

  async createGroup(displayName: string, externalId?: string): Promise<{
    huaweiGroupId: string;
    displayName: string;
  }> {
    const group: any = {
      schemas: [SCIM_GROUP_SCHEMA],
      displayName,
    };
    if (externalId) group.externalId = externalId;

    const { status, data } = await this.request("POST", "/Groups", group);
    if (status === 201) {
      const created = data as ScimGroup;
      return { huaweiGroupId: created.id!, displayName: created.displayName };
    }
    throw new Error(
      `Failed to create group ${displayName}: status ${status}, ${JSON.stringify(data)}`
    );
  }

  async addMembersToGroup(
    huaweiGroupId: string,
    members: Array<{ userName: string; huaweiUserId: string }>
  ): Promise<{ success: boolean; memberCount: number }> {
    const unresolvedMembers = members.filter((m) => !m.huaweiUserId);
    if (unresolvedMembers.length > 0) {
      throw new Error(
        `Cannot PATCH group ${huaweiGroupId}: ${unresolvedMembers.length} member(s) lack Huawei SCIM user.id. ` +
        `Unresolved: ${unresolvedMembers.map((m) => m.userName).join(", ")}. ` +
        `Resolve all users before adding members. Never use Okta user ID or email as member.value.`
      );
    }

    const patch: ScimPatchRequest = {
      schemas: [SCIM_PATCH_SCHEMA],
      Operations: [
        {
          op: "Add",
          path: "members",
          value: members.map((m) => ({
            value: m.huaweiUserId,
            display: m.userName,
          })),
        },
      ],
    };

    const { status, data } = await this.request(
      "PATCH",
      `/Groups/${huaweiGroupId}`,
      patch
    );

    if (status === 200 || status === 204) {
      return { success: true, memberCount: members.length };
    }
    throw new Error(
      `Failed to add members to group ${huaweiGroupId}: status ${status}, ${JSON.stringify(data)}`
    );
  }

  async getGroupMembers(huaweiGroupId: string): Promise<Array<{ value: string; display?: string }>> {
    const { status, data } = await this.request("GET", `/Groups/${huaweiGroupId}`);
    if (status === 200) {
      const group = data as ScimGroup;
      return group.members || [];
    }
    throw new Error(`Failed to get group ${huaweiGroupId}: status ${status}`);
  }

  getGroupFilterSupport(): GroupFilterSupport | null {
    return this.groupFilterSupport;
  }
}
