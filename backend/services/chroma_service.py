"""ChromaDB vector store service for resume embeddings."""

import logging

import chromadb

from core.config import settings

logger = logging.getLogger(__name__)

# Persistent ChromaDB client
_client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)

# Collection for resume embeddings (cosine similarity)
_collection = _client.get_or_create_collection(
    name="resumes",
    metadata={"hnsw:space": "cosine"},
)

logger.info(
    "ChromaDB initialized — collection 'resumes' (%d documents)",
    _collection.count(),
)


async def store_resume(candidate_id: str, resume_text: str) -> None:
    """Store a candidate's resume text in the ChromaDB collection.

    If a document with the same candidate_id already exists it will be
    upserted (updated in place).

    Args:
        candidate_id: Unique identifier for the candidate (used as doc ID).
        resume_text: The full extracted resume text to embed and store.
    """
    _collection.upsert(
        ids=[candidate_id],
        documents=[resume_text],
        metadatas=[{"candidate_id": candidate_id}],
    )
    logger.info("Stored resume for candidate %s in ChromaDB", candidate_id)


async def search_similar_resumes(query: str, n_results: int = 5) -> list:
    """Search for resumes similar to the given query text.

    Args:
        query: The search text (e.g. a job description or skill keywords).
        n_results: Maximum number of results to return (default 5).

    Returns:
        A list of dicts, each containing:
            - id: The candidate_id of the matching resume.
            - document: The stored resume text.
            - distance: Cosine distance score (lower = more similar).
            - metadata: Any associated metadata.
    """
    results = _collection.query(
        query_texts=[query],
        n_results=n_results,
    )

    matches: list[dict] = []
    if results and results["ids"]:
        for i, doc_id in enumerate(results["ids"][0]):
            matches.append(
                {
                    "id": doc_id,
                    "document": results["documents"][0][i] if results["documents"] else None,
                    "distance": results["distances"][0][i] if results["distances"] else None,
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else None,
                }
            )

    logger.info("Found %d similar resumes for query (first 50 chars: '%.50s...')", len(matches), query)
    return matches


async def delete_resume(candidate_id: str) -> None:
    """Delete a candidate's resume from the ChromaDB collection."""
    try:
        _collection.delete(ids=[candidate_id])
        logger.info("Deleted resume for candidate %s from ChromaDB", candidate_id)
    except Exception as exc:
        logger.error("Failed to delete candidate %s resume from ChromaDB: %s", candidate_id, exc)

