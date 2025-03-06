import sys
print("Python path:", sys.executable)
print("Python version:", sys.version)
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                            QHBoxLayout, QPushButton, QLabel, QFileDialog, 
                            QProgressBar, QSpinBox, QDoubleSpinBox, QLineEdit,
                            QTabWidget, QGroupBox, QRadioButton, QMessageBox, QComboBox, QCheckBox, QButtonGroup)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
import sys
import os
from pipeline_runner import PipelineRunner, PreprocessingRunner, ClusteringRunner

class PipelineGUI(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Single Cell RNA-seq Pipeline")
        self.setMinimumWidth(1000)
        self.setMinimumHeight(800)
        
        # Create main widget and layout
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        layout = QVBoxLayout(main_widget)
        
        # Create tab widget
        tabs = QTabWidget()
        
        # Add tabs
        tabs.addTab(self.create_cellranger_tab(), "1. Cell Ranger")
        tabs.addTab(self.create_preprocessing_tab(), "2. Preprocessing")
        tabs.addTab(self.create_clustering_tab(), "3. Clustering")
        tabs.addTab(self.create_analysis_tab(), "4. Analysis")
        
        layout.addWidget(tabs)
        
        # Add global progress bar and status
        self.progress = QProgressBar()
        layout.addWidget(self.progress)
        
        self.status_label = QLabel("")
        layout.addWidget(self.status_label)
    
    def create_cellranger_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)
        
        # Input section
        input_group = QGroupBox("Input Files")
        input_layout = QVBoxLayout(input_group)
        
        # FASTQ files
        fastq_layout = QHBoxLayout()
        self.fastq_label = QLabel("No FASTQ files selected")
        fastq_btn = QPushButton("Select FASTQ Files")
        fastq_btn.clicked.connect(self.select_fastq_files)
        fastq_layout.addWidget(fastq_btn)
        fastq_layout.addWidget(self.fastq_label)
        input_layout.addLayout(fastq_layout)
        
        # Reference genome
        ref_layout = QHBoxLayout()
        self.ref_label = QLabel("No reference genome selected")
        ref_btn = QPushButton("Select Reference")
        ref_btn.clicked.connect(self.select_reference)
        ref_layout.addWidget(ref_btn)
        ref_layout.addWidget(self.ref_label)
        input_layout.addLayout(ref_layout)
        
        layout.addWidget(input_group)
        
        # Add sample information
        sample_group = QGroupBox("Sample Information")
        sample_layout = QVBoxLayout(sample_group)
        
        # Sample ID
        id_layout = QHBoxLayout()
        id_layout.addWidget(QLabel("Sample ID:"))
        self.sample_id_input = QLineEdit()
        self.sample_id_input.setText("run_sample1")  # Default value
        id_layout.addWidget(self.sample_id_input)
        sample_layout.addLayout(id_layout)
        
        # Sample Name
        name_layout = QHBoxLayout()
        name_layout.addWidget(QLabel("Sample Name:"))
        self.sample_name_input = QLineEdit()
        name_layout.addWidget(self.sample_name_input)
        sample_layout.addLayout(name_layout)
        
        layout.addWidget(sample_group)
        
        # Cell Ranger parameters
        param_group = QGroupBox("Cell Ranger Parameters")
        param_layout = QVBoxLayout(param_group)
        
        # Cores
        cores_layout = QHBoxLayout()
        cores_layout.addWidget(QLabel("Number of Cores:"))
        self.cores_spin = QSpinBox()
        self.cores_spin.setRange(1, 32)
        self.cores_spin.setValue(8)
        cores_layout.addWidget(self.cores_spin)
        param_layout.addLayout(cores_layout)
        
        # Memory
        mem_layout = QHBoxLayout()
        mem_layout.addWidget(QLabel("Memory (GB):"))
        self.mem_spin = QSpinBox()
        self.mem_spin.setRange(16, 256)
        self.mem_spin.setValue(64)
        mem_layout.addWidget(self.mem_spin)
        param_layout.addLayout(mem_layout)
        
        layout.addWidget(param_group)
        
        # Output directory
        out_group = QGroupBox("Output")
        out_layout = QVBoxLayout(out_group)
        
        out_dir_layout = QHBoxLayout()
        self.cr_output_label = QLabel("No output directory selected")
        out_btn = QPushButton("Select Output Directory")
        out_btn.clicked.connect(lambda: self.select_output_dir('cellranger'))
        out_dir_layout.addWidget(out_btn)
        out_dir_layout.addWidget(self.cr_output_label)
        out_layout.addLayout(out_dir_layout)
        
        layout.addWidget(out_group)
        
        # Run button
        self.cr_run_btn = QPushButton("Run Cell Ranger")
        self.cr_run_btn.clicked.connect(self.run_cellranger)
        layout.addWidget(self.cr_run_btn)
        
        return tab
    
    def create_preprocessing_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)
        
        # Input section
        input_group = QGroupBox("Input")
        input_layout = QVBoxLayout(input_group)
        
        # Option to use Cell Ranger output or custom input
        self.use_cr_output = QRadioButton("Use Cell Ranger Output")
        self.use_custom_input = QRadioButton("Use Custom Input")
        self.use_cr_output.setChecked(True)
        
        input_layout.addWidget(self.use_cr_output)
        input_layout.addWidget(self.use_custom_input)
        
        # Custom input selection
        custom_input_layout = QHBoxLayout()
        self.pp_input_label = QLabel("No input file selected")
        input_btn = QPushButton("Select Input File")
        input_btn.clicked.connect(self.select_preprocessing_input)
        custom_input_layout.addWidget(input_btn)
        custom_input_layout.addWidget(self.pp_input_label)
        input_layout.addLayout(custom_input_layout)
        
        layout.addWidget(input_group)
        
        # Parameters
        param_group = QGroupBox("Preprocessing Parameters")
        param_layout = QVBoxLayout(param_group)
        
        # MT threshold
        mt_layout = QHBoxLayout()
        mt_layout.addWidget(QLabel("MT Threshold (%):"))
        self.mt_threshold = QDoubleSpinBox()
        self.mt_threshold.setRange(0, 100)
        self.mt_threshold.setValue(20)
        mt_layout.addWidget(self.mt_threshold)
        param_layout.addLayout(mt_layout)
        
        # Ribo threshold
        ribo_layout = QHBoxLayout()
        ribo_layout.addWidget(QLabel("Ribo Threshold (%):"))
        self.ribo_threshold = QDoubleSpinBox()
        self.ribo_threshold.setRange(0, 100)
        self.ribo_threshold.setValue(40)
        ribo_layout.addWidget(self.ribo_threshold)
        param_layout.addLayout(ribo_layout)
        
        layout.addWidget(param_group)
        
        # Output
        out_group = QGroupBox("Output")
        out_layout = QVBoxLayout(out_group)
        
        out_dir_layout = QHBoxLayout()
        self.pp_output_label = QLabel("No output directory selected")
        out_btn = QPushButton("Select Output Directory")
        out_btn.clicked.connect(lambda: self.select_output_dir('preprocessing'))
        out_dir_layout.addWidget(out_btn)
        out_dir_layout.addWidget(self.pp_output_label)
        out_layout.addLayout(out_dir_layout)
        
        layout.addWidget(out_group)
        
        # Run button
        self.pp_run_btn = QPushButton("Run Preprocessing")
        self.pp_run_btn.clicked.connect(self.run_preprocessing)
        layout.addWidget(self.pp_run_btn)
        
        # Connect radio buttons to enable/disable custom input
        self.use_cr_output.toggled.connect(lambda checked: input_btn.setEnabled(not checked))
        self.use_custom_input.toggled.connect(lambda checked: input_btn.setEnabled(checked))
        
        # Initially disable input selection if using Cell Ranger output
        input_btn.setEnabled(False)
        
        return tab
    
    def create_clustering_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)
        
        # Input section
        input_group = QGroupBox("Input")
        input_layout = QVBoxLayout(input_group)
        
        # Option to use preprocessing output or custom input
        self.use_pp_output = QRadioButton("Use Preprocessing Output")
        self.use_custom_cluster_input = QRadioButton("Use Custom Input")
        self.use_pp_output.setChecked(True)
        
        input_layout.addWidget(self.use_pp_output)
        input_layout.addWidget(self.use_custom_cluster_input)
        
        # Custom input selection
        custom_input_layout = QHBoxLayout()
        self.cluster_input_label = QLabel("No input file selected")
        input_btn = QPushButton("Select Input File")
        input_btn.clicked.connect(self.select_clustering_input)
        custom_input_layout.addWidget(input_btn)
        custom_input_layout.addWidget(self.cluster_input_label)
        input_layout.addLayout(custom_input_layout)
        
        layout.addWidget(input_group)
        
        # Clustering parameters
        param_group = QGroupBox("Clustering Parameters")
        param_layout = QVBoxLayout(param_group)
        
        # Number of PCs
        pc_layout = QHBoxLayout()
        pc_layout.addWidget(QLabel("Number of PCs:"))
        self.n_pcs = QSpinBox()
        self.n_pcs.setRange(10, 100)
        self.n_pcs.setValue(30)
        pc_layout.addWidget(self.n_pcs)
        param_layout.addLayout(pc_layout)
        
        # Resolution
        res_layout = QHBoxLayout()
        res_layout.addWidget(QLabel("Resolution:"))
        self.resolution = QDoubleSpinBox()
        self.resolution.setRange(0.1, 2.0)
        self.resolution.setSingleStep(0.1)
        self.resolution.setValue(0.5)
        res_layout.addWidget(self.resolution)
        param_layout.addLayout(res_layout)
        
        # Number of top genes
        genes_layout = QHBoxLayout()
        genes_layout.addWidget(QLabel("Number of Top Genes:"))
        self.n_top_genes = QSpinBox()
        self.n_top_genes.setRange(500, 5000)
        self.n_top_genes.setSingleStep(100)
        self.n_top_genes.setValue(2000)
        genes_layout.addWidget(self.n_top_genes)
        param_layout.addLayout(genes_layout)
        
        layout.addWidget(param_group)
        
        # Output
        out_group = QGroupBox("Output")
        out_layout = QVBoxLayout(out_group)
        
        out_dir_layout = QHBoxLayout()
        self.cluster_output_label = QLabel("No output directory selected")
        out_btn = QPushButton("Select Output Directory")
        out_btn.clicked.connect(lambda: self.select_output_dir('clustering'))
        out_dir_layout.addWidget(out_btn)
        out_dir_layout.addWidget(self.cluster_output_label)
        out_layout.addLayout(out_dir_layout)
        
        layout.addWidget(out_group)
        
        # Run button
        self.cluster_run_btn = QPushButton("Run Clustering")
        self.cluster_run_btn.clicked.connect(self.run_clustering)
        layout.addWidget(self.cluster_run_btn)
        
        # Connect radio buttons
        self.use_pp_output.toggled.connect(lambda checked: input_btn.setEnabled(not checked))
        self.use_custom_cluster_input.toggled.connect(lambda checked: input_btn.setEnabled(checked))
        
        # Initially disable input selection
        input_btn.setEnabled(False)
        
        return tab
    
    def create_analysis_tab(self):
        tab = QWidget()
        layout = QVBoxLayout(tab)
        
        # Input section
        input_group = QGroupBox("Input")
        input_layout = QVBoxLayout(input_group)
        
        # Option to use clustering output or custom input
        self.use_cluster_output = QRadioButton("Use Clustering Output")
        self.use_custom_analysis_input = QRadioButton("Use Custom Input")
        self.use_cluster_output.setChecked(True)
        
        input_layout.addWidget(self.use_cluster_output)
        input_layout.addWidget(self.use_custom_analysis_input)
        
        # Custom input selection
        custom_input_layout = QHBoxLayout()
        self.analysis_input_label = QLabel("No input file selected")
        input_btn = QPushButton("Select Input File")
        input_btn.clicked.connect(self.select_analysis_input)
        custom_input_layout.addWidget(input_btn)
        custom_input_layout.addWidget(self.analysis_input_label)
        input_layout.addLayout(custom_input_layout)
        
        layout.addWidget(input_group)
        
        # Analysis Method
        method_group = QGroupBox("Analysis Method")
        method_layout = QVBoxLayout(method_group)
        
        # Create button group to make selections exclusive
        self.method_group = QButtonGroup()
        
        # Method selection
        self.celltypist_radio = QRadioButton("CellTypist")
        self.reference_radio = QRadioButton("Reference-based")
        self.marker_radio = QRadioButton("Marker-based")
        
        # Add buttons to group
        self.method_group.addButton(self.celltypist_radio)
        self.method_group.addButton(self.reference_radio)
        self.method_group.addButton(self.marker_radio)
        
        self.celltypist_radio.setChecked(True)
        
        method_layout.addWidget(self.celltypist_radio)
        method_layout.addWidget(self.reference_radio)
        method_layout.addWidget(self.marker_radio)
        
        # Connect radio buttons to show/hide relevant options
        self.method_group.buttonClicked.connect(self.method_changed)
        
        layout.addWidget(method_group)
        
        # Method-specific options
        self.method_options = QGroupBox("Method Options")
        self.method_options_layout = QVBoxLayout(self.method_options)
        
        # CellTypist options (default)
        self.create_celltypist_options()
        
        layout.addWidget(self.method_options)
        
        # Output
        out_group = QGroupBox("Output")
        out_layout = QVBoxLayout(out_group)
        
        out_dir_layout = QHBoxLayout()
        self.analysis_output_label = QLabel("No output directory selected")
        out_btn = QPushButton("Select Output Directory")
        out_btn.clicked.connect(lambda: self.select_output_dir('analysis'))
        out_dir_layout.addWidget(out_btn)
        out_dir_layout.addWidget(self.analysis_output_label)
        out_layout.addLayout(out_dir_layout)
        
        layout.addWidget(out_group)
        
        # Run button
        self.analysis_run_btn = QPushButton("Run Analysis")
        self.analysis_run_btn.clicked.connect(self.run_analysis)
        layout.addWidget(self.analysis_run_btn)
        
        # Connect radio buttons
        self.use_cluster_output.toggled.connect(lambda checked: input_btn.setEnabled(not checked))
        self.use_custom_analysis_input.toggled.connect(lambda checked: input_btn.setEnabled(checked))
        
        # Initially disable input selection
        input_btn.setEnabled(False)
        
        return tab
    
    def create_celltypist_options(self):
        """Create CellTypist-specific options"""
        # Clear existing options
        self.clear_method_options()
        
        # Model selection
        model_layout = QHBoxLayout()
        model_layout.addWidget(QLabel("Model:"))
        self.model_combo = QComboBox()
        self.model_combo.addItems(['Immune_All_High.pkl', 'Human_Lung_Atlas.pkl'])
        model_layout.addWidget(self.model_combo)
        self.method_options_layout.addLayout(model_layout)
        
        # Confidence threshold
        conf_layout = QHBoxLayout()
        conf_layout.addWidget(QLabel("Confidence Threshold:"))
        self.confidence_threshold = QDoubleSpinBox()
        self.confidence_threshold.setRange(0, 1)
        self.confidence_threshold.setSingleStep(0.1)
        self.confidence_threshold.setValue(0.5)
        conf_layout.addWidget(self.confidence_threshold)
        self.method_options_layout.addLayout(conf_layout)
    
    def create_reference_options(self):
        """Create reference-based options"""
        self.clear_method_options()
        
        # Reference file selection
        ref_layout = QHBoxLayout()
        self.ref_file_label = QLabel("No reference file selected")
        ref_btn = QPushButton("Select Reference File")
        ref_btn.clicked.connect(self.select_reference_file)
        ref_layout.addWidget(ref_btn)
        ref_layout.addWidget(self.ref_file_label)
        self.method_options_layout.addLayout(ref_layout)
        
        # Batch correction option
        batch_layout = QHBoxLayout()
        self.batch_correction = QCheckBox("Use batch correction")
        self.batch_correction.setChecked(True)
        batch_layout.addWidget(self.batch_correction)
        self.method_options_layout.addLayout(batch_layout)
    
    def create_marker_options(self):
        """Create marker-based options"""
        self.clear_method_options()
        
        # Marker file selection
        marker_layout = QHBoxLayout()
        self.marker_file_label = QLabel("No marker file selected")
        marker_btn = QPushButton("Select Marker File")
        marker_btn.clicked.connect(self.select_marker_file)
        marker_layout.addWidget(marker_btn)
        marker_layout.addWidget(self.marker_file_label)
        self.method_options_layout.addLayout(marker_layout)
    
    def clear_method_options(self):
        """Clear all widgets from method options layout"""
        while self.method_options_layout.count():
            child = self.method_options_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()
            elif child.layout():
                # Clear nested layouts
                while child.layout().count():
                    subchild = child.layout().takeAt(0)
                    if subchild.widget():
                        subchild.widget().deleteLater()
    
    def method_changed(self, button):
        """Handle method selection change"""
        if button == self.celltypist_radio:
            self.create_celltypist_options()
        elif button == self.reference_radio:
            self.create_reference_options()
        elif button == self.marker_radio:
            self.create_marker_options()
    
    def select_fastq_files(self):
        """Select FASTQ files"""
        files, _ = QFileDialog.getOpenFileNames(
            self,
            "Select FASTQ Files",
            "",
            "FASTQ Files (*.fastq *.fq *.fastq.gz *.fq.gz)"
        )
        if files:
            self.fastq_files = files
            self.fastq_label.setText(f"{len(files)} files selected")
    
    def select_reference(self):
        """Select reference genome"""
        directory = QFileDialog.getExistingDirectory(
            self,
            "Select Reference Genome Directory"
        )
        if directory:
            self.reference_dir = directory
            self.ref_label.setText(directory)
    
    def select_preprocessing_input(self):
        """Select preprocessing input file"""
        file, _ = QFileDialog.getOpenFileName(
            self,
            "Select Input File",
            "",
            "All Supported Files (*.h5 *.h5ad);;H5AD Files (*.h5ad);;H5 Files (*.h5);;All Files (*.*)"
        )
        if file:
            self.pp_input_file = file
            self.pp_input_label.setText(os.path.basename(file))
    
    def select_clustering_input(self):
        """Select clustering input file"""
        file, _ = QFileDialog.getOpenFileName(
            self,
            "Select Input File",
            "",
            "All Supported Files (*.h5 *.h5ad);;H5AD Files (*.h5ad);;H5 Files (*.h5);;All Files (*.*)"
        )
        if file:
            self.cluster_input_file = file
            self.cluster_input_label.setText(os.path.basename(file))
    
    def select_analysis_input(self):
        """Select analysis input file"""
        file, _ = QFileDialog.getOpenFileName(
            self,
            "Select Input File",
            "",
            "All Supported Files (*.h5 *.h5ad);;H5AD Files (*.h5ad);;H5 Files (*.h5);;All Files (*.*)"
        )
        if file:
            self.analysis_input_file = file
            self.analysis_input_label.setText(os.path.basename(file))
    
    def select_reference_file(self):
        """Select reference file for analysis"""
        file, _ = QFileDialog.getOpenFileName(
            self,
            "Select Reference File",
            "",
            "H5AD Files (*.h5ad);;CSV Files (*.csv);;All Files (*.*)"
        )
        if file:
            self.reference_file = file
            self.ref_file_label.setText(os.path.basename(file))
    
    def select_marker_file(self):
        """Select marker gene file"""
        file, _ = QFileDialog.getOpenFileName(
            self,
            "Select Marker File",
            "",
            "CSV Files (*.csv);;Text Files (*.txt);;All Files (*.*)"
        )
        if file:
            self.marker_file = file
            self.marker_file_label.setText(os.path.basename(file))
    
    def run_cellranger(self):
        """Run Cell Ranger processing"""
        try:
            # Validate inputs
            if not hasattr(self, 'fastq_files') or not self.fastq_files:
                QMessageBox.warning(self, "Error", "Please select FASTQ files")
                return
            
            if not hasattr(self, 'reference_dir') or not self.reference_dir:
                QMessageBox.warning(self, "Error", "Please select reference genome directory")
                return
            
            if not hasattr(self, 'cr_output_dir') or not self.cr_output_dir:
                QMessageBox.warning(self, "Error", "Please select output directory")
                return
            
            # Get sample name and ID
            sample_name = self.sample_name_input.text()
            if not sample_name:
                QMessageBox.warning(self, "Error", "Please enter a sample name")
                return
            
            # Create PipelineRunner instance with debug logging
            print(f"Creating pipeline runner with:")
            print(f"FASTQ files: {self.fastq_files}")
            print(f"Reference: {self.reference_dir}")
            print(f"Output: {self.cr_output_dir}")
            print(f"Sample name: {sample_name}")
            
            self.pipeline_runner = PipelineRunner(
                fastq_files=self.fastq_files,
                reference_path=self.reference_dir,
                output_dir=self.cr_output_dir,
                sample_name=sample_name,
                sample_id=self.sample_id_input.text(),
                cores=self.cores_spin.value(),
                memory=self.mem_spin.value()
            )
            
            # Connect signals
            self.pipeline_runner.status_updated.connect(self.update_status)
            self.pipeline_runner.error_occurred.connect(self.handle_error)
            self.pipeline_runner.finished.connect(self.cellranger_finished)
            
            # Disable run button
            self.cr_run_btn.setEnabled(False)
            
            # Start processing
            self.pipeline_runner.start()
            
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to start Cell Ranger: {str(e)}")
            self.cr_run_btn.setEnabled(True)
    
    def run_preprocessing(self):
        """Run preprocessing"""
        # Get input file
        input_file = None
        if self.use_cr_output.isChecked():
            if hasattr(self, 'cr_output_dir'):
                input_file = os.path.join(
                    self.cr_output_dir,
                    "cellranger_output/sample1/outs/filtered_feature_bc_matrix.h5"
                )
        else:
            if hasattr(self, 'pp_input_file'):
                input_file = self.pp_input_file
                
        if not input_file:
            QMessageBox.warning(self, "Error", "Please select input file first!")
            return
            
        if not hasattr(self, 'pp_output_dir'):
            QMessageBox.warning(self, "Error", "Please select output directory first!")
            return
        
        # Disable run button
        self.pp_run_btn.setEnabled(False)
        
        # Create runner thread
        self.pp_runner = PreprocessingRunner(
            input_file=input_file,
            output_dir=self.pp_output_dir,
            mt_threshold=self.mt_threshold.value(),
            ribo_threshold=self.ribo_threshold.value()
        )
        
        # Connect signals
        self.pp_runner.progress_updated.connect(self.progress.setValue)
        self.pp_runner.status_updated.connect(self.status_label.setText)
        self.pp_runner.finished.connect(self.preprocessing_finished)
        
        # Start processing
        self.pp_runner.start()
    
    def run_clustering(self):
        """Run clustering"""
        print("Starting clustering...")
        
        # Get input file
        input_file = None
        if self.use_pp_output.isChecked():
            if hasattr(self, 'pp_output_dir'):
                print(f"Looking for preprocessed files in: {self.pp_output_dir}")
                try:
                    pp_files = [f for f in os.listdir(self.pp_output_dir) 
                              if f.startswith('preprocessed_') and f.endswith('.h5ad')]
                    print(f"Found preprocessed files: {pp_files}")
                    if pp_files:
                        latest_file = max(pp_files)
                        input_file = os.path.join(self.pp_output_dir, latest_file)
                        print(f"Selected input file: {input_file}")
                except Exception as e:
                    print(f"Error finding preprocessed files: {str(e)}")
        else:
            if hasattr(self, 'cluster_input_file'):
                input_file = self.cluster_input_file
                print(f"Using custom input file: {input_file}")
                
        if not input_file:
            QMessageBox.warning(self, "Error", "Please select input file first!")
            return
            
        if not hasattr(self, 'cluster_output_dir'):
            QMessageBox.warning(self, "Error", "Please select output directory first!")
            return
        
        try:
            # Disable run button
            self.cluster_run_btn.setEnabled(False)
            
            # Create runner thread
            print("Creating ClusteringRunner...")
            self.cluster_runner = ClusteringRunner(
                input_file=input_file,
                output_dir=self.cluster_output_dir,
                n_pcs=self.n_pcs.value(),
                resolution=self.resolution.value(),
                n_top_genes=self.n_top_genes.value(),
                random_state=42
            )
            
            # Connect signals
            print("Connecting signals...")
            self.cluster_runner.progress_updated.connect(self.progress.setValue)
            self.cluster_runner.status_updated.connect(self.status_label.setText)
            self.cluster_runner.error_occurred.connect(self.handle_clustering_error)
            self.cluster_runner.finished.connect(self.clustering_finished)
            
            # Start processing
            print("Starting clustering runner...")
            self.cluster_runner.start()
            
        except Exception as e:
            print(f"Error in run_clustering: {str(e)}")
            self.handle_clustering_error(str(e))
    
    def handle_clustering_error(self, error_msg):
        """Handle clustering errors"""
        self.cluster_run_btn.setEnabled(True)
        QMessageBox.critical(self, "Error", f"Clustering failed: {error_msg}")
    
    def clustering_finished(self):
        """Handle clustering completion"""
        self.cluster_run_btn.setEnabled(True)
        QMessageBox.information(self, "Complete", "Clustering complete!")
    
    def run_analysis(self):
        """Run analysis"""
        # Similar implementation to run_preprocessing
        pass
    
    def cellranger_finished(self):
        """Handle Cell Ranger completion"""
        self.cr_run_btn.setEnabled(True)
        self.status_label.setText("Cell Ranger processing complete!")
        QMessageBox.information(self, "Success", "Cell Ranger processing completed successfully!")
    
    def preprocessing_finished(self):
        """Handle preprocessing completion"""
        self.pp_run_btn.setEnabled(True)
        QMessageBox.information(self, "Complete", "Preprocessing complete!")
    
    def select_output_dir(self, task):
        """Select output directory for specific task"""
        directory = QFileDialog.getExistingDirectory(
            self,
            f"Select Output Directory for {task.title()}"
        )
        if directory:
            if task == 'cellranger':
                self.cr_output_dir = directory
                self.cr_output_label.setText(directory)
            elif task == 'preprocessing':
                self.pp_output_dir = directory
                self.pp_output_label.setText(directory)
            elif task == 'clustering':
                self.cluster_output_dir = directory
                self.cluster_output_label.setText(directory)
            elif task == 'analysis':
                self.analysis_output_dir = directory
                self.analysis_output_label.setText(directory)
    
    def update_status(self, message):
        """Update status label with message"""
        self.status_label.setText(message)
        print(message)  # Also print to console for debugging
        
    def handle_error(self, error_message):
        """Handle error messages"""
        QMessageBox.critical(self, "Error", error_message)
        self.cr_run_btn.setEnabled(True)
        self.status_label.setText(f"Error: {error_message}")

class ReferenceSetManager(QWidget):
    def __init__(self):
        super().__init__()
        layout = QVBoxLayout(self)
        
        # Reference set table
        self.ref_table = QTableWidget()
        self.ref_table.setColumnCount(4)
        self.ref_table.setHorizontalHeaderLabels([
            'Reference Name', 'Type', 'Species', 'Tissue'
        ])
        layout.addWidget(self.ref_table)
        
        # Add custom reference button
        add_btn = QPushButton("Add Custom Reference")
        add_btn.clicked.connect(self.add_custom_reference)
        layout.addWidget(add_btn)
        
    def add_custom_reference(self):
        dialog = CustomReferenceDialog()
        if dialog.exec():
            ref_data = dialog.get_reference_data()
            self.add_reference_to_table(ref_data)

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = PipelineGUI()
    window.show()
    sys.exit(app.exec()) 