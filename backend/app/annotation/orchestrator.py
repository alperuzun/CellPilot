from .base import AnnotationResult, AnnotationRegistry
import anndata as ad
import logging
from typing import Optional
logger = logging.getLogger(__name__)

class AnnotationOrchestrator:

  def run_multiple(self, method_names: list[str], adata: ad.AnnData, **kwargs):
    results = []
    for method_name in method_names:
      method = AnnotationRegistry.get(method_name)
      available, reason = method.check_available()
      if not available:
        logger.warning(f"Skipping method {method_name}")
      results.append(method.annotate(adata, **kwargs))
    return results
  
  def compute_consensus(
      self, results: list[AnnotationResult], adata: ad.AnnData
  ):
    ...

  def apply_toadata(
      self, adata: ad.AnnData, results: list[AnnotationResult], consensus: Optional[AnnotationResult] = None
  ):
    ...