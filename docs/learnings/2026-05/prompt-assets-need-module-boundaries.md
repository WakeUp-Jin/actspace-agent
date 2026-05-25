# Prompt assets need module boundaries

Related history: `docs/histories/2026-05/20260525-1046-centralize-agent-prompts.md`

## What this means

Prompts are runtime assets, not casual string literals. Once a prompt affects
agent behavior, tool output quality, or provider-specific helper calls, it needs
a clear module boundary just like code.

In this project, the useful split is:

- `prompt/main-agent.ts`: stable identity and behavior for the main Agent.
- `prompt/kimi-assistants/*`: internal prompts for thin Kimi helper calls.
- `context/modules/*`: dynamic context, conversation state, tool definitions,
  and user/session-specific instructions.

## Why it matters

Hard-coded prompts are easy to create and hard to operate. They hide behavior
inside unrelated files, make review noisy, and encourage mixing stable rules
with dynamic state.

A prompt module gives future maintainers one obvious place to edit wording while
keeping the call sites focused on orchestration. It also makes it easier to
document which model sees which instruction.

## The useful rule

Ask "who is this prompt for?"

- Main model behavior goes in the main agent prompt.
- Helper-model behavior goes in a helper prompt next to the capability group.
- Runtime facts go through context modules or tool inputs.
- Provider protocol details stay in adapters and clients.

This keeps prompts from becoming a single global instruction blob that leaks
implementation details across model boundaries.

## Common traps

- Putting tool protocol details in the main system prompt. That makes the main
  model aware of implementation details it does not need.
- Putting user/session facts in static prompt files. Those facts become stale
  and hard to test.
- Keeping old prompt paths in design docs. In agent-first repos, stale docs are
  almost as damaging as stale code because future agents follow them.
