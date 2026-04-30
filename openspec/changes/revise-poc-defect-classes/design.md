# Design — Revise PoC Defect Classes

## Context

The previous PoC class list was Apple, Banana, Broccoli, Carrot, and Orange.
The user revised the goal toward quality/defect detection with spot classes for
apple, banana, and orange.

## Class Contract

| id | class |
| --- | --- |
| 0 | apple |
| 1 | apple_spot |
| 2 | banana |
| 3 | banana_spot |
| 4 | orange |
| 5 | orange_spot |

Class names are lowercase ASCII in configs and metadata. App UI can map these
to display labels later.

## Decisions

### D1. Spots are segmentation classes

Spot regions are represented as their own polygon masks. A single image can
contain a whole-object mask and one or more spot masks. This lets YOLO26n-seg
produce both the object boundary for measurement and spot regions for defect
signals.

### D2. Measurement uses object classes only

Physical length/width/area should be computed from whole-object classes:
`apple`, `banana`, and `orange`. Spot classes are quality/defect evidence and
should not be included in object measurement aggregates.

### D3. Remove Broccoli and Carrot from current PoC

Broccoli and carrot are out of the current label contract. They can be added
later through a new OpenSpec change if needed.

## Migration Note

Any labels created under the previous class order are incompatible with the new
contract and must be regenerated or remapped before training.

## Validation

- Dataset config reports the six classes.
- Metadata generation emits the six classes.
- Unit tests and OpenSpec validation pass.
