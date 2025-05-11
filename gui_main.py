import sys
import io
import traceback
print("Python path:", sys.executable)
print("Python version:", sys.version)

from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, 
                            QHBoxLayout, QPushButton, QLabel, QFileDialog, 
                            QProgressBar, QSpinBox, QDoubleSpinBox, QLineEdit,
    QGroupBox, QMessageBox, QComboBox, QCheckBox, QFormLayout,
    QGraphicsDropShadowEffect, QDockWidget, QScrollArea,
    QGridLayout, QDialog, QTabWidget, QTextEdit
)
from PyQt5.QtCore import Qt, QThread, pyqtSignal, QSize, QPropertyAnimation, QEasingCurve
from PyQt5.QtGui import QPalette, QColor, QFont, QPixmap, QTextCursor

import os

from pipeline_runner import AnnotationRunner, AnalysisRunner, InfernCNVRunner

################################################################################
# 1) Create an EmittingStream to redirect print statements to a PyQt signal
################################################################################
from PyQt5.QtCore import QObject, pyqtSignal

class EmittingStream(QObject):
    text_written = pyqtSignal(str)

    def write(self, text):
        if text.strip():
            self.text_written.emit(text)

    def flush(self):
        pass

################################################################################
# Create an expandable/collapsible info sidebar widget
################################################################################
class InfoSidebar(QWidget):
    """
    A collapsible sidebar that provides detailed information about a section.
    Can be expanded or collapsed with a toggle button.
    """
    def __init__(self, title, content, parent=None):
        super().__init__(parent)
        self.setObjectName("infoSidebar")
        
        # Main layout
        self.main_layout = QVBoxLayout(self)
        self.main_layout.setContentsMargins(0, 0, 0, 0)
        
        # Header with toggle button
        self.header = QWidget()
        self.header_layout = QHBoxLayout(self.header)
        self.header_layout.setContentsMargins(5, 5, 5, 5)
        
        self.toggle_btn = QPushButton("ℹ️")
        self.toggle_btn.setToolTip("Show/hide detailed information")
        self.toggle_btn.setFixedSize(20, 20)
        self.toggle_btn.setStyleSheet("""
            QPushButton {
                background-color: #7289DA;
                color: white;
                border-radius: 12px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #8697E2;
            }
        """)
        
        self.title_label = QLabel(title)
        self.title_label.setStyleSheet("color: #7289DA;")
        
        self.header_layout.addWidget(self.toggle_btn)
        self.header_layout.addWidget(self.title_label)
        self.header_layout.addStretch()
        
        # Content area (initially hidden)
        self.content_area = QTextEdit()
        self.content_area.setReadOnly(True)
        self.content_area.setHtml(content)
        self.content_area.setStyleSheet("""
            QTextEdit {
                background-color: #36393F;
                color: #DCDDDE;
                border: 1px solid #202225;
                border-radius: 4px;
                padding: 8px;
            }
        """)
        self.content_area.setVisible(False)
        self.content_area.setMinimumHeight(250)  # Set a larger minimum height
        self.content_area.setMaximumHeight(500)  # Increase maximum height significantly
        
        # Add widgets to main layout
        self.main_layout.addWidget(self.header)
        self.main_layout.addWidget(self.content_area)
        
        # Connect toggle button
        self.toggle_btn.clicked.connect(self.toggle_content)
        
    def toggle_content(self):
        self.content_area.setVisible(not self.content_area.isVisible())
        self.toggle_btn.setText("ℹ️" if not self.content_area.isVisible() else "🔼")

################################################################################
# 2) Add a QTabWidget in the main GUI, with "Annotation" and new "Analysis" tabs
################################################################################
class SingleTabGUI(QMainWindow):
    """
    """

    def __init__(self):
        super().__init__()
        self.setWindowTitle("CellPilot 🚀")
        self.setGeometry(150, 80, 750, 1000)  # Less wide (900px) but taller (700px)

        # Apply a custom Discord-like dark theme
        self.setPalette(self.create_discord_palette())

        # Instead of a main_widget alone, let's create a QTabWidget
        self.tab_widget = QTabWidget()
        self.setCentralWidget(self.tab_widget)

        # Annotation tab
        annot_tab = QWidget()
        self.setup_annotation_tab(annot_tab)
        self.tab_widget.addTab(annot_tab, "Annotation")

        # Analysis tab
        analysis_tab = QWidget()
        self.setup_analysis_tab(analysis_tab)
        self.tab_widget.addTab(analysis_tab, "Analysis")

        # About tab  🛈
        about_tab = QWidget()
        self.setup_about_tab(about_tab)
        self.tab_widget.addTab(about_tab, "About")

        # Create a scrollable area for the tabs
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)

        scroll_widget = QWidget()
        scroll_layout = QVBoxLayout(scroll_widget)

        # Add the tabs to scroll_layout, then set scroll_widget as scroll_area's content
        scroll_layout.addWidget(self.tab_widget)
        scroll_area.setWidget(scroll_widget)

        # Also add a log area at the bottom (or side)
        self.log_text_edit = QTextEdit()
        self.log_text_edit.setReadOnly(True)
        self.log_text_edit.setStyleSheet("background-color: #2F3136; color: #DCDDDE;")
        self.log_text_edit.setMaximumHeight(100)
        
        main_widget = QWidget()
        main_layout = QVBoxLayout(main_widget)
        # Put the scroll area (with tabs) above the log
        
        # Create a log section with header
        log_section = QWidget()
        log_layout = QVBoxLayout(log_section)
        log_header = QLabel("📋 Log Output")
        log_header.setStyleSheet("font-weight: bold; color: #7289DA;")
        log_layout.addWidget(log_header)
        log_layout.addWidget(self.log_text_edit)
        main_layout.addWidget(scroll_area, 8)
        main_layout.addWidget(log_section, 1)

        self.setCentralWidget(main_widget)

        # Hook Python's stdout/stderr to our EmittingStream
        self.stdout_stream = EmittingStream()
        self.stdout_stream.text_written.connect(self.append_to_log)
        sys.stdout = self.stdout_stream
        sys.stderr = self.stdout_stream

        self.show()

    def create_discord_palette(self):
        """
        Create a custom palette using colors reminiscent of Discord's dark mode theme.
        """
        palette = QPalette()

        # Window background (very dark charcoal)
        palette.setColor(QPalette.Window, QColor("#2F3136"))
        
        # Text color
        palette.setColor(QPalette.WindowText, QColor("#DCDDDE"))
        
        # Base for text inputs
        palette.setColor(QPalette.Base, QColor("#40444B"))
        
        # Alternate base (slightly darker)
        palette.setColor(QPalette.AlternateBase, QColor("#2F3136"))
        
        # Tooltips
        palette.setColor(QPalette.ToolTipBase, QColor("#1E1F22"))
        palette.setColor(QPalette.ToolTipText, QColor("#DCDDDE"))

        # Normal text
        palette.setColor(QPalette.Text, QColor("#DCDDDE"))
        
        # Button
        palette.setColor(QPalette.Button, QColor("#40444B"))
        palette.setColor(QPalette.ButtonText, QColor("#FFFFFF"))
        
        # Highlight (Discord brand-ish purple)
        palette.setColor(QPalette.Highlight, QColor("#7289DA"))
        palette.setColor(QPalette.HighlightedText, QColor("#FFFFFF"))
        
        return palette

    def setup_annotation_tab(self, parent_widget):
        """
        Create a single interface that includes:
         - Input file selection
         - Output directory selection
         - Preprocessed vs. raw data
         - Preprocessing parameters
         - Annotation parameters
         - Run button
         - Progress display
        """
        layout = QVBoxLayout(parent_widget)

        # =========================
        # (1) 📂 Input File / Directory
        # =========================
        file_group = QGroupBox("📂 Input File / Directory")
        self.apply_shadow(file_group)
        file_group_layout = QVBoxLayout()
        file_form = QFormLayout()

        # Input file path
        self.input_file_edit = QLineEdit()
        self.input_file_edit.setPlaceholderText("Path to input file (H5AD, H5, CSV, TXT, or MTX)...")
        self.input_file_edit.setToolTip("Accepted formats:\n• H5AD: Annotated data matrix (Scanpy)\n• H5: 10x Genomics feature-barcode matrix\n• CSV/TXT: Gene expression matrix\n• MTX: Matrix Market format with genes.tsv and barcodes.tsv")
        file_button = QPushButton("Browse…")
        file_button.clicked.connect(self.select_input_file)

        file_hlayout = QHBoxLayout()
        file_hlayout.addWidget(self.input_file_edit)
        file_hlayout.addWidget(file_button)
        file_form.addRow("Input File:", file_hlayout)
        
        # Output directory
        self.output_dir_edit = QLineEdit()
        self.output_dir_edit.setPlaceholderText("Path to output directory...")
        self.output_dir_edit.setToolTip("Directory where analysis results will be saved:\n• Annotated .h5ad file\n• UMAP plots\n• Heatmaps\n• Marker gene lists")
        out_button = QPushButton("Browse…")
        out_button.clicked.connect(self.select_output_dir)

        out_hlayout = QHBoxLayout()
        out_hlayout.addWidget(self.output_dir_edit)
        out_hlayout.addWidget(out_button)
        file_form.addRow("Output Dir:", out_hlayout)

        # New "Annotation Name" field
        self.annotation_name_edit = QLineEdit()
        self.annotation_name_edit.setPlaceholderText("Name for annotation run (e.g. 'sampleA')")
        self.annotation_name_edit.setToolTip("A descriptive name for this analysis run.\nWill be used in output filenames and plots.")
        file_form.addRow("Annotation Name:", self.annotation_name_edit)

        file_group_layout.addLayout(file_form)
        
        # Add info sidebar for file selection directly in the group box
        # Add info sidebar for file selection
        file_info_content = """
        <h3>Input File Selection</h3>
        <p>CellPilot accepts several input formats:</p>
        <ul>
            <li><b>H5AD files</b>: AnnData objects saved by Scanpy</li>
            <li><b>H5 files</b>: 10x Genomics feature-barcode matrices</li>
            <li><b>CSV/TXT files</b>: Gene expression matrices (genes as rows, cells as columns)</li>
            <li><b>MTX files</b>: Matrix Market format with accompanying genes.tsv and barcodes.tsv</li>
        </ul>
        <p>For preprocessed files, ensure they contain:</p>
        <ul>
            <li>Normalized counts</li>
            <li>PCA and UMAP coordinates</li>
            <li>Clustering information</li>
        </ul>
        
        <h4>Output Files</h4>
        <p>The annotation process generates these files:</p>
        <ul>
            <li><b>annotated_[name]_[timestamp].h5ad</b>: Complete annotated dataset with cell types (Scanpy AnnData format)</li>
            <li><b>umap_clusters_[name]_[timestamp].png</b>: UMAP plot colored by cluster</li>
            <li><b>umap_celltype_[name]_[timestamp].png</b>: UMAP plot colored by cell type</li>
            <li><b>heatmap_markers_[name]_[timestamp].png</b>: Heatmap of top marker genes</li>
            <li><b>markers_[name]_[timestamp].csv</b>: Table of marker genes for each cluster</li>
            <li><b>annotation_results_[name]_[timestamp].csv</b>: Cell type assignments with confidence scores</li>
        </ul>
        
        <p>All files are saved to the specified output directory with timestamps (YYYYMMDD_HHMM format) to prevent overwriting.</p>
        
        <p>The main output file <b>annotated_[name]_[timestamp].h5ad</b> contains all the original data plus annotations in the <code>adata.obs['cellmarker']</code> column.</p>
        
        <p>The <b>Annotation Name</b> is used as a prefix for all output files.</p>
        """
        file_group_layout.addWidget(InfoSidebar("", file_info_content))
        
        file_group.setLayout(file_group_layout)
        layout.addWidget(file_group)

        # =========================
        # (2) Preprocessed Checkbox
        # =========================
        self.preprocessed_checkbox = QCheckBox("File is already preprocessed")
        self.preprocessed_checkbox.setToolTip("Check this if your input file is already normalized and contains PCA, UMAP, and clustering.\nTypically for .h5ad files that have been processed with Scanpy.")
        self.preprocessed_checkbox.setChecked(False)
        
        preproc_check_layout = QVBoxLayout()
        preproc_check_layout.addWidget(self.preprocessed_checkbox)
        
        # Add info sidebar for preprocessed checkbox
        preproc_check_info = """
        <h3>Preprocessed Data</h3>
        <p>Check this box if your input file has already been preprocessed with quality control, normalization, and clustering.</p>
        <p>Preprocessed files should contain:</p>
        <ul>
            <li>Normalized data in <code>adata.X</code></li>
            <li>PCA results in <code>adata.obsm['X_pca']</code></li>
            <li>UMAP coordinates in <code>adata.obsm['X_umap']</code></li>
            <li>Cluster assignments in <code>adata.obs['leiden']</code></li>
        </ul>
        """
        preproc_check_layout.addWidget(InfoSidebar("", preproc_check_info))
        
        preproc_check_widget = QWidget()
        preproc_check_widget.setLayout(preproc_check_layout)
        layout.addWidget(preproc_check_widget)
        self.preprocessed_checkbox.stateChanged.connect(self.toggle_preprocessing_params)

        # =========================
        # (3) 💾 Preprocessing Parameters
        # =========================
        self.preprocess_group = QGroupBox("💾 Preprocessing Parameters")
        self.preprocess_group.setToolTip("Parameters for quality control, normalization, and clustering.\nThese settings are applied when processing raw count data.")
        self.apply_shadow(self.preprocess_group)
        self.preprocess_layout = QGridLayout()

        self.preprocess_layout.addWidget(QLabel("Mito Threshold:"), 0, 0)
        self.mito_threshold_spin = QDoubleSpinBox()
        self.mito_threshold_spin.setRange(0, 1)
        self.mito_threshold_spin.setValue(0.05)
        self.mito_threshold_spin.setToolTip("Maximum fraction of mitochondrial genes allowed.\nCells with higher mitochondrial content are filtered out (typically dying cells).")
        self.preprocess_layout.addWidget(self.mito_threshold_spin, 0, 1)

        self.preprocess_layout.addWidget(QLabel("Min Genes:"), 0, 2)
        self.min_genes_spin = QSpinBox()
        self.min_genes_spin.setRange(0, 50000)
        self.min_genes_spin.setValue(250)
        self.min_genes_spin.setToolTip("Minimum number of genes detected per cell.\nCells with fewer genes are filtered out.")
        self.preprocess_layout.addWidget(self.min_genes_spin, 0, 3)

        self.preprocess_layout.addWidget(QLabel("Min Counts:"), 1, 0)
        self.min_counts_spin = QSpinBox()
        self.min_counts_spin.setRange(0, 100000)
        self.min_counts_spin.setValue(500)
        self.min_counts_spin.setToolTip("Minimum number of UMI counts per cell.\nCells with fewer counts are filtered out.")
        self.preprocess_layout.addWidget(self.min_counts_spin, 1, 1)

        self.preprocess_layout.addWidget(QLabel("Number of HVGs:"), 1, 2)
        self.n_hvgs_spin = QSpinBox()
        self.n_hvgs_spin.setRange(500, 10000)
        self.n_hvgs_spin.setValue(2000)
        self.n_hvgs_spin.setToolTip("Number of highly variable genes to select.\nThese genes will be used for dimensionality reduction and clustering.")
        self.preprocess_layout.addWidget(self.n_hvgs_spin, 1, 3)

        self.preprocess_layout.addWidget(QLabel("Number of PCs:"), 2, 0)
        self.n_pcs_spin = QSpinBox()
        self.n_pcs_spin.setRange(10, 300)
        self.n_pcs_spin.setValue(50)
        self.n_pcs_spin.setToolTip("Number of principal components to compute.\nThese will be used for neighborhood graph construction.")
        self.preprocess_layout.addWidget(self.n_pcs_spin, 2, 1)

        self.preprocess_layout.addWidget(QLabel("Number of Neighbors:"), 2, 2)
        self.neighbors_spin = QSpinBox()
        self.neighbors_spin.setRange(1, 200)
        self.neighbors_spin.setValue(15)
        self.neighbors_spin.setToolTip("Number of neighbors for building the neighborhood graph.\nAffects clustering granularity and UMAP visualization.")
        self.preprocess_layout.addWidget(self.neighbors_spin, 2, 3)

        self.preprocess_layout.addWidget(QLabel("Leiden Resolution:"), 3, 0)
        self.resolution_dspin = QDoubleSpinBox()
        self.resolution_dspin.setRange(0.1, 5.0)
        self.resolution_dspin.setValue(0.8)
        self.resolution_dspin.setSingleStep(0.1)
        self.resolution_dspin.setToolTip("Resolution parameter for Leiden clustering.\nHigher values create more, smaller clusters.")
        self.preprocess_layout.addWidget(self.resolution_dspin, 3, 1)

        preproc_group_layout = QVBoxLayout()
        preproc_group_layout.addLayout(self.preprocess_layout)
        
        # Add info sidebar for preprocessing parameters
        preproc_info = """
        <h3>Preprocessing Steps</h3>
        <p>When preprocessing raw data, CellPilot performs these steps:</p>
        
        <h4>1. Quality Control</h4>
        <ul>
            <li><b>Mito Threshold</b>: Filters cells with high mitochondrial content (dying cells)</li>
            <li><b>Min Genes</b>: Removes cells with too few detected genes</li>
            <li><b>Min Counts</b>: Removes cells with too few UMI counts</li>
            <li>Performs doublet detection and removal</li>
        </ul>
        
        <h4>2. Normalization & Feature Selection</h4>
        <ul>
            <li>Normalizes counts per cell and log-transforms</li>
            <li><b>Number of HVGs</b>: Selects highly variable genes for dimensionality reduction</li>
            <li><b>Number of PCs</b>: Principal components to compute</li>
            <li><b>Number of Neighbors</b>: For building the neighborhood graph</li>
            <li><b>Leiden Resolution</b>: Controls clustering granularity (higher = more clusters)</li>
        </ul>
        
        <h4>Preprocessing Outputs</h4>
        <p>During preprocessing, CellPilot generates:</p>
        <ul>
            <li><b>QC plots</b>: Distribution of genes per cell, UMI counts, mitochondrial content (PNG format)</li>
            <li><b>Elbow plot</b>: Variance explained by each principal component</li>
            <li><b>UMAP plot</b>: 2D representation of the data colored by cluster</li>
            <li><b>Cluster tree</b>: Hierarchical relationship between clusters</li>
        </ul>
        
        <p>These intermediate visualizations are saved in the output directory along with the final results.</p>
        
        <p>The preprocessed data is stored in the final <b>annotated_[name]_[timestamp].h5ad</b> file, which includes normalized counts in <code>adata.X</code>, PCA in <code>adata.obsm['X_pca']</code>, and UMAP in <code>adata.obsm['X_umap']</code>.</p>
        """
        preproc_group_layout.addWidget(InfoSidebar("", preproc_info))
        
        self.preprocess_group.setLayout(preproc_group_layout)
        layout.addWidget(self.preprocess_group)
        self.toggle_preprocessing_params()  # Hide if "already preprocessed" is checked

        # =========================
        # (4) 🚀 Annotation Parameters
        # =========================
        anno_group = QGroupBox("🚀 Annotation Parameters")
        anno_group.setToolTip("Settings for automated cell type annotation.\nThese determine which reference databases are used for matching marker genes.")
        self.apply_shadow(anno_group)
        anno_layout = QFormLayout()

        self.species_combo = QComboBox()
        self.species_combo.addItems(["human", "mouse"])
        self.species_combo.setToolTip("Select the species of your sample.\nThis affects which reference databases are used.")
        anno_layout.addRow("Species:", self.species_combo)

        self.cellmarker_checkbox = QCheckBox("Use CellMarker")
        self.cellmarker_checkbox.setToolTip("Use the CellMarker database for annotation.\nComprehensive collection of cell markers across tissues.")
        self.cellmarker_checkbox.setChecked(True)
        anno_layout.addRow(self.cellmarker_checkbox)

        self.panglao_checkbox = QCheckBox("Use Panglao DB")
        self.panglao_checkbox.setToolTip("Use the PanglaoDB for annotation.\nCurated database of cell type markers from various tissues.")
        self.panglao_checkbox.setChecked(False)
        anno_layout.addRow(self.panglao_checkbox)

        self.cancer_sca_checkbox = QCheckBox("Use Cancer Single Cell Atlas")
        self.cancer_sca_checkbox.setToolTip("Use the Cancer Single Cell Atlas for annotation.\nSpecialized for cancer cell types and states.")
        self.cancer_sca_checkbox.setChecked(False)
        anno_layout.addRow(self.cancer_sca_checkbox)

        anno_group_main = QVBoxLayout()
        anno_group_main.addLayout(anno_layout)
        
        # Add info sidebar for annotation parameters
        anno_info = """
        <h3>Cell Type Annotation</h3>
        <p>CellPilot uses reference databases to assign cell types to clusters:</p>
        
        <h4>Reference Databases</h4>
        <ul>
            <li><b>CellMarker</b>: Comprehensive database of cell markers across tissues</li>
            <li><b>PanglaoDB</b>: Curated database with cell type markers from various tissues</li>
            <li><b>Cancer Single Cell Atlas</b>: Specialized for cancer cell types</li>
        </ul>
        
        <h4>Annotation Process</h4>
        <ol>
            <li>Identifies marker genes for each cluster</li>
            <li>Compares markers with reference databases</li>
            <li>Calculates enrichment scores for potential cell types</li>
            <li>Assigns cell types based on highest scores above the confidence threshold</li>
        </ol>
        
        <h4>Annotation Outputs</h4>
        <p>The annotation process produces:</p>
        <ul>
            <li><b>Cell type UMAP</b>: Cells colored by assigned cell type (PNG format, 300 DPI)</li>
            <li><b>Confidence score UMAP</b>: Cells colored by annotation confidence</li>
            <li><b>Marker gene heatmap</b>: Expression of top markers across clusters</li>
            <li><b>Dotplot</b>: Expression of key markers across cell types</li>
            <li><b>Sankey diagram</b>: Relationship between clusters and cell types</li>
        </ul>
        
        <p>The <b>confidence threshold</b> determines how stringent the annotation is. Higher values may leave more cells unlabeled but with higher confidence in the assignments.</p>
        
        <p>Cell type annotations are stored in the <code>adata.obs['cellmarker']</code> column of the output <b>annotated_[name]_[timestamp].h5ad</b> file. Confidence scores are stored in <code>adata.obs['cellmarker_score']</code>.</p>
        """
        anno_group_main.addWidget(InfoSidebar("", anno_info))
        
        anno_group.setLayout(anno_group_main)
        layout.addWidget(anno_group)

        # =========================
        # (5) Run Button
        # =========================
        self.run_button = QPushButton("Run Annotation")
        self.run_button.setToolTip("Start the annotation pipeline with the current settings.\nThis will process your data and generate annotated results.")
        self.run_button.setStyleSheet("""
            QPushButton {
                background-color: #7289DA;
                color: #FFFFFF;
                padding: 10px 18px;
                font-weight: bold;
                border-radius: 6px;
            }
            QPushButton:hover {
                background-color: #8697E2;
            }
            QPushButton:disabled {
                background-color: #4D5A84;
                color: #AAAAAA;
            }
        """)
        self.run_button.clicked.connect(self.run_annotation)
        layout.addWidget(self.run_button)

        # =========================
        # (6) Progress Bar & Label
        # =========================
        self.progress_label = QLabel("Progress:")
        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        layout.addWidget(self.progress_label)
        layout.addWidget(self.progress_bar)

        parent_widget.setLayout(layout)

    def apply_shadow(self, group_box):
        """
        Apply a drop shadow effect to group boxes for a modern, elevated look.
        """
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(15)
        shadow.setOffset(4, 4)
        shadow.setColor(QColor(0, 0, 0, 180))  # Semi-transparent black
        group_box.setGraphicsEffect(shadow)

    def toggle_preprocessing_params(self):
        """Show or hide the preprocessing parameters group based on preprocessed checkbox."""
        is_preprocessed = self.preprocessed_checkbox.isChecked()
        self.preprocess_group.setVisible(not is_preprocessed)

    def select_input_file(self):
        """Prompt user to pick the input file."""
        dialog = QFileDialog()
        dialog.setFileMode(QFileDialog.ExistingFile)
        dialog.setNameFilter("Data Files (*.h5ad *.h5 *.csv *.txt *.mtx);;All Files (*.*)")
        if dialog.exec_():
            fname = dialog.selectedFiles()[0]
            self.input_file_edit.setText(fname)

    def select_output_dir(self):
        """Prompt user to pick the output directory."""
        dialog = QFileDialog()
        dialog.setFileMode(QFileDialog.Directory)
        if dialog.exec_():
            dirname = dialog.selectedFiles()[0]
            self.output_dir_edit.setText(dirname)

    def run_annotation(self):
        """Collect user inputs, create an AnnotationRunner, and start it."""
        input_file = self.input_file_edit.text().strip()
        output_dir = self.output_dir_edit.text().strip()
        annotation_name = self.annotation_name_edit.text().strip()
        if not input_file:
            QMessageBox.warning(self, "Error", "Please select an input file.")
            return
        if not output_dir:
            QMessageBox.warning(self, "Error", "Please select an output directory.")
            return
        
        preprocessed = self.preprocessed_checkbox.isChecked()
        species = self.species_combo.currentText().strip()
        use_cellmarker = self.cellmarker_checkbox.isChecked()
        use_panglao = self.panglao_checkbox.isChecked()
        use_cancer_sca = self.cancer_sca_checkbox.isChecked()

        pp_params = {
            'mito_prefix': 'MT-',
            'mito_threshold': self.mito_threshold_spin.value(),
            'min_genes': self.min_genes_spin.value(),
            'min_counts': self.min_counts_spin.value(),
            'n_hvgs': self.n_hvgs_spin.value(),
            'n_pcs': self.n_pcs_spin.value(),
            'n_neighbors': self.neighbors_spin.value(),
            'resolution': self.resolution_dspin.value()
        }

        self.anno_thread = AnnotationRunner(
            input_file=input_file,
            output_dir=output_dir,
            preprocessed=preprocessed,
            species=species,
            use_cellmarker=use_cellmarker,
            use_panglao=use_panglao,
            use_cancer_single_cell_atlas=use_cancer_sca,
            preprocessing_params=pp_params,
            name=annotation_name
        )

        self.anno_thread.update_progress.connect(self.on_progress)
        self.anno_thread.finished.connect(self.on_finished)
        self.anno_thread.error.connect(self.on_error)

        self.run_button.setEnabled(False)
        self.anno_thread.start()

        name_val = annotation_name or "analysis"
        self.annotation_prefix = name_val

    def on_progress(self, progress_value, status_msg):
        """Slot to update the progress bar and status label."""
        self.progress_bar.setValue(progress_value)
        if status_msg:
            self.progress_label.setText(f"Progress: {status_msg}")

    def on_finished(self, final_file):
        """Slot called when the annotation finishes."""
        self.run_button.setEnabled(True)
        self.progress_bar.setValue(100)
        self.progress_label.setText(f"Annotation complete! Results saved: {final_file}")
        QMessageBox.information(self, "Done", f"Annotation complete! See {final_file}")

        # 2) Optionally, show a popup displaying any PNGs in the output directory
        from glob import glob
        import os
        out_dir = os.path.dirname(final_file)  # or self.output_dir_edit.text().strip()
        # preview only files that start with the analysis prefix
        prefix    = self.annotation_prefix            # the name we passed earlier
        png_paths = glob(os.path.join(out_dir, f"{prefix}_*.png"))
        if png_paths:
            self.show_png_slideshow(png_paths)

    def show_png_slideshow(self, png_paths):
        """
        Show PNGs one-by-one in a small slideshow dialog with
        "Previous / Next" buttons.  Wrap-around navigation.
        """
        if not png_paths:
            return

        dlg = QDialog(self)
        dlg.setWindowTitle("Result preview")
        dlg.resize(900, 750)

        vbox = QVBoxLayout(dlg)

        img_label = QLabel(alignment=Qt.AlignCenter)
        vbox.addWidget(img_label, 1)

        btn_layout = QHBoxLayout()
        prev_btn  = QPushButton("← Previous")
        next_btn  = QPushButton("Next →")
        close_btn = QPushButton("Close")
        btn_layout.addWidget(prev_btn)
        btn_layout.addWidget(next_btn)
        btn_layout.addStretch()
        btn_layout.addWidget(close_btn)
        vbox.addLayout(btn_layout)

        # ---- navigation logic -----------------------------------------
        index = {"i": 0}            # mutable wrapper for inner functions

        def show_current():
            path = png_paths[index["i"]]
            pix = QPixmap(path).scaled(
                dlg.width() * 0.9, dlg.height() * 0.9,
                Qt.KeepAspectRatio, Qt.SmoothTransformation
            )
            img_label.setPixmap(pix)
            dlg.setWindowTitle(f"{index['i']+1}/{len(png_paths)} – {os.path.basename(path)}")

        def prev():
            index["i"] = (index["i"] - 1) % len(png_paths)
            show_current()

        def nxt():
            index["i"] = (index["i"] + 1) % len(png_paths)
            show_current()

        prev_btn.clicked.connect(prev)   # navigate images
        next_btn.clicked.connect(nxt)
        close_btn.clicked.connect(dlg.accept)
        show_current()

        dlg.exec_()

    def on_error(self, error_message):
        """Slot for handling errors."""
        self.run_button.setEnabled(True)
        QMessageBox.critical(self, "Error", f"Annotation failed: {error_message}")

    ############################################################################
    # 5) New Analysis tab setup
    ############################################################################
    def setup_analysis_tab(self, parent_widget):
        # Instead of a plain form layout, let's nest it inside a group box titled "Cell Interaction"
        main_layout = QVBoxLayout(parent_widget)

        # Create a vertical layout for the cell interaction box
        cell_box_layout = QVBoxLayout()                 # main layout for the box
        
        cell_interaction_box = QGroupBox("Cell Interaction")
        self.apply_shadow(cell_interaction_box)
        layout = QFormLayout()                          # contains the editable fields

        # Input file
        self.cpdb_input_edit = QLineEdit()
        self.cpdb_input_edit.setPlaceholderText("Path to annotated .h5ad file")
        self.cpdb_input_edit.setToolTip("Input should be an annotated .h5ad file\nTypically the output from the Annotation tab")
        input_btn = QPushButton("Browse")
        input_btn.clicked.connect(lambda: self.select_file_for_widget(self.cpdb_input_edit))
        hl_1 = QHBoxLayout()
        hl_1.addWidget(self.cpdb_input_edit)
        hl_1.addWidget(input_btn)
        layout.addRow("Input File:", hl_1)

        # Output directory
        self.cpdb_output_dir = QLineEdit()
        self.cpdb_output_dir.setPlaceholderText("Path to analysis output directory")
        self.cpdb_output_dir.setToolTip("Directory where CellPhoneDB results will be saved:\n• Interaction matrices\n• Heatmaps\n• Network visualizations")
        out_btn = QPushButton("Browse")
        out_btn.clicked.connect(lambda: self.select_dir_for_widget(self.cpdb_output_dir))
        hl_2 = QHBoxLayout()
        hl_2.addWidget(self.cpdb_output_dir)
        hl_2.addWidget(out_btn)
        layout.addRow("Output Dir:", hl_2)

        # Column name in adata.obs for cell types
        self.cpdb_column_edit = QLineEdit()
        self.cpdb_column_edit.setText("cell_type")          # default value
        self.cpdb_column_edit.setPlaceholderText("Cell Label in adata.obs (e.g. 'cellmarker')")
        layout.addRow("Label Column Name:", self.cpdb_column_edit)

        # CPDB file path
        self.cpdb_file_edit = QLineEdit()
        self.cpdb_file_edit.setText("db/cellphonedb.zip")  # Set default path
        self.cpdb_file_edit.setPlaceholderText("Path to CellPhoneDB db zip (e.g. data/cellphonedb.zip)")
        self.cpdb_file_edit.setToolTip("Path to the CellPhoneDB database zip file\nContains ligand-receptor interaction information")
        cpdb_btn = QPushButton("Browse")
        cpdb_btn.clicked.connect(lambda: self.select_file_for_widget(self.cpdb_file_edit))
        hl_3 = QHBoxLayout()
        hl_3.addWidget(self.cpdb_file_edit)
        hl_3.addWidget(cpdb_btn)
        layout.addRow("CPDB File:", hl_3)

        # Analysis name
        self.cpdb_name_edit = QLineEdit()
        self.cpdb_name_edit.setPlaceholderText("Name prefix for output (e.g. 'lung')")
        self.cpdb_name_edit.setToolTip("A descriptive name for this analysis\nWill be used in output filenames")
        layout.addRow("Analysis Name:", self.cpdb_name_edit)

        # counts_min  🔢
        self.cpdb_counts_min_spin = QSpinBox()
        self.cpdb_counts_min_spin.setRange(1, 1000)
        self.cpdb_counts_min_spin.setValue(10)
        self.cpdb_counts_min_spin.setToolTip(
            "Minimum number of significant ligand–receptor pairs required\n"
            "to keep a connection in chord / network plots (default 10).")
        layout.addRow("Counts Min:", self.cpdb_counts_min_spin)

        # Plot-detailed-interactions  📝
        self.cpdb_plot_cells_edit = QLineEdit("All")          # default → All
        self.cpdb_plot_cells_edit.setPlaceholderText("All  (or: B cell,T cell)")
        self.cpdb_plot_cells_edit.setToolTip(
            "Generate detailed dot-plots for specific cell labels.\n"
            " • All  → plot every cell type\n"
            " • (empty) → skip detailed dot-plots\n"
            " • label1,label2,… → only those labels")
        layout.addRow("Plot Detailed Interactions:", self.cpdb_plot_cells_edit)

        # Run button
        self.cpdb_run_btn = QPushButton("Run CellPhoneDB →")
        self.cpdb_run_btn.setStyleSheet("""
            QPushButton {
                background-color: #7289DA; color: #FFFFFF; padding: 8px 14px;
                font-weight: bold; border-radius: 6px;
            }
            QPushButton:hover {
                background-color: #8697E2;
            }
            QPushButton:disabled {
                background-color: #4D5A84;
                color: #AAAAAA;
            }
        """)
        self.cpdb_run_btn.setToolTip("Start CellPhoneDB analysis to identify cell-cell interactions\nThis will analyze ligand-receptor pairs between cell types")
        self.cpdb_run_btn.clicked.connect(self.run_cellphonedb_analysis)
        layout.addRow(self.cpdb_run_btn)

        # Make a horizontal layout so the bar spans the width
        progress_hlayout = QHBoxLayout()
        self.analysis_progress_label = QLabel("Analysis Progress:")
        self.analysis_progress_bar = QProgressBar()
        self.analysis_progress_bar.setValue(0)
        # Stretch the bar to fill remaining space
        progress_hlayout.addWidget(self.analysis_progress_label)
        progress_hlayout.addWidget(self.analysis_progress_bar, 1)
        layout.addRow(progress_hlayout)

        cell_box_layout.addLayout(layout)
        
        # ────────────────────────────────────────────────────────────────
        #  Info sidebar – Cell Interaction / CellPhoneDB
        # ────────────────────────────────────────────────────────────────
        cpdb_info = """
        <h3>Cell Interaction – CellPhoneDB</h3>
        <p>This module quantifies ligand–receptor communication between cell types using the <b>CellPhoneDB</b> framework.</p>

        <h4>Analysis Process</h4>
        <ol>
            <li>Load annotated data (<code>.h5ad</code>) and obtain cell-type labels.</li>
            <li>Create <code>counts</code> and <code>meta</code> files for CellPhoneDB.</li>
            <li>Run <code>cellphonedb statistical_analysis</code> (1 000 permutations, p&nbsp;&lt;&nbsp;0.05).</li>
            <li>Post-process results to generate heat-map, chord diagram and network plots.</li>
        </ol>

        <h4>Output Files</h4>
        <ul>
            <li><b>[name]_cpdb_results.pkl</b> – pickled <code>means</code> / <code>pvalues</code> dict.</li>
            <li><b>[name]_heatmap_[ts].png</b> – interaction heat-map.</li>
            <li><b>[name]_chord_[ts].png</b> – circular chord diagram.</li>
            <li><b>[name]_network_[ts].png</b> – interaction-count network.</li>
            <li><b>[name]_detailed_network_[ts].png</b> – edge-weighted network.</li>
            <li>Raw CellPhoneDB text outputs (<code>means.txt</code>, <code>pvalues.txt</code>, <code>significant_means.txt</code>).</li>
        </ul>

        <h4>Required Inputs</h4>
        <ul>
            <li><b>Input File</b>: Annotated <code>.h5ad</code> (from Annotation tab).</li>
            <li><b>Label Column</b>: Cell-type label column (default <code>cell_type</code>).</li>
            <li><b>CPDB File</b>: CellPhoneDB database ZIP (default <code>db/cellphonedb.zip</code>).</li>
            <li><b>Output Dir</b>: Folder for results.</li>
            <li><b>Analysis Name</b>: Optional prefix for outputs.</li>
            <li><b>Counts Min</b>: Minimum significant pairs to draw an edge (default 10).</li>
            <li><b>Plot&nbsp;Detailed&nbsp;Interactions</b>:
                <ul>
                  <li><code>All</code> (default) – plot every cell type</li>
                  <li>comma-separated labels – plot only those</li>
                  <li>leave blank – skip detailed dot-plots</li>
                </ul>
            </li>
        </ul>
        """
        cell_box_layout.addWidget(InfoSidebar("", cpdb_info))

        cell_interaction_box.setLayout(cell_box_layout)  # final setLayout
        main_layout.addWidget(cell_interaction_box)

        # --------------------------------------------------
        #  Tumor Prediction & Drug Response  🔬💊
        # --------------------------------------------------
        tumor_box = QGroupBox("Tumor Prediction and Drug Response")
        self.apply_shadow(tumor_box)

        t_layout = QFormLayout(tumor_box)

        # Input file
        self.tumor_input_edit = QLineEdit()
        self.tumor_input_edit.setPlaceholderText("Path to .h5ad file")
        t_in_btn = QPushButton("Browse")
        t_in_btn.clicked.connect(lambda: self.select_file_for_widget(self.tumor_input_edit))
        hl_t1 = QHBoxLayout()
        hl_t1.addWidget(self.tumor_input_edit)
        hl_t1.addWidget(t_in_btn)
        t_layout.addRow("Input File:", hl_t1)

        # Output dir
        self.tumor_output_dir = QLineEdit()
        self.tumor_output_dir.setPlaceholderText("Path to output directory")
        t_out_btn = QPushButton("Browse")
        t_out_btn.clicked.connect(lambda: self.select_dir_for_widget(self.tumor_output_dir))
        hl_t2 = QHBoxLayout()
        hl_t2.addWidget(self.tumor_output_dir)
        hl_t2.addWidget(t_out_btn)
        t_layout.addRow("Output Dir:", hl_t2)

        # Analysis name
        self.tumor_name_edit = QLineEdit()
        self.tumor_name_edit.setPlaceholderText("Name prefix (e.g. 'sampleA')")
        t_layout.addRow("Analysis Name:", self.tumor_name_edit)

        # reference_key
        self.reference_key_edit = QLineEdit()
        self.reference_key_edit.setPlaceholderText("Reference key in adata.obs")
        t_layout.addRow("Reference Key (optional):", self.reference_key_edit)

        # reference_cat
        self.reference_cat_edit = QLineEdit()
        self.reference_cat_edit.setPlaceholderText("Comma-separated list (e.g. B,T,NK)")
        t_layout.addRow("Reference Categories (optional):", self.reference_cat_edit)

        # gtf_path
        self.gtf_path_edit = QLineEdit()
        self.gtf_path_edit.setText("db/gencode.v47.annotation.gtf.gz")
        self.gtf_path_edit.setPlaceholderText("Path to GENCODE annotation .gtf.gz")
        gtf_btn = QPushButton("Browse")
        gtf_btn.clicked.connect(lambda: self.select_file_for_widget(self.gtf_path_edit))
        hl_gtf = QHBoxLayout()
        hl_gtf.addWidget(self.gtf_path_edit)
        hl_gtf.addWidget(gtf_btn)
        t_layout.addRow("GTF Path:", hl_gtf)

        # cnv_threshold
        self.cnv_threshold_spin = QDoubleSpinBox()
        self.cnv_threshold_spin.setRange(0.0, 1.0)
        self.cnv_threshold_spin.setSingleStep(0.01)
        self.cnv_threshold_spin.setValue(0.03)
        t_layout.addRow("CNV Threshold:", self.cnv_threshold_spin)

        # cores
        self.cores_spin = QSpinBox()
        self.cores_spin.setRange(1, 64)
        self.cores_spin.setValue(4)
        t_layout.addRow("CPU Cores:", self.cores_spin)

        # Run button
        self.tumor_run_btn = QPushButton("Run Tumor Prediction →")
        self.tumor_run_btn.setStyleSheet("""
            QPushButton { background:#7289DA; color:#fff; padding:8px 14px; font-weight:bold; border-radius:6px; }
            QPushButton:hover { background:#8697E2; }
            QPushButton:disabled { background:#4D5A84; color:#AAA; }
        """)
        self.tumor_run_btn.clicked.connect(self.run_tumor_analysis)
        t_layout.addRow(self.tumor_run_btn)

        # Progress bar
        hl_tprog = QHBoxLayout()
        self.tumor_progress_label = QLabel("Tumor Analysis Progress:")
        self.tumor_progress_bar  = QProgressBar()
        self.tumor_progress_bar.setValue(0)
        hl_tprog.addWidget(self.tumor_progress_label)
        hl_tprog.addWidget(self.tumor_progress_bar, 1)
        t_layout.addRow(hl_tprog)

        # Helpful sidebar
        tumor_info = """
        <h3>Tumor Prediction &amp; Drug Response</h3>
        <p>This module detects malignant cells from single-cell RNA-seq data using copy-number variation (<b>inferCNV</b>) and predicts putative drug responses with the CaDRReS-Sc model.</p>

        <h4>Analysis Process</h4>
        <ol>
            <li>Load annotated data (<code>.h5ad</code>) and annotate genes with genomic coordinates (GTF).</li>
            <li>Run <code>infercnvpy</code> (window = 250 genes) to infer CNV profiles per cell.</li>
            <li>Compute a CNV score; classify cells as <em>tumor</em> vs <em>normal</em> using the chosen threshold.</li>
            <li>Subset to tumor cells, perform QC, HVG selection, PCA, neighbours and UMAP.</li>
            <li>Determine optimal clustering resolution (<code>ov.single.autoResolution</code>).</li>
            <li>Download GDSC data + CaDRReS-Sc model (cached after first run).</li>
            <li>Predict drug sensitivity scores for each tumor cell / cluster (<code>ov.single.Drug_Response</code>).</li>
        </ol>

        <h4>Output Files</h4>
        <ul>
            <li><b>[name]_cnv_umap_[ts].png</b> – UMAP coloured by continuous CNV score.</li>
            <li><b>[name]_cnv_umap_status_[ts].png</b> – UMAP coloured by tumor / normal labels.</li>
            <li><b>drug_response_*.csv / *.png</b> – sensitivity tables &amp; heat-maps from CaDRReS-Sc.</li>
            <li><b>filtered_tumor_[name]_[ts].h5ad</b> – AnnData object containing only tumor cells with CNV &amp; drug-response metadata.</li>
            <li>Any intermediate inferCNV objects (HDF5) are saved inside the output directory for reproducibility.</li>
        </ul>

        <h4>Required Inputs</h4>
        <ul>
            <li><b>Input File</b>: Annotated <code>.h5ad</code> file.</li>
            <li><b>GTF Path</b>: GENCODE gene-annotation GTF (default <code>db/gencode.v47.annotation.gtf.gz</code>).</li>
            <li><b>Reference Key</b>: Column defining normal reference cells (default <code>cell_type</code>). Leave blank to use average expression of all cells as reference baseline.</li>
            <li><b>Reference Categories</b>: Comma-separated labels considered normal (e.g. <code>B,T,NK</code>). If there are specific cell normal cell types in the refereence key column to use as a baseline, list them here or else leave blank (ex: if you have labels like "normal" or "control").</li>
            <li><b>CNV Threshold</b>: Score above which cells are labelled tumor (default 0.03).</li>
            <li><b>CPU Cores</b>: Number of parallel workers (default 4).</li>
            <li><b>Output Dir</b>: Folder for all outputs.</li>
        </ul>
        """
        t_layout.addRow(InfoSidebar("", tumor_info))

        main_layout.addWidget(tumor_box)

    ############################################################################
    # 6) Helpers to select file/directory for analysis tab
    ############################################################################
    def select_file_for_widget(self, line_edit):
        dialog = QFileDialog(self)
        dialog.setFileMode(QFileDialog.ExistingFile)
        if dialog.exec_():
            line_edit.setText(dialog.selectedFiles()[0])

    def select_dir_for_widget(self, line_edit):
        dialog = QFileDialog(self)
        dialog.setFileMode(QFileDialog.Directory)
        if dialog.exec_():
            line_edit.setText(dialog.selectedFiles()[0])

    ############################################################################
    # 7) Method to run the actual analysis in a separate thread
    ############################################################################
    def run_cellphonedb_analysis(self):
        input_file = self.cpdb_input_edit.text().strip()
        out_dir = self.cpdb_output_dir.text().strip()
        col_name = self.cpdb_column_edit.text().strip()
        cpdb_zip = self.cpdb_file_edit.text().strip()
        name_str = self.cpdb_name_edit.text().strip() or "analysis"
        counts_min = self.cpdb_counts_min_spin.value()
        plot_cells_str = self.cpdb_plot_cells_edit.text().strip()
        plot_cells = [x.strip() for x in plot_cells_str.split(",") if x.strip()]

        if not input_file or not out_dir or not col_name or not cpdb_zip:
            QMessageBox.warning(self, "Invalid Input", "Please fill in all required fields.")
            return
            
        self.cpdb_run_btn.setEnabled(False)

        self.analysis_thread = AnalysisRunner(
            input_file=input_file,
            output_dir=out_dir,
            column_name=col_name,
            cpdb_file_path=cpdb_zip,
            name=name_str,
            counts_min=counts_min,
            plot_column_names=plot_cells,
        )
        # Connect our new progress bar
        self.analysis_thread.update_progress.connect(self.on_analysis_progress)
        self.analysis_thread.finished.connect(self.on_analysis_finished)
        self.analysis_thread.error.connect(self.on_analysis_error)
        self.analysis_thread.start()

    def on_analysis_progress(self, percent, message):
        # Now direct to our new analysis bar/label
        self.analysis_progress_bar.setValue(percent)
        if message:
            self.analysis_progress_label.setText(f"Analysis Progress: {message}")

    def on_analysis_finished(self, msg):
        self.cpdb_run_btn.setEnabled(True)
        # Freed up the thread
        self.analysis_progress_bar.setValue(100)
        self.append_to_log(f"{msg}\n")
        QMessageBox.information(self, "Done", msg)

        # 3) Preview images in the analysis output folder when finished
        from glob import glob
        import os
        out_dir = self.cpdb_output_dir.text().strip()  # The directory user selected
        # preview only files that start with the analysis prefix
        prefix    = self.analysis_thread.name            # the name we passed earlier
        png_paths = glob(os.path.join(out_dir, f"{prefix}_*.png"))
        if png_paths:
            self.show_png_slideshow(png_paths)

    def on_analysis_error(self, error_message):
        self.cpdb_run_btn.setEnabled(True)
        traceback.print_exc()  # Also send to the log
        QMessageBox.critical(self, "Error", f"CellPhoneDB analysis failed: {error_message}")

    def append_to_log(self, text):
        """
        Slot that receives text from EmittingStream and appends it to log_text_edit.
        """
        # Move cursor to end and insert text
        self.log_text_edit.moveCursor(QTextCursor.End)
        self.log_text_edit.insertPlainText(text + "\n")
        self.log_text_edit.moveCursor(QTextCursor.End)

    # ------------------------------------------------------------------
    #  Tumor-prediction (inferCNV) thread helpers
    # ------------------------------------------------------------------
    def run_tumor_analysis(self):
        input_file  = self.tumor_input_edit.text().strip()
        output_dir  = self.tumor_output_dir.text().strip()
        name        = self.tumor_name_edit.text().strip() or "tumor"
        ref_key     = self.reference_key_edit.text().strip()   # empty → None handled downstream
        ref_cat_str = self.reference_cat_edit.text().strip()
        ref_cat     = [x.strip() for x in ref_cat_str.split(",") if x.strip()]
        gtf_path    = self.gtf_path_edit.text().strip() or "db/gencode.v47.annotation.gtf.gz"
        cnv_thr     = self.cnv_threshold_spin.value()
        cores       = self.cores_spin.value()

        if not input_file or not output_dir:
            QMessageBox.warning(self, "Invalid Input", "Input file and output directory are required.")
            return

        self.tumor_run_btn.setEnabled(False)

        self.tumor_thread = InfernCNVRunner(
            input_file=input_file,
            output_dir=output_dir,
            name=name,
            reference_key=ref_key,
            reference_cat=ref_cat,
            gtf_path=gtf_path,
            cnv_threshold=cnv_thr,
            cores=cores,
        )
        self.tumor_thread.update_progress.connect(self.on_tumor_progress)
        self.tumor_thread.finished.connect(self.on_tumor_finished)
        self.tumor_thread.error.connect(self.on_tumor_error)
        self.tumor_thread.start()

    def on_tumor_progress(self, pct, msg):
        self.tumor_progress_bar.setValue(pct)
        if msg:
            self.tumor_progress_label.setText(f"Tumor Analysis Progress: {msg}")

    def on_tumor_finished(self, message):
        self.tumor_run_btn.setEnabled(True)
        self.tumor_progress_bar.setValue(100)
        self.append_to_log(message + "\n")
        QMessageBox.information(self, "Done", message)

        # preview PNGs
        from glob import glob
        import os
        prefix = self.tumor_thread.kwargs["name"]
        pngs   = glob(os.path.join(self.tumor_output_dir.text().strip(),
                                   f"{prefix}_*.png"))
        if pngs:
            self.show_png_slideshow(pngs)

    def on_tumor_error(self, err):
        self.tumor_run_btn.setEnabled(True)
        QMessageBox.critical(self, "Error", f"InferCNV analysis failed: {err}")

    ############################################################################
    # 8) About / Info tab (logo + editable blurb)
    ############################################################################
    def setup_about_tab(self, parent_widget):
        """
        Simple tab that shows the Brown-University logo (or a placeholder)
        and a QTextEdit where you can type / paste the project description,
        lab info, GitHub link, citation, etc.
        """
        layout = QVBoxLayout(parent_widget)

        # ── Read-only project description ───────────────────────────────────
        about_lbl = QLabel()
        about_lbl.setAlignment(Qt.AlignTop)
        about_lbl.setWordWrap(True)
        about_lbl.setOpenExternalLinks(True)      # enable clickable URL
        about_lbl.setTextFormat(Qt.RichText)
        about_lbl.setText("""
        <h2>CellPilot</h2>
        <p><b>CellPilot</b> is an open-source, end-to-end workflow featuring a user-friendly
        graphical interface for comprehensive single-cell RNA-seq analysis. It streamlines
        essential steps such as quality control, preprocessing, dimensionality reduction
        (PCA and UMAP), Leiden clustering, and cell-type annotation using reference databases
        like CellMarker and PanglaoDB. Designed for performance and accessibility, CellPilot
        allows researchers to transition efficiently from raw data to high-quality
        visualizations with minimal manual input.</p>

        <p>In addition to these core steps, CellPilot performs cell–cell communication
        profiling powered by <b>CellPhoneDB</b>, revealing signalling networks between cell
        populations. The platform also supports tumor prediction and drug-response analysis:
        leveraging <b>scDrug</b>, it predicts drug sensitivity from single-cell expression
        (IC50) to highlight potential therapies, while <b>inferCNV</b> infers copy-number
        variation and tumour behaviour—together forming a robust downstream drug-screening
        and therapeutic-discovery toolkit.</p>
                          
        <p>This work is developed and maintained by the <b>Uzun Lab</b>, <b>Brown University</b>.</p>

        <p>GitHub repository: <a href="https://github.com/alperuzun/CellPilot">github.com/alperuzun/CellPilot</a></p>
        """)
        layout.addWidget(about_lbl)

        # Fill remaining space nicely
        layout.addStretch()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = SingleTabGUI()
    window.show()
    sys.exit(app.exec_())