from PyQt5.QtCore import QThread, pyqtSignal
import os
import analysis

class AnnotationRunner(QThread):
    """
    A QThread to run the annotate() function from annotate.py.
    Handles both preprocessing parameters (if not preprocessed) and annotation parameters.
    """

    update_progress = pyqtSignal(int, str)  # (progress int, status string)
    finished = pyqtSignal(str)              # emits the path to the final annotated file
    error = pyqtSignal(str)                 # emits error messages

    def __init__(
        self,
        input_file,
        output_dir,
        preprocessed=False,
        species="human",
        use_cellmarker=True,
        use_panglao=False,
        use_cancer_single_cell_atlas=False,
        preprocessing_params=None,
        name="",
        cpus=4
    ):
        super().__init__()
        self.input_file = input_file
        self.output_dir = output_dir
        self.preprocessed = preprocessed
        self.species = species.lower()
        self.use_cellmarker = use_cellmarker
        self.use_panglao = use_panglao
        self.use_cancer_single_cell_atlas = use_cancer_single_cell_atlas
        self.preprocessing_params = preprocessing_params or DEFAULT_PARAMS
        self.name = name
        self.cpus = cpus

    def run(self):
        try:
            self.update_progress.emit(5, "Importing annotate.py...")
            from annotate import annotate

            self.update_progress.emit(15, "Running annotation...")

            # Call the annotate() function from annotate.py
            adata_result = annotate(
                input_file=self.input_file,
                output_dir=self.output_dir,
                preprocessed=self.preprocessed,
                preprocessing_params=self.preprocessing_params,
                species=self.species,
                use_cellmarker=self.use_cellmarker,
                use_panglao=self.use_panglao,
                use_cancer_single_cell_atlas=self.use_cancer_single_cell_atlas,
                name=self.name
            )

            # We can't know the exact final file name from the function unless we parse the logs
            # For now, just guess or store the last saved file under output_dir
            final_file = os.path.join(self.output_dir, "annotated_latest.h5ad")  # or parse from the function
            self.update_progress.emit(100, "Annotation complete!")
            self.finished.emit(final_file)

        except Exception as e:
            self.error.emit(str(e))
            raise

################################################################################
# Add this new AnalysisRunner to pipeline_runner.py
################################################################################

# CellPhoneDB runner
class AnalysisRunner(QThread):
    """
    A QThread to run the CellPhoneDB analysis (lab/SingleCell/analysis.py).
    Redirects progress and print statements to the GUI.
    """

    update_progress = pyqtSignal(int, str)
    finished = pyqtSignal(str)  # typically the final output or status
    error = pyqtSignal(str)

    def __init__(
        self,
        input_file,
        output_dir,
        column_name,
        cpdb_file_path,
        name,
        counts_min=10,
        plot_column_names=None
    ):
        super().__init__()
        self.input_file = input_file
        self.output_dir = output_dir
        self.column_name = column_name
        self.cpdb_file_path = cpdb_file_path
        self.name = name
        self.counts_min = counts_min
        self.plot_column_names = plot_column_names or []

    def run(self):
        try:
            from analysis import run_cell_phone_db

            self.update_progress.emit(10, "Starting CellPhoneDB analysis...")
            run_cell_phone_db(
                input_file=self.input_file,
                output_dir=self.output_dir,
                column_name=self.column_name,
                cpdb_file_path=self.cpdb_file_path,
                name=self.name,
                counts_min=self.counts_min,
                plot_column_names=self.plot_column_names,
            )
            self.update_progress.emit(100, "CellPhoneDB analysis complete!")
            self.finished.emit("Analysis finished successfully!")
        except Exception as e:
            self.error.emit(str(e))
            raise

class InfernCNVRunner(QThread):
    update_progress = pyqtSignal(int, str)
    finished        = pyqtSignal(str)
    error           = pyqtSignal(str)

    def __init__(self, *, input_file, output_dir, name,
                 reference_key="cell_type", reference_cat=None,
                 gtf_path="db/gencode.v47.annotation.gtf.gz",
                 cnv_threshold=0.03, cores=4):
        super().__init__()
        self.kwargs = dict(
            input_file=input_file,
            output_dir=output_dir,
            name=name,
            reference_key=reference_key,
            reference_cat=reference_cat or "",
            gtf_path=gtf_path,
            cnv_threshold=cnv_threshold,
            cores=cores,
        )

    def run(self):
        try:
            self.update_progress.emit(0, "Starting inferCNV…")
            analysis.run_inferncnv(**self.kwargs)
            self.update_progress.emit(100, "inferCNV finished")
            self.finished.emit(f"inferCNV analysis completed! Results in {self.kwargs['output_dir']}")
        except Exception as e:
            self.error.emit(str(e))

if __name__ == "__main__":
    print("AnnotationRunner test usage here if desired.")
