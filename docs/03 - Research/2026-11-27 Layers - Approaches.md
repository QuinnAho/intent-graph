---
status: waiting for the owner's pick
date: 2026-11-27
---
# Three layers: intent, how it works, code

The owner's thought, paraphrased: the tool could show three layers of abstraction. What we want (the intent), how it works (the mechanism), and the actual code. It came up next to the nesting question: maybe the code sits nested under the intent.

## Where the tool is today

- Layer 1 exists: concepts, intents, constraints and decisions, as typed markdown under `/spec`.
- Layer 3 exists: modules and symbols, read from the code by tree-sitter.
- Nothing sits between them. An intent can point straight at code and tests with anchors (ADR 0030, proposed, used on fixtures only).
- The drift check jumps from a diff straight to an intent sentence. On real commits it answers "unclear" about a third of the time. The gap is wide for one judgement.

## What others do

- Kiro: requirements, design, tasks. Three documents per feature, and the middle one is "how it works".
- Spec Kit and OpenSpec: spec, plan, tasks.
- The C4 model: context, containers, components, code. Four zoom levels of one system.
- Blueprint: a collapsed node holds a graph, which holds more nodes. The same idea as zoom levels.

So a middle layer is the norm. What nobody ships is a middle layer made of typed nodes that are bound to code and checked for drift.

## Options for the middle layer

- **A. Written by hand.** A new node kind, one markdown file each, like the others. It is a contract. It goes stale unless something checks it.
- **B. Generated.** A model writes it from the code and rewrites it on every change. It is always fresh. But it says what the code does, not what it should do, so it cannot be a contract.
- **C. Drafted, confirmed, then checked.** An agent proposes a "how" node from the code and the intent. A person confirms or edits it. From then on it is a contract, and the drift check judges two short steps: the code against the how, and the how against the intent.

## Read on each

- A is honest but slow, and it is the kind of document that rots.
- B is a good view and not a spec. It can come later as a summary on hover.
- C fits the rule already in ADR 0029: an agent proposes and a person confirms. It also gives nesting something real to hold: an intent opens to its mechanisms, and a mechanism opens to its code.

## Recommendation

C, tried small before anything is built wide:

1. Take one real intent of this repo.
2. An agent drafts its "how" node from the code that implements it, and proposes the bindings.
3. Show the three levels nested on the graph: intent, how, code. One variant opens the node in place. Another steps inside on a double-click, with a way back.
4. Run the drift check on recent commits in two steps and compare it with today's one-step answers.
5. The owner looks at the frames and keeps it, changes it or drops it.

The experiment runs on a copy. Nothing in the real `/spec` changes.

## What it needs

- The anchor format (ADR 0030) accepted, or used on the copy only.
- A name for the middle kind. "Mechanism" says how something works. "Design" is the word the industry uses.

## Risks

- More layers means more to keep true. Without a drift check per layer, the middle one becomes a second set of docs.
- One piece of code can serve several mechanisms. Inside a mechanism the code is a reference, not a home.
- The first night's lesson holds here too: this repo has no intent bound to code yet, so the layers have nothing real to show until at least one is bound.

## Declared and inferred (added the same day, after the owner's next thought)

The owner, paraphrased: we should see the intent and the intent inferred from the code, and a person should be able to change either easily. The open question is the best way to show it.

Two directions meet on the graph:

- Top down: the declared intent. A person wrote it.
- Bottom up: what a model reads out of the code. It says what the code seems to be for.

Where they agree, nothing needs attention. Where they differ, or where code has no declared intent at all, the person decides.

### Ways to show it

- **Dashed on the canvas.** An inferred node or wire is drawn dashed and dimmer, with the word "inferred". It sits where the real thing would sit. Editors show a suggestion the same way, as ghost text.
- **A review tray.** A list beside the graph: "14 to review". One key accepts, one edits, one dismisses. Documents show suggested changes this way, and it is fast for many items.
- **Side by side in the panel.** For one node: what was declared, what the code seems to do, and three choices: keep mine, use the inferred one, edit.

### Recommendation

All three, in this order, because each is small on top of what exists:

1. Dashed on the canvas, with the word and the evidence: which files and symbols it was read from.
2. One key each. Enter accepts and writes a real spec file through the same writer, so undo works. A double-click edits the title first. Delete dismisses, and a dismissed one is not proposed again.
3. A count ("14 inferred") that opens the tray.
4. The side-by-side view for nodes that have both. That is the drift mark with its reasons spelled out.

### How it fits the layers and the nesting

The middle layer is the natural home of inference. A model can read "how it works" out of code far better than it can guess why the code exists. So the person declares intents, the model proposes the how under each, and the code sits under the how. Inferred pieces stay dashed until a person confirms them.

### The smallest experiment

One script runs a cheap model over code that no intent claims and writes its proposals under `.runs/`, never to `/spec`. The page draws them dashed, nested with their code. Enter, a double-click and Delete do the three things above. It runs on a copy. The model cost is a few cents, and proposals are cached by the code's signature hash, so only changed code is read again.
