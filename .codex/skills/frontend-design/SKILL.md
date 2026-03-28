---
name: frontend-design
description: Design and build distinctive production-grade frontend interfaces with strong visual direction instead of generic AI-generated aesthetics.
---
# Frontend Design

Use this skill when the user wants a frontend component, page, or application that feels intentional, visually memorable, and production-ready.

## Goal

Create working UI code that commits to a clear aesthetic point of view and avoids generic, interchangeable design.

## Design Process

### 1. Understand the Context

Before coding, identify:

- Purpose: what the interface is for
- Audience: who will use it
- Constraints: framework, responsiveness, accessibility, performance, brand requirements
- Differentiation: the one thing the user should remember about the design

### 2. Commit to a Strong Direction

Pick a clear aesthetic and follow through with it. Possibilities include:

- brutally minimal
- maximalist
- editorial
- retro-futuristic
- luxury
- playful
- industrial
- organic
- geometric
- soft and pastel

The key is intentionality. Refined minimalism and expressive maximalism can both work if the decisions are coherent.

### 3. Build Real, Working Code

The result should be:

- functional, not decorative mockup code
- cohesive across typography, color, motion, spacing, and structure
- polished on desktop and mobile
- accessible and responsive

## Visual Guidance

### Typography

- Avoid default-feeling choices such as Arial, Inter, Roboto, and generic system stacks unless the existing product requires them
- Pair a distinctive display voice with a readable body face
- Let typography carry the tone of the interface

### Color and Theme

- Commit to a defined palette and express it through CSS variables or tokens
- Use strong dominant colors with purposeful accents
- Avoid timid, evenly distributed palettes that make everything feel the same

### Motion

- Prefer a few high-impact animations over many forgettable ones
- Use staggered reveals, scroll-triggered transitions, and meaningful hover states
- In React, prefer a real motion library when available; otherwise use disciplined CSS animation

### Spatial Composition

- Use asymmetry, overlap, rhythm, and negative space intentionally
- Avoid generic card grids and predictable centered layouts unless the product truly needs them
- Let the composition support the concept

### Backgrounds and Texture

- Build atmosphere with gradients, meshes, patterns, transparencies, shadows, or subtle grain
- Avoid flat, context-free backgrounds when the design needs depth

## Anti-Patterns

Do not default to:

- purple-gradient-on-white startup styling
- cookie-cutter SaaS sections
- interchangeable card layouts
- generic font stacks
- decorative motion with no conceptual role

## Complexity Matching

- Bold, expressive concepts can justify more elaborate code and motion systems
- Refined minimalist work should stay restrained and precise
- Match implementation complexity to the chosen visual direction

## Review Checklist

1. Is the aesthetic clear within a few seconds?
2. Would this design be memorable without explaining it?
3. Do typography, color, motion, and layout support the same concept?
4. Is the code real, usable, responsive, and accessible?
5. Does the result avoid the usual AI-generated visual clichés?
