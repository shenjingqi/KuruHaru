import { describe, expect, it } from "vitest";
import {
  convertComfyWorkflowApiToInternal,
  convertComfyWorkflowToInternal,
  convertInternalToComfyWorkflow,
  convertInternalToComfyWorkflowApi,
} from "./workflow-schema";

describe("workflow-runtime/contracts/workflow-schema", () => {
  it("支持 Comfy workflow JSON -> 内部图", () => {
    const internal = convertComfyWorkflowToInternal({
      name: "image-flow",
      last_node_id: 3,
      last_link_id: 1,
      nodes: [
        {
          id: 1,
          type: "Load Checkpoint",
          title: "Load Checkpoint",
          pos: [30, 50],
          size: [280, 120],
          outputs: [{ name: "MODEL" }],
        },
        {
          id: 2,
          type: "KSampler",
          title: "KSampler",
          pos: [340, 60],
          size: [320, 220],
          inputs: [{ name: "model" }],
        },
      ],
      links: [[1, 1, 0, 2, 0, "MODEL"]],
      groups: [{ id: "group-1", nodes: ["1", "2"] }],
      reroutes: [{ id: "r-1", linkId: "1" }],
    });

    expect(internal.schemaVersion).toBe(2);
    expect(internal.nodes).toHaveLength(2);
    expect(internal.links).toHaveLength(1);
    expect(internal.links[0].source).toBe("1");
    expect(internal.links[0].target).toBe("2");
    expect(internal.groups).toHaveLength(1);
    expect(internal.extra?.comfy?.origin).toBe("workflow");
  });

  it("支持 Comfy workflow_api -> 内部图", () => {
    const internal = convertComfyWorkflowApiToInternal({
      1: {
        class_type: "LoadImage",
        inputs: {
          image: "foo.png",
        },
      },
      2: {
        class_type: "SaveImage",
        inputs: {
          images: ["1", 0],
          filename_prefix: "ComfyUI",
        },
      },
    });

    expect(internal.schemaVersion).toBe(2);
    expect(internal.nodes).toHaveLength(2);
    expect(internal.links).toHaveLength(1);
    expect(internal.links[0].source).toBe("1");
    expect(internal.links[0].target).toBe("2");
    expect(internal.links[0].targetPort).toBe("images");
    expect(internal.extra?.comfy?.origin).toBe("workflow_api");
  });

  it("支持 内部图 -> Comfy workflow JSON", () => {
    const comfy = convertInternalToComfyWorkflow({
      schemaVersion: 2,
      nodes: [
        {
          id: "11",
          type: "A",
          label: "Node A",
          position: { x: 10, y: 20 },
          size: { width: 200, height: 100 },
        },
        {
          id: "12",
          type: "B",
          label: "Node B",
          position: { x: 300, y: 20 },
          size: { width: 200, height: 100 },
        },
      ],
      links: [
        {
          id: "e1",
          source: "11",
          target: "12",
          sourcePort: "output_0",
          targetPort: "input_0",
          type: "MODEL",
        },
      ],
    });

    expect(Array.isArray(comfy.nodes)).toBe(true);
    expect(Array.isArray(comfy.links)).toBe(true);
    expect(comfy.links[0][1]).toBe(11);
    expect(comfy.links[0][3]).toBe(12);
    expect(comfy.links[0][2]).toBe(0);
    expect(comfy.links[0][4]).toBe(0);
  });

  it("支持 内部图 -> Comfy workflow_api", () => {
    const workflowApi = convertInternalToComfyWorkflowApi({
      schemaVersion: 2,
      nodes: [
        {
          id: "a",
          type: "LoadImage",
          label: "LoadImage",
          config: { params: { image: "foo.png" } },
        },
        {
          id: "b",
          type: "SaveImage",
          label: "SaveImage",
          config: { params: { filename_prefix: "ComfyUI" } },
        },
      ],
      links: [
        {
          id: "e1",
          source: "a",
          target: "b",
          sourcePort: "output_0",
          targetPort: "images",
        },
      ],
    });

    expect(workflowApi.a.class_type).toBe("LoadImage");
    expect(workflowApi.b.class_type).toBe("SaveImage");
    expect(workflowApi.b.inputs.images).toEqual(["a", 0]);
    expect(workflowApi.b.inputs.filename_prefix).toBe("ComfyUI");
  });
});
