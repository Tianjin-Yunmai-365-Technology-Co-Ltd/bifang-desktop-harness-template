---
name: prepare-gui-app-identity
description: Collect and approve GUI application identity, window metadata, and icon assets before the first product GUI development task.
---

# Prepare GUI App Identity

Collect the human-facing application identity before the first real GUI development change. A neutral scaffold is not product GUI development.

## Workflow

1. Read `AGENTS.md`, `docs/product_spec/README.md` and the latest dated Product Spec, `docs/project_status/README.md` and the latest dated Product Status, `docs/ENGINEERING_RULES.md`, selected interfaces, and relevant ADRs. Confirm `GUI` is selected and the product purpose is approved.
2. Before the first product GUI plan or implementation, ask the user to confirm the application display name, primary window title, short description, application identifier/bundle identifier, icon direction, and any brand colors or source assets. Ask only for missing values and do not infer legal or brand ownership.
3. Offer exactly these icon paths and let the user choose:
   - **Automatic generation**: derive several icon directions from approved app information, present previews, obtain a choice, and retain the chosen master.
   - **Plan B**: create a simple deterministic fallback such as a monogram or geometric mark from the approved name and colors, then obtain approval.
   - **User upload**: inspect the supplied image, preserve the original, normalize crop, padding, transparency and sRGB color, and use an image-editing/upscaling capability to produce a clean high-resolution master without stretching or inventing brand details.
4. Produce or approve one square 1024×1024 lossless master before platform variants. Generate the platform icon set through the actual Tauri toolchain or another documented deterministic converter; do not hand-author binary icon files or claim visual approval without showing the result.
5. Record approved values, chosen icon path, source/provenance, master path, platform variants, and unresolved distribution metadata in `docs/GUI_APP_PROFILE.md`. Add the consequential identity choice to the current ADR and link the profile from project status.
6. Hand the approved profile to `$plan-change` and `$add-gui-adapter`. If the user defers the icon choice, retain the neutral scaffold icon, mark it explicitly temporary, and block production packaging or release claims while allowing non-packaging business development.

## Boundaries

- Do not silently reuse the Harness logo, a generated draft, or an uploaded low-resolution file as the shipping icon.
- Do not fabricate trademark ownership, store metadata, signing identity, publisher identity, or legal notices.
- Icon generation or editing must use an available image-generation/editing capability when selected; if unavailable, use Plan B or request an upload instead of pretending generation occurred.
- This Skill is retained after initialization and is triggered once for first product GUI development, then again only when the approved GUI identity changes.

## Completion

Report approved and unresolved metadata, the user-selected icon path, master and platform asset evidence, profile location, packaging blocks, and the next GUI planning action.
