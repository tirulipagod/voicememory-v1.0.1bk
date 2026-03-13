# Connections 2.0 Roadmap

## Phase 1: Foundation UI & Data Collection [REVERTED]
- [ ] Upgrade "Add Connection" Modal
    - [ ] Integrate `expo-image-picker` with compression (0.3) and 1:1 aspect
    - [ ] Add "Record Essence" functionality with `expo-file-system` persistence
- [ ] Refactor Connection BottomSheet
    - [ ] Implement dynamic Empty State with CTA
    - [ ] Refactor `EmotionDonutChart` into a Pure/Props-driven component
    - [ ] Filter and pass connection-specific memories to the chart

## Restoration of Specific Chart Features [x]
- [x] Re-implement `FastForwardArrow` (animated chevrons) [x]
- [x] Fix direct touch selection on donut segments [x]
- [x] Refine arrow proximity and remove background [x]

## Phase 2: Dynamic Constellation Physics [ ]
- [ ] Implement dynamic Node Sizing based on memory count [ ]
- [ ] Implement dynamic Orbit Radius based on recency of interaction [ ]
- [ ] Add "Emotional Pulse" (Glow) based on the last recorded emotion [ ]

## Phase 3: AI Intelligence (Auto-Tagging & Insights) [ ]
- [ ] Backend: Implement Name Entity Recognition (NER) to extract names from transcriptions [ ]
- [ ] Frontend: Implement suggestion logic for linking mentioned connections [ ]
- [ ] Frontend: Implement "Relational Copilot" insights in the BottomSheet [ ]
