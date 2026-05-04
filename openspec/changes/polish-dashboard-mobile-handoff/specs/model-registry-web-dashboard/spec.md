## ADDED Requirements

### Requirement: Dashboard keeps lifecycle cards concise
The dashboard SHALL keep model lifecycle cards focused on operator decisions while preserving low-level artifact and path details through secondary affordances.

#### Scenario: Operator reviews dataset sections
- **WHEN** a run or model detail shows Dataset information
- **THEN** the Dataset section SHALL omit the dataset config row
- **AND** dataset split cards SHALL omit full filesystem paths from their card body

#### Scenario: Operator reviews model records
- **WHEN** model versions are listed
- **THEN** each record SHALL omit artifact size from the row summary

#### Scenario: Operator reviews platform readiness
- **WHEN** Android or iOS artifact cards render
- **THEN** the artifact R2 key SHALL be available through an info icon tooltip
- **AND** the full R2 key SHALL NOT occupy the artifact card body

### Requirement: Dashboard provides mobile API handoff
The repository SHALL provide Postman-ready instructions for the mobile-facing registry endpoints.

#### Scenario: Mobile developer imports the collection
- **WHEN** a developer imports the Postman collection
- **THEN** they can call list selectable models and resolve default model using collection variables
- **AND** the instructions SHALL identify response keys needed by the mobile app

#### Scenario: Mobile developer reviews deployment handoff
- **WHEN** a deployed model detail renders the Deployment section
- **THEN** the section SHALL show Postman import, variable setup, and endpoint usage steps
- **AND** it SHALL link to the Postman guide and collection source
