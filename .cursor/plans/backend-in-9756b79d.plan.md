<!-- 9756b79d-a0e3-46cd-99a4-6aa154af84f8 58c9c608-4442-40d3-a159-6f4d8b3a0f05 -->
# Feature: Annotation Confidence Visualization

## Goal

Calculate confidence levels for cell type annotations using Z-scores, save this data structurally, and display it as an overlay on the UMAP. Also fix the visibility of annotation text logs.

## Backend Changes

1.  **Modify `backend/app/annotate.py`**:

    -   In `annotate_with_scsa`, after `scsa.cell_auto_anno(...)`, access the `scsa.anno` DataFrame.
    -   Implement a helper function `save_annotation_confidence(anno_df, output_dir, name, timestamp)`:
        -   Iterate through each cluster.
        -   Sort candidates by Z-score.
        -   Apply Logic Tree:
            -   **High**: Top > 2 * RunnerUp OR RunnerUp < 0.
            -   **Medium**: Top - RunnerUp > 0.5.
            -   **Ambiguous**: Top - RunnerUp < 0.2 (Conflict).
            -   **Unknown**: Top < 1.0 (No Signal).
        -   Collect `alternatives` (candidates within 0.5 Z-score of top).
        -   Save structured data to `{name}_{db_type}_annotation_confidence_{timestamp}.json`.
    -   Ensure this JSON file is added to `data['files']`.

2.  **Modify `backend/app/main.py`**:

    -   Update `classify_file_type` in `get_analy%sis_files` to:
        -   Recognize `annotation_confidence` JSON files (return type `annotation_confidence`).
        -   (Already recognizes `annotation_details` as `annotation_details`).
    -   Add/Update endpoint `get_annotation_confidence(file_path)` (or reuse generic file fetch) to return the JSON content.

## Frontend Changes

1.  **Fix File Visibility (`my-app/src/renderer/components/visualization/AnnotationResults.tsx`)**:

    -   Add `annotation_details` and `annotation_confidence` to the `Reports & Text` group (or a new group).
    -   Update `getTypeLabel` and `getTypeColorClass` for these types.

2.  **Implement Confidence Overlay (`my-app/src/renderer/components/visualization/VisualizationDashboard.tsx`)**:

    -   Fetch the `annotation_confidence` JSON file when loading annotation data.
    -   Add state `annotationConfidence` to store this data.
    -   Implement a new overlay component (e.g., `AnnotationConfidenceOverlay`) that appears when `isAnnotation` is true.
    -   Display:
        -   Current Cluster / Cell Type.
        -   Confidence Badge (High/Medium/Ambiguous).
        -   If Medium/Ambiguous: Show "Alternative Candidates".
        -   "Tug of War" bar for conflicts

### To-dos

- [ ] Refactor UMAPPlot.tsx to handle activeTool and dragmode
- [ ] Update VisualizationDashboard.tsx to pass activeTool and add Lasso button