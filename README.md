[![npm version](https://img.shields.io/npm/v/vscode-chat-langchain-bridge.svg)](https://www.npmjs.com/package/vscode-chat-langchain-bridge)
![bundle size](https://img.shields.io/bundlephobia/minzip/vscode-chat-langchain-bridge)
[![npm downloads](https://img.shields.io/npm/dm/vscode-chat-langchain-bridge.svg)](https://www.npmjs.com/package/vscode-chat-langchain-bridge)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#-license)
# vscode-chat-langchain-bridge
🚧 BETA
> **Create VS Code Chat participants (agents) with LangChain/LangGraph in minutes.** Wrap VS Code’s `LanguageModelChat` and get tool‑calling + streaming out of the box.

Bridge between **VS Code Chat** participants and **LangChain**/**LangGraph** agents. It wraps a VS Code chat model as a LangChain `BaseChatModel` so you can compose it with chains/graphs, use Zod‑based tools, and keep streaming/tool‑calls working end‑to‑end.

> Node ≥ 20 • VS Code API ≥ 1.103 (Chat) • TypeScript ready

---

## ✨ Why this exists

- **Build VS Code Chat participants (agents) fast** – map directly to the Chat Participant API: register your participant, implement a request handler, stream markdown/progress.
- **One LangChain facade** – use `invoke`, `stream`, runnables, and tools with whichever chat provider the user picked (Copilot, Azure OpenAI, etc.).
- **Tool‑calling bridge** – pass LangChain tools; the bridge exposes them to the VS Code chat runtime automatically.
- **Streaming that survives** – forward chunks and progress via `ChatResponseStream` for a smooth UX.
- **Graph‑friendly** – compose with LangGraph state graphs or plain LangChain chains.

---

## 📦 Install

This package ships **no bundled runtime deps** and relies on peers so you keep version control.

```bash
# runtime peers
npm install vscode-chat-langchain-bridge @langchain/core @langchain/langgraph zod
# VS Code API types (only if you’re using TypeScript)
npm install --save-dev @types/vscode
```

**Engines**  
- Node: `>=20`

---

## 🧩 What’s exported

```ts
import {
  ChatVSCode,
  type ChatVSCodeFields,
  type ChatVSCodeCallOptions,
  convertVscodeHistory, // converts vscode chat history to langchain format
} from "vscode-chat-langchain-bridge";
```

- `ChatVSCode` — a LangChain `BaseChatModel` that wraps a VS Code `LanguageModelChat`.
- Types: `ChatVSCodeFields`, `ChatVSCodeCallOptions`, `ChatVSCodeToolType`.

Utilities stay internal on purpose. Just hand the bridge your LangChain tools and it adapts them for VS Code Chat.

---

## 🚀 Getting started (Chat Participant)

Minimal usage inside a Chat participant. Use the model the user selected in the chat UI (`request.model`) and stream the answer back.

```ts
import * as vscode from "vscode";
import { HumanMessage } from "@langchain/core/messages";
import { ChatVSCode } from "vscode-chat-langchain-bridge";

export function activate(ctx: vscode.ExtensionContext) {
  const participant = vscode.chat.createChatParticipant(
    "demo.bridge",
    async (request, _context, stream, token) => {
      // Use the LanguageModelChat chosen by the user
      const llm = new ChatVSCode({ model: request.model, token, responseStream: stream });

      // Call with LangChain messages
      const ai = await llm.invoke([new HumanMessage(request.prompt)]);

      // Stream into the Chat UI
      if (typeof ai.content === "string") stream.markdown(ai.content);
      return { metadata: {} };
    }
  );

  ctx.subscriptions.push(participant);
}
```

### Bind tools (Zod schemas)

Pass your regular LangChain tools — no VS Code specifics needed. The bridge wraps them so the provider can call them during the chat.

```ts
import { z } from "zod";
import { tool } from "@langchain/core/tools";

const GetWeather = tool(
  async ({ city }: { city: string }) => `Sunny day in ${city}`,
  {
    name: "GetWeather",
    description: "Get the current weather in a city",
    schema: z.object({ city: z.string().describe("City name, e.g., 'Lima'") }),
  }
);

// … after constructing `llm`:
const llmWithTools = llm.bindTools([GetWeather]);
const ai = await llmWithTools.invoke("Use GetWeather for Lima and return only the result.");
```

---

## 🧠 Create a VS Code Chat Participant (Agent) with LangGraph

A minimal, self‑contained example that wires: LangGraph state, a Zod‑backed tool, tool routing, and VS Code chat streaming.

```ts
// extension.ts (MINIMAL REPRODUCIBLE EXAMPLE)

import * as vscode from "vscode";
import { StateGraph, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { Annotation } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatVSCode } from "vscode-chat-langchain-bridge";

// 1) Simple tool: add two numbers
const add = tool(
  async ({ a, b }: { a: number; b: number }) => a + b,
  {
    name: "add",
    description: "Add two numbers.",
    schema: z.object({
      a: z.number().describe("First number."),
      b: z.number().describe("Second number."),
    }),
  }
);

// 2) Minimal state: just a message history
const GraphState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});
type GraphStateT = typeof GraphState.State;

// 3) Build the graph (closes over llm and stream)
function makeGraph(llm: ChatVSCode, stream: vscode.ChatResponseStream) {
  const tools = [add];
  const toolNode = new ToolNode(tools);

  async function llmCall(state: GraphStateT) {
    stream.progress("Thinking…");
    const res = await llm.bindTools(tools).invoke(state.messages);
    if (typeof res.content === "string") stream.markdown(res.content);
    return { messages: [res] };
  }

  function shouldContinue(state: GraphStateT) {
    const last = state.messages.at(-1);
    const hasToolCalls =
      last instanceof AIMessage && (last.tool_calls?.length ?? 0) > 0;
    return hasToolCalls ? "Action" : "__end__";
  }

  return new StateGraph(GraphState)
    .addNode("llm", llmCall)
    .addNode("tools", toolNode)
    .addEdge(START, "llm")
    .addConditionalEdges("llm", shouldContinue, {
      Action: "tools",
      __end__: END,
    })
    .addEdge("tools", "llm")
    .compile();
}

// 4) Register the Chat participant
export function activate(ctx: vscode.ExtensionContext) {
  const disposable = vscode.chat.createChatParticipant(
    "demo.add",
    async (request, _context, stream, token) => {
      const llm = new ChatVSCode({ model: request.model, token, responseStream: stream });
      const graph = makeGraph(llm, stream);
      await graph.invoke({ messages: [new HumanMessage(request.prompt)] });
      return { metadata: {} };
    }
  );
  ctx.subscriptions.push(disposable);
}

export function deactivate() {}
```

---

## 📝 License

MIT © Juan Rodriguez
