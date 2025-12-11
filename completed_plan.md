I have implemented the Subclustering and "Drill-down" analysis feature as requested.

### Key Features Implemented:

1.  **Backend Subclustering Workflow (`backend/app/subcluster.py`)**:
    *   Created a dedicated pipeline to subset data, re-run preprocessing (HVG, PCA, Neighbors, Leiden, UMAP), and perform automated annotation on the subset.
    *   Saves child datasets in a nested `subclusters/` directory structure.

2.  **New API Endpoints (`backend/app/main.py`)**:
    *   `POST /subcluster`: Triggers the subclustering background job.
    *   `GET /subclusters`: Lists available subclusters for a given parent dataset.
    *   `POST /merge_subcluster`: Handles merging labels from a child dataset back to a specific column in the parent dataset.

3.  **Frontend Refactoring & UI**:
    *   **`UMAPExplorer.tsx`**: Extracted the core visualization canvas into a reusable component. This allows recursively rendering "Drill-down" views.
    *   **Subcluster Trigger**: Added a "Subcluster & Analyze" button in the selection panel (bottom left).
    *   **`SubclusterConfigModal.tsx`**: A wizard for configuring preprocessing (HVG, PCs, Resolution) and annotation settings for the new analysis.
    *   **Nested Navigation**: `VisualizationDashboard.tsx` now manages a stack of datasets (`pathStack`), allowing you to drill down into subclusters and pop back up to the parent.
    *   **Merge Workflow**: When viewing a subcluster, a new header bar appears with a "Merge to Parent" button.
    *   **`MergeSubclusterModal.tsx`**: Allows you to map a layer from the subcluster (e.g., 'leiden') to a target layer in the parent (updating an existing column or creating a new one).

### How to Verify:
1.  Open an annotated dataset.
2.  Use the **Lasso Tool** (left sidebar) to select a group of cells.
3.  Click **"Subcluster & Analyze"** in the bottom-left panel.
4.  Configure parameters and run. Wait for the notification.
5.  Open the **"Subclusters" panel** (new folder icon in sidebar) and click "Open Analysis" on the new item.
6.  You will be taken to a new UMAP view of just those cells.
7.  Perform any re-annotation or check clusters.
8.  Click **"Merge to Parent"** in the top purple header.
9.  Choose a source layer (e.g., `leiden`) and a target layer name (e.g., `fine_grained_v1`).
10. Click Merge, then close the view to return to the main dataset and see your new labels.

