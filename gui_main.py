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
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QPalette, QColor, QFont, QPixmap, QTextCursor

import os

from pipeline_runner import AnnotationRunner, AnalysisRunner

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
# 2) Add a QTabWidget in the main GUI, with "Annotation" and new "Analysis" tabs
################################################################################
class SingleTabGUI(QMainWindow):
    """
    """

    def __init__(self):
        super().__init__()
        self.setWindowTitle("CellPilot 🚀")
        self.setGeometry(150, 100, 960, 600)

        # Apply a custom Discord-like dark theme
        self.setPalette(self.create_discord_palette())

        # Instead of a main_widget alone, let's create a QTabWidget
        self.tabs = QTabWidget()
        self.setCentralWidget(self.tabs)

        self.annotation_tab = QWidget()
        self.analysis_tab = QWidget()

        # Original annotation setup
        self.setup_annotation_tab(self.annotation_tab)
        self.tabs.addTab(self.annotation_tab, "Annotation")

        # New analysis setup
        self.setup_analysis_tab(self.analysis_tab)
        self.tabs.addTab(self.analysis_tab, "Analysis")

        # Also add a log area at the bottom (or side)
        self.log_text_edit = QTextEdit()
        self.log_text_edit.setReadOnly(True)
        self.log_text_edit.setStyleSheet("background-color: #2F3136; color: #DCDDDE;")
        # We'll place it under the tabs in a central widget layout

        main_widget = QWidget()
        main_layout = QVBoxLayout(main_widget)
        main_layout.addWidget(self.tabs)
        main_layout.addWidget(self.log_text_edit)

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
        file_form = QFormLayout()

        # Input file path
        self.input_file_edit = QLineEdit()
        self.input_file_edit.setPlaceholderText("Path to input file (H5AD, H5, CSV, TXT, or MTX)...")
        file_button = QPushButton("Browse…")
        file_button.clicked.connect(self.select_input_file)

        file_hlayout = QHBoxLayout()
        file_hlayout.addWidget(self.input_file_edit)
        file_hlayout.addWidget(file_button)
        file_form.addRow("Input File:", file_hlayout)
        
        # Output directory
        self.output_dir_edit = QLineEdit()
        self.output_dir_edit.setPlaceholderText("Path to output directory...")
        out_button = QPushButton("Browse…")
        out_button.clicked.connect(self.select_output_dir)

        out_hlayout = QHBoxLayout()
        out_hlayout.addWidget(self.output_dir_edit)
        out_hlayout.addWidget(out_button)
        file_form.addRow("Output Dir:", out_hlayout)

        # New "Annotation Name" field
        self.annotation_name_edit = QLineEdit()
        self.annotation_name_edit.setPlaceholderText("Name for annotation run (e.g. 'sampleA')")
        file_form.addRow("Annotation Name:", self.annotation_name_edit)

        file_group.setLayout(file_form)
        layout.addWidget(file_group)

        # =========================
        # (2) Preprocessed Checkbox
        # =========================
        self.preprocessed_checkbox = QCheckBox("File is already preprocessed")
        self.preprocessed_checkbox.setChecked(False)
        self.preprocessed_checkbox.stateChanged.connect(self.toggle_preprocessing_params)
        layout.addWidget(self.preprocessed_checkbox)

        # =========================
        # (3) 💾 Preprocessing Parameters
        # =========================
        self.preprocess_group = QGroupBox("💾 Preprocessing Parameters")
        self.apply_shadow(self.preprocess_group)
        self.preprocess_layout = QGridLayout()

        self.preprocess_layout.addWidget(QLabel("Mito Threshold:"), 0, 0)
        self.mito_threshold_spin = QDoubleSpinBox()
        self.mito_threshold_spin.setRange(0, 1)
        self.mito_threshold_spin.setValue(0.05)
        self.preprocess_layout.addWidget(self.mito_threshold_spin, 0, 1)

        self.preprocess_layout.addWidget(QLabel("Min Genes:"), 0, 2)
        self.min_genes_spin = QSpinBox()
        self.min_genes_spin.setRange(0, 50000)
        self.min_genes_spin.setValue(250)
        self.preprocess_layout.addWidget(self.min_genes_spin, 0, 3)

        self.preprocess_layout.addWidget(QLabel("Min Counts:"), 1, 0)
        self.min_counts_spin = QSpinBox()
        self.min_counts_spin.setRange(0, 100000)
        self.min_counts_spin.setValue(500)
        self.preprocess_layout.addWidget(self.min_counts_spin, 1, 1)

        self.preprocess_layout.addWidget(QLabel("Number of HVGs:"), 1, 2)
        self.n_hvgs_spin = QSpinBox()
        self.n_hvgs_spin.setRange(500, 10000)
        self.n_hvgs_spin.setValue(2000)
        self.preprocess_layout.addWidget(self.n_hvgs_spin, 1, 3)

        self.preprocess_layout.addWidget(QLabel("Number of PCs:"), 2, 0)
        self.n_pcs_spin = QSpinBox()
        self.n_pcs_spin.setRange(10, 300)
        self.n_pcs_spin.setValue(50)
        self.preprocess_layout.addWidget(self.n_pcs_spin, 2, 1)

        self.preprocess_layout.addWidget(QLabel("Number of Neighbors:"), 2, 2)
        self.neighbors_spin = QSpinBox()
        self.neighbors_spin.setRange(1, 200)
        self.neighbors_spin.setValue(15)
        self.preprocess_layout.addWidget(self.neighbors_spin, 2, 3)

        self.preprocess_layout.addWidget(QLabel("Leiden Resolution:"), 3, 0)
        self.resolution_dspin = QDoubleSpinBox()
        self.resolution_dspin.setRange(0.1, 5.0)
        self.resolution_dspin.setValue(0.8)
        self.resolution_dspin.setSingleStep(0.1)
        self.preprocess_layout.addWidget(self.resolution_dspin, 3, 1)

        self.preprocess_group.setLayout(self.preprocess_layout)
        layout.addWidget(self.preprocess_group)
        self.toggle_preprocessing_params()  # Hide if "already preprocessed" is checked

        # =========================
        # (4) 🚀 Annotation Parameters
        # =========================
        anno_group = QGroupBox("🚀 Annotation Parameters")
        self.apply_shadow(anno_group)
        anno_layout = QFormLayout()

        self.species_combo = QComboBox()
        self.species_combo.addItems(["human", "mouse"])
        anno_layout.addRow("Species:", self.species_combo)

        self.cellmarker_checkbox = QCheckBox("Use CellMarker (OmicVerse)")
        self.cellmarker_checkbox.setChecked(True)
        anno_layout.addRow(self.cellmarker_checkbox)

        self.panglao_checkbox = QCheckBox("Use Panglao DB")
        self.panglao_checkbox.setChecked(False)
        anno_layout.addRow(self.panglao_checkbox)

        self.cancer_sca_checkbox = QCheckBox("Use Cancer Single Cell Atlas")
        self.cancer_sca_checkbox.setChecked(False)
        anno_layout.addRow(self.cancer_sca_checkbox)

        self.confidence_spin = QDoubleSpinBox()
        self.confidence_spin.setRange(0.0, 1.0)
        self.confidence_spin.setValue(0.5)
        self.confidence_spin.setSingleStep(0.05)
        anno_layout.addRow("Confidence Threshold:", self.confidence_spin)

        anno_group.setLayout(anno_layout)
        layout.addWidget(anno_group)

        # =========================
        # (5) Run Button
        # =========================
        self.run_button = QPushButton("Run Annotation")
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
        png_paths = glob(os.path.join(out_dir, "*.png"))
        if not png_paths:
            return  # no images, just skip

        # Create a dialog listing images
        self.show_png_dialog(png_paths)

    def show_png_dialog(self, png_paths):
        """
        Displays the .png images in a simple QDialog with a QVBoxLayout/QScrollArea.
        """
        dialog = QDialog(self)
        dialog.setWindowTitle("Annotation Output - PNG Previews")
        dialog.resize(800, 600)

        scroll = QScrollArea(dialog)
        container = QWidget()
        vlayout = QVBoxLayout(container)

        # Store original pixmaps, plus one QLabel per image
        self.zoom_factor = 1.0
        self.preview_labels = []
        self.original_pixmaps = []

        for path in png_paths:
            label = QLabel()
            pix = QPixmap(path)
            self.original_pixmaps.append(pix)
            self.preview_labels.append(label)
            # Initially set the pixmap (zoom_factor = 1.0)
            scaled_pix = pix.scaled(
                pix.width() * self.zoom_factor,
                pix.height() * self.zoom_factor,
                Qt.KeepAspectRatio,
                Qt.SmoothTransformation
            )
            label.setPixmap(scaled_pix)

            vlayout.addWidget(label)

        scroll.setWidget(container)
        dialog_layout = QVBoxLayout()
        dialog_layout.addWidget(scroll)

        # -- Add Zoom In / Zoom Out buttons at the bottom --
        zoom_button_layout = QHBoxLayout()
        zoom_in_btn = QPushButton("Zoom In")
        zoom_out_btn = QPushButton("Zoom Out")
        zoom_button_layout.addWidget(zoom_in_btn)
        zoom_button_layout.addWidget(zoom_out_btn)
        # Connect clicks
        zoom_in_btn.clicked.connect(lambda: self.change_zoom(0.1))
        zoom_out_btn.clicked.connect(lambda: self.change_zoom(-0.1))
        dialog_layout.addLayout(zoom_button_layout)

        dialog.setLayout(dialog_layout)

        dialog.exec_()

    def change_zoom(self, delta):
        """
        Increase or decrease self.zoom_factor by 'delta',
        then rescale all preview labels accordingly.
        """
        # Avoid going below 0.1x or above, say, 5x
        new_zoom = self.zoom_factor + delta
        new_zoom = max(0.1, min(new_zoom, 5.0))

        self.zoom_factor = new_zoom
        # Rescale each label's pixmap
        for pix, label in zip(self.original_pixmaps, self.preview_labels):
            scaled_pix = pix.scaled(
                pix.width() * self.zoom_factor,
                pix.height() * self.zoom_factor,
                Qt.KeepAspectRatio,
                Qt.SmoothTransformation
            )
            label.setPixmap(scaled_pix)

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

        cell_interaction_box = QGroupBox("Cell Interaction")
        self.apply_shadow(cell_interaction_box)
        layout = QFormLayout()
        cell_interaction_box.setLayout(layout)

        # Then add cell_interaction_box to parent_widget
        main_layout.addWidget(cell_interaction_box)
        parent_widget.setLayout(main_layout)

        # Input file
        self.cpdb_input_edit = QLineEdit()
        self.cpdb_input_edit.setPlaceholderText("Path to annotated .h5ad file")
        input_btn = QPushButton("Browse")
        input_btn.clicked.connect(lambda: self.select_file_for_widget(self.cpdb_input_edit))
        hl_1 = QHBoxLayout()
        hl_1.addWidget(self.cpdb_input_edit)
        hl_1.addWidget(input_btn)
        layout.addRow("Input File:", hl_1)

        # Output directory
        self.cpdb_output_dir = QLineEdit()
        self.cpdb_output_dir.setPlaceholderText("Path to analysis output directory")
        out_btn = QPushButton("Browse")
        out_btn.clicked.connect(lambda: self.select_dir_for_widget(self.cpdb_output_dir))
        hl_2 = QHBoxLayout()
        hl_2.addWidget(self.cpdb_output_dir)
        hl_2.addWidget(out_btn)
        layout.addRow("Output Dir:", hl_2)

        # Column name in adata.obs for cell types
        self.cpdb_column_edit = QLineEdit()
        self.cpdb_column_edit.setPlaceholderText("Cell Label in adata.obs (e.g. 'cellmarker')")
        layout.addRow("Label Column Name:", self.cpdb_column_edit)

        # CPDB file path
        self.cpdb_file_edit = QLineEdit()
        self.cpdb_file_edit.setPlaceholderText("Path to CellPhoneDB db zip (e.g. data/cellphonedb.zip)")
        cpdb_btn = QPushButton("Browse")
        cpdb_btn.clicked.connect(lambda: self.select_file_for_widget(self.cpdb_file_edit))
        hl_3 = QHBoxLayout()
        hl_3.addWidget(self.cpdb_file_edit)
        hl_3.addWidget(cpdb_btn)
        layout.addRow("CPDB File:", hl_3)

        # Analysis name
        self.cpdb_name_edit = QLineEdit()
        self.cpdb_name_edit.setPlaceholderText("Name prefix for output (e.g. 'lung')")
        layout.addRow("Analysis Name:", self.cpdb_name_edit)
        
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

        main_layout.addWidget(cell_interaction_box)
        parent_widget.setLayout(main_layout)

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

        if not input_file or not out_dir or not col_name or not cpdb_zip:
            QMessageBox.warning(self, "Invalid Input", "Please fill in all required fields.")
            return
            
        self.cpdb_run_btn.setEnabled(False)

        self.analysis_thread = AnalysisRunner(
            input_file=input_file,
            output_dir=out_dir,
            column_name=col_name,
            cpdb_file_path=cpdb_zip,
            name=name_str
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
        png_paths = glob(os.path.join(out_dir, "*.png"))
        if png_paths:
            self.show_png_dialog(png_paths)

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

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = SingleTabGUI()
    window.show()
    sys.exit(app.exec_())