# Cosmic Spin — Implementation Plan

## Context

Cosmic Spin is a Crazy Time-style multiplayer game show web app with a deep space exploration theme. The core experience is a holographic star-map wheel aboard a space station command deck, plus four bonus rounds modeled as deep-space missions.

This document is the source-of-truth implementation plan for building a playable web prototype using React + Canvas + PartyKit.

## Stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | Vite 5 + React 18 + TypeScript 5 | Fast iteration + strong typing |
| State | Zustand | Lightweight client state |
| Multiplayer | PartyKit on Cloudflare | Authoritative room model + alarms |
| Wheel | HTML Canvas | Smooth spin animation and FX control |
| Bonus Rounds | Canvas + DOM hybrid | Physics where needed, clickable UI where needed |
| Theming | Single `theme.ts` | Full visual/game content reskin without logic edits |
| Audio | Web Audio API + HTML5 Audio | Ambient loop + event SFX |
| Deploy | PartyKit + Cloudflare Pages | Straightforward deployment |

## Architecture Decisions

1. **Server-authoritative outcomes:** Server decides winning segment and bonus outcomes. Clients only animate.
2. **Alarm-driven phase loop:** PartyKit alarms control transitions for resilient timing.
3. **Bonus sub-state-machines:** Each bonus round has its own deterministic server flow.
4. **Single-theme system:** `theme.ts` holds all visual tokens, labels, commentary, and sound paths.
5. **Immediate bet deduction:** Balances are reduced when bets are placed, not at payout.
6. **PlayerAction abstraction:** Shared interaction UI for all bonus input patterns.

## Canonical Project Structure

```text
crazy-time/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── partykit.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── theme.ts
│   ├── store.ts
│   ├── types.ts
│   ├── connection.ts
│   ├── components/
│   ├── bonus-rounds/
│   └── lib/
├── server/
│   ├── index.ts
│   └── bonus-logic.ts
└── public/
    ├── sounds/
    └── avatar/
```

## Main Game Loop

```text
BETTING (15s) -> SPINNING (6s) -> RESULT (3s) -> PAYOUT (2s)
                                  |
                                  +-- if bonus segment --> BONUS_INTRO -> BONUS_PLAY -> BONUS_RESULT -> BONUS_PAYOUT
```

## Wheel Segment Distribution

- `star_1` (1x): 20
- `star_2` (2x): 12
- `star_5` (5x): 7
- `star_10` (10x): 4
- `warp_jump`: 5
- `asteroid_belt`: 3
- `black_hole`: 2
- `mission_control`: 1

**Total segments: 54**

## Bonus Round Summary

### Warp Jump
- Two wormholes, player picks one.
- Pool: `[2, 3, 5, 8, 10, 15, 25, 50]`.
- Rare double-warp event (10%) with optional hyper-gate.

### Asteroid Belt
- 4x4 grid pick.
- Weighted distribution from low to ultra multipliers.
- Unstable asteroid split event (20% round chance).

### Black Hole
- Watch-only probe path.
- Ring multipliers: 2x, 5x, 10x, 25x, 100x, 500x.
- Singularity is rare (~1%).

### Mission Control
- Secondary 8-segment wheel.
- 1-3 signal boosts, each double or triple.
- First Contact event (5%) swaps to premium board.

## Build Order

1. Skeleton + typed protocol + PartyKit shell.
2. Main wheel canvas and segment math.
3. Betting UI and lock/deduct rules.
4. Main loop state machine + payout.
5. Bonus infra + transition + shared player action component.
6. Warp Jump.
7. Asteroid Belt.
8. Black Hole.
9. Mission Control.
10. Multiplayer list + chat + reactions.
11. Commander host + polish + audio.
12. Deploy pipeline.

## Verification Checklist

- Dev loop starts correctly.
- Multi-tab room sync works.
- Main loop phases transition automatically.
- Wheel animation matches server target.
- Main and bonus payouts validate correctly.
- Each bonus round interaction/reveal works end-to-end.
- Commentary + SFX + celebration triggers fire contextually.
- Theme-only edits reskin the full app without logic changes.

## Notes for This Repository

The current repository is a different product (`second-brain-dashboard`) and does not yet include the Cosmic Spin stack or folder topology. This plan is intentionally documented first so implementation can proceed incrementally without blocking existing work.
