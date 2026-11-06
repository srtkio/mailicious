"use client";

import "@xyflow/react/dist/style.css";
import { Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

type Tone = "plain" | "brand" | "good" | "warn" | "bad";
type StepData = { title: string; note?: string; tone: Tone; dark: boolean; vertical: boolean };
type StepNode = Node<StepData, "step">;

const TONE: Record<Tone, string> = {
  plain: "border-[#d6d0c8] bg-white text-black",
  brand: "border-black bg-[#ff6a00] text-black",
  good: "border-low bg-white text-black",
  warn: "border-medium bg-white text-black",
  bad: "border-high bg-white text-black",
};
const STROKE: Record<Tone, string> = { plain: "#ff6a00", brand: "#ff6a00", good: "#15803d", warn: "#a15c00", bad: "#c81e1e" };

function Step({ data }: NodeProps<StepNode>) {
  const hidden = "!h-1 !w-1 !min-h-0 !min-w-0 !border-0 !bg-transparent";
  return (
    <div className={`h-full w-full rounded-md border-2 px-3 py-2 shadow-sm ${data.dark ? "border-[#3a3633] bg-[#1c1917] text-white" : TONE[data.tone]}`}>
      <Handle type="target" position={data.vertical ? Position.Top : Position.Left} className={hidden} />
      <p className="text-sm font-bold leading-tight">{data.title}</p>
      {data.note && <p className={`mt-0.5 text-xs leading-snug ${data.dark ? "text-white/70" : data.tone === "brand" ? "text-black/75" : "text-muted"}`}>{data.note}</p>}
      <Handle type="source" position={data.vertical ? Position.Bottom : Position.Right} className={hidden} />
    </div>
  );
}

const nodeTypes = { step: Step };

type Spec = { id: string; x: number; y: number; w: number; h: number; title: string; note?: string; tone?: Tone };
type Layout = { nodes: Spec[]; links: [string, string][]; height: number; vertical: boolean };

function build(layout: Layout, dark: boolean): { nodes: StepNode[]; edges: Edge[] } {
  const tone = Object.fromEntries(layout.nodes.map((n) => [n.id, n.tone ?? "plain"])) as Record<string, Tone>;
  return {
    nodes: layout.nodes.map((n) => ({
      id: n.id,
      type: "step",
      position: { x: n.x, y: n.y },
      width: n.w,
      height: n.h,
      draggable: false,
      data: { title: n.title, note: n.note, tone: n.tone ?? "plain", dark, vertical: layout.vertical },
    })),
    edges: layout.links.map(([source, target]) => {
      const color = STROKE[tone[target]];
      return { id: `${source}-${target}`, source, target, animated: true, type: "smoothstep", style: { stroke: color, strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color } };
    }),
  };
}

// Sized to its container, so a phone gets the stacked layout at a readable size.
function Flow({ wide, narrow, label, dark = false, list }: { wide: Layout; narrow: Layout; label: string; dark?: boolean; list: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const layout = width > 0 && width < 640 ? narrow : wide;
  const { nodes, edges } = build(layout, dark);

  return (
    <div>
      <div ref={box} role="img" aria-label={label} className="flow-static w-full" style={{ height: layout.height }}>
        {width > 0 && (
          <ReactFlow
            key={layout === narrow ? "narrow" : "wide"}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.03 }}
            minZoom={0.2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            colorMode={dark ? "dark" : "light"}
            style={{ background: "transparent" }}
          />
        )}
      </div>
      <ol className="sr-only">
        {list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </div>
  );
}

const CHECKS = [
  ["sender", "Sender proof", "SPF, DKIM, DMARC"],
  ["links", "Links", "Disguised or look-alike"],
  ["files", "Attachments", "Programs posing as files"],
  ["asks", "What it asks", "Money, OTPs, ID"],
  ["company", "The company", "Real site vs sender"],
  ["domain", "Domain age", "Registered last week?"],
] as const;
const ANSWERS = [
  ["ok", "No red flags", "One quiet line", "good"],
  ["check", "Check first", "The reason and what to verify", "warn"],
  ["fake", "Likely fake", "Links pause, replies watched", "bad"],
] as const;
const toChecks = CHECKS.map(([id]) => ["mail", id] as [string, string]);
const toVerdict = CHECKS.map(([id]) => [id, "verdict"] as [string, string]);
const toAnswers = ANSWERS.map(([id]) => ["verdict", id] as [string, string]);

const pipelineWide: Layout = {
  height: 470,
  vertical: false,
  links: [...toChecks, ...toVerdict, ...toAnswers],
  nodes: [
    { id: "mail", x: 0, y: 190, w: 170, h: 74, title: "You open a mail", note: "Any mail in Gmail", tone: "brand" },
    ...CHECKS.map(([id, title, note], i) => ({ id, x: 280, y: i * 78, w: 200, h: 62, title, note })),
    { id: "verdict", x: 590, y: 190, w: 150, h: 74, title: "One verdict", note: "In a few seconds", tone: "brand" as Tone },
    ...ANSWERS.map(([id, title, note, tone], i) => ({ id, x: 850, y: 56 + i * 124, w: 200, h: 74, title, note, tone: tone as Tone })),
  ],
};
const pipelineNarrow: Layout = {
  height: 660,
  vertical: true,
  links: [["mail", "sender"], ["mail", "links"], ["sender", "files"], ["links", "asks"], ["files", "company"], ["asks", "domain"], ["company", "verdict"], ["domain", "verdict"], ...toAnswers],
  nodes: [
    { id: "mail", x: 85, y: 0, w: 170, h: 62, title: "You open a mail", tone: "brand" },
    ...CHECKS.map(([id, title, note], i) => ({ id, x: i % 2 ? 180 : 0, y: 92 + Math.floor(i / 2) * 84, w: 160, h: 62, title, note })),
    { id: "verdict", x: 85, y: 350, w: 170, h: 62, title: "One verdict", tone: "brand" as Tone },
    ...ANSWERS.map(([id, title, note, tone], i) => ({ id, x: i * 118, y: 450, w: 104, h: 106, title, note, tone: tone as Tone })),
  ],
};

export const PipelineFlow = () => (
  <Flow
    wide={pipelineWide}
    narrow={pipelineNarrow}
    label="Diagram: when you open a mail, six checks run together and lead to one verdict: no red flags, check first, or likely fake."
    list={["You open a mail", ...CHECKS.map(([, title, note]) => `${title}: ${note}`), "One verdict", ...ANSWERS.map(([, title, note]) => `${title}: ${note}`)]}
  />
);

const CAMPUS = [
  ["report", "A student reports", "One click on the warning card"],
  ["queue", "The cell reviews", "Reports wait in its dashboard"],
  ["mark", "Marked fake", "A person decides, never a bot"],
  ["all", "Everyone is warned", "Within a minute, across campus"],
] as const;
const campusLinks: [string, string][] = [["report", "queue"], ["queue", "mark"], ["mark", "all"]];

export const CampusFlow = () => (
  <Flow
    wide={{ height: 130, vertical: false, links: campusLinks, nodes: CAMPUS.map(([id, title, note], i) => ({ id, x: i * 275, y: 0, w: 215, h: 78, title, note, tone: i === 3 ? "brand" : "plain" })) }}
    narrow={{ height: 400, vertical: true, links: campusLinks, nodes: CAMPUS.map(([id, title, note], i) => ({ id, x: 0, y: i * 100, w: 300, h: 70, title, note, tone: i === 3 ? "brand" : "plain" })) }}
    label="Diagram: a student reports a sender, the placement cell reviews it and marks it fake, and every student is warned."
    list={CAMPUS.map(([, title, note]) => `${title}: ${note}`)}
  />
);

const INSTALL = [
  ["zip", "1. Download and unzip", "Save the file, then double-click it"],
  ["page", "2. Open your extensions page", "brave://extensions or chrome://extensions, then turn on Developer mode"],
  ["load", "3. Click Load unpacked", "Choose the unzipped folder"],
  ["gmail", "4. Open Gmail", "Refresh, then open any mail"],
] as const;
const installLinks: [string, string][] = [["zip", "page"], ["page", "load"], ["load", "gmail"]];
const installLayout = (w: number): Layout => ({ height: 430, vertical: true, links: installLinks, nodes: INSTALL.map(([id, title, note], i) => ({ id, x: 0, y: i * 112, w, h: 78, title, note })) });

export const InstallFlow = () => (
  <Flow wide={installLayout(440)} narrow={installLayout(320)} dark label="Diagram: four setup steps, from downloading the extension to opening Gmail." list={INSTALL.map(([, title, note]) => `${title}: ${note}`)} />
);
