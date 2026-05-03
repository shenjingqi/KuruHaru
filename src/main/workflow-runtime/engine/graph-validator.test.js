import { describe, expect, it } from "vitest";
import { validateWorkflowGraph } from "./graph-validator";

const createRegistry = () => {
  const map = new Map([
    [
      "node.a",
      {
        execute: async () => null,
      },
    ],
    [
      "node.b",
      {
        execute: async () => null,
      },
    ],
  ]);

  return {
    has: (type) => map.has(type),
    get: (type) => map.get(type),
  };
};

describe("workflow-runtime/engine/graph-validator", () => {
  it("分组引用丢失节点时返回错误", () => {
    const result = validateWorkflowGraph({
      nodeRegistry: createRegistry(),
      workflow: {
        graph: {
          nodes: [{ id: "n1", type: "node.a", config: {} }],
          edges: [],
          groups: [{ id: "g1", nodes: ["n1", "n2"] }],
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(
      result.errors.some((item) => item.includes("分组 g1 引用了不存在的节点")),
    ).toBe(true);
  });

  it("reroute 引用未知连线时返回 warning", () => {
    const result = validateWorkflowGraph({
      nodeRegistry: createRegistry(),
      workflow: {
        graph: {
          nodes: [
            { id: "n1", type: "node.a", config: {} },
            { id: "n2", type: "node.b", config: {} },
          ],
          edges: [{ id: "e1", source: "n1", target: "n2" }],
          reroutes: [{ id: "r1", linkId: "missing-edge" }],
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(
      result.warnings.some((item) =>
        item.includes("Reroute r1 引用了不存在的连线"),
      ),
    ).toBe(true);
  });

  it("子图引用不存在时返回错误", () => {
    const result = validateWorkflowGraph({
      nodeRegistry: createRegistry(),
      workflow: {
        definitions: {},
        graph: {
          nodes: [{ id: "n1", type: "node.a", config: { subgraphId: "sg-1" } }],
          edges: [],
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(
      result.errors.some((item) => item.includes("引用了不存在的子图")),
    ).toBe(true);
  });
});
