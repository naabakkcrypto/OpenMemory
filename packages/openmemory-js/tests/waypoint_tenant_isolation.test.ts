import { afterEach, describe, expect, it, vi } from "vitest";
import { q } from "../src/core/db";
import {
    create_single_waypoint,
    expand_via_waypoints,
} from "../src/memory/hsg";

describe("waypoint tenant isolation", () => {
    afterEach(() => vi.restoreAllMocks());

    it("does not traverse a legacy cross-project edge", async () => {
        vi.spyOn(q.get_neighbors, "all").mockImplementation(async (source) =>
            source === "seed"
                ? [
                      {
                          dst_id: "same-project",
                          weight: 1,
                          user_id: "tenant-a",
                          project_id: "project-a",
                      },
                      {
                          dst_id: "foreign-project",
                          weight: 1,
                          user_id: "tenant-a",
                          project_id: "project-a",
                      },
                      {
                          dst_id: "global-memory",
                          weight: 1,
                          user_id: "tenant-a",
                          project_id: "system_global",
                      },
                  ]
                : [],
        );
        vi.spyOn(q.get_mem, "get").mockImplementation(async (id) => {
            const tenants: Record<
                string,
                { user_id: string; project_id: string }
            > = {
                "same-project": {
                    user_id: "tenant-a",
                    project_id: "project-a",
                },
                "foreign-project": {
                    user_id: "tenant-b",
                    project_id: "project-b",
                },
                "global-memory": {
                    user_id: "tenant-a",
                    project_id: "system_global",
                },
            };
            return tenants[id] ?? null;
        });

        const expanded = await expand_via_waypoints(["seed"], 10, {
            user_id: "tenant-a",
            project_id: "project-a",
        });

        expect(expanded.map((row) => row.id)).toEqual([
            "seed",
            "same-project",
            "global-memory",
        ]);
    });

    it("does not create a nearest-neighbor edge to another project", async () => {
        const vector = (values: number[]) =>
            Buffer.from(new Float32Array(values).buffer);
        vi.spyOn(q.all_mem_by_user, "all").mockResolvedValue([
            {
                id: "foreign-project",
                project_id: "project-b",
                mean_vec: vector([1, 0]),
            },
            {
                id: "same-project",
                project_id: "project-a",
                mean_vec: vector([0.9, 0.1]),
            },
        ]);
        const inserted = vi.spyOn(q.ins_waypoint, "run").mockResolvedValue();

        await create_single_waypoint(
            "new-memory",
            [1, 0],
            1,
            "tenant-a",
            "project-a",
        );

        expect(inserted).toHaveBeenCalledTimes(1);
        expect(inserted.mock.calls[0][1]).toBe("same-project");
    });
});
