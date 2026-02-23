# UX Polish Design — Contest-Ready

**Date**: 2026-02-23
**Deadline**: Week 1 — Feb 27

## Axe 1: Claim UX

- Map contract reverts to human-readable messages (util function)
- Toast notification system (success/error/info, auto-dismiss 5s)
- ClaimButton: spinner during loading, "Claimed ✓" after success
- FaucetCard: grey out after user claims (opacity + overlay)

## Axe 2: First Impression

- Hero section on home page: tagline + 2 CTAs
- Skeleton loading for FaucetCards (animated placeholders)
- Empty state: engaging message + CTA to create
- Footer: "Built on OPNet · Bitcoin Layer 1" + GitHub link
- Favicon (inline SVG) + OG meta tags for Twitter/Discord previews

## Axe 3: Animations & Polish

- Badge "Active" pulse animation
- Claimed card reduced opacity
- Smooth page entrance animations (already partially done)
- Responsive verification

## Files to modify

- `src/components/ClaimButton.tsx` — spinner, states, error mapping
- `src/components/FaucetCard.tsx` — claimed overlay
- `src/components/FaucetGrid.tsx` — hero, skeleton, empty state
- `src/components/Toast.tsx` — NEW: toast notification component
- `src/utils/format.ts` — add revert message mapping
- `src/styles/global.css` — skeleton, toast, hero, footer, animations
- `src/components/Header.tsx` — minor polish
- `src/App.tsx` — toast provider, footer
- `index.html` — favicon, OG meta
