# Scenario 04 · Modernisation architect · Sylius (PHP / Symfony, very large)

## The codebase

| | |
| --- | --- |
| Repo | `~/workspace-manager/workspaces/personal/Sylius` |
| Branch and commit | `2.3` @ `6b24cc10` (2026-09-16) |
| Workspace | `Sylius`. Not "Sylius (rules fixture)". |
| Workspace id | `d5a0d741-3611-488c-8f5a-243b806d3886` (for `StartAt` and `DRIVE_WORKSPACE=Sylius`) |
| Pinned scan (rev 3) | `eaaa24e0-e63d-4b47-ad1b-09f88f9347ef` |
| Shape (rev 3) | 1,378 components (PHP namespaces), about 11.7k files, 855 authors |

The layout has three layers:

- `Sylius\Component\*`: framework-agnostic domain;
- `Sylius\Bundle\*Bundle`: Symfony integration;
- `Sylius\Behat` and `Tests`.

The largest "component" is a Symfony config namespace.

**Why this codebase:** it is the biggest codebase in the set, with a stated
architecture (components versus bundles) that can be declared and checked. It
tests the lens builder, Declare → Rules and the Sandbox at a scale where the
UI's limits show.

## Persona: P4, the modernisation architect

The platform team wants to move towards independently versioned packages. You
must propose the first extraction and what it costs.

## Task, in the persona's words

> "Sylius says Components are framework-agnostic and Bundles integrate them
> with Symfony. Is that true? Declare it (Components must not depend on
> Bundles; Bundles may depend on Components) and show me every place the code
> breaks it. Then pick the best first candidate to extract into its own
> package. It should be something with a real seam: low coupling across it,
> and things inside it that change together. Tell me what we would have to
> cut: which imports, in how many files. Try it in the sandbox before you
> recommend it. And tell me what in this snapshot is not really Sylius code
> (config, vendored, tests) so we do not plan around noise."

## Deliverable

1. A declared Architecture lens (Components / Bundles / Behat+Tests /
   other), with its Rules result.
2. The extraction candidate, with its evidence and a Sandbox what-if (before
   and after numbers), saved to a report.
3. The lead's memo: the candidate, the cost and the risks.

## Done looks like

- The rule "Component must not depend on Bundle" is checked. The app ships a
  built-in rule like this for Symfony layouts, so note whether it was found
  or declared by hand. Crossings are listed with file:line.
- The candidate is chosen from evidence, not from its name:
  - dependents and dependencies across the seam;
  - co-change inside the seam against co-change across it;
  - the tangles it touches.
- The Sandbox shows the effect of the cut: tangles, dependencies, import
  lines and files to change. If the Sandbox cannot model it (a new
  component, or many files at once), that is recorded as a finding.
- Noise is identified: the Symfony `Loader\Configurator` namespace is the
  largest "component"; Behat and Tests make up a large share.
- The architect notes where the UI stopped scaling (1,378 components).

## What this scenario stresses

- Lens readings on 1,378 components.
- Components and parts.
- Groups by query over PHP namespaces (backslash separators).
- Built-in rules and Declare dependencies → Rules.
- Cross-cut.
- The Sandbox at scale.
- Cycles.
- Connections with Git co-change and "Without an import".

## Answer key

```bash
python3 answers/keys.py "<snapshot of eaaa24e0>" --focus 'Sylius\Component\Core\Model'
```

Scenario keys are in `answers/04.md`.

## Shape

Full run (3 rounds). This is the heaviest scenario. Expect UI slowness to be
a finding.
