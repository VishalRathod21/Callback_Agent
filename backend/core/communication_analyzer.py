import re

FILLER_WORDS = ["um", "uh", "like", "so", "actually", "basically", "you know", "literally"]

def analyze_communication(transcript: str) -> dict:
    """Analyze the candidate's transcript for communication metrics:
    - total word count
    - filler word count & frequency
    - general pacing metrics
    """
    if not transcript:
        return {
            "total_candidate_words": 0,
            "filler_words_found": {},
            "total_filler_count": 0,
            "filler_ratio": 0.0,
            "communication_rating": 10.0,
            "filler_feedback": "Excellent clear delivery."
        }

    # Extract only Candidate lines from the formatted transcript
    candidate_lines = []
    for line in transcript.split("\n"):
        if line.startswith("Candidate:"):
            candidate_lines.append(line.replace("Candidate:", "").strip())
    
    candidate_text = " ".join(candidate_lines)
    words = re.findall(r"\b[a-zA-Z']+\b", candidate_text.lower())
    total_words = len(words)
    
    if total_words == 0:
        return {
            "total_candidate_words": 0,
            "filler_words_found": {},
            "total_filler_count": 0,
            "filler_ratio": 0.0,
            "communication_rating": 10.0,
            "filler_feedback": "No candidate speech captured to evaluate."
        }

    # Count filler words
    filler_counts = {}
    total_fillers = 0
    
    # We also want to check for multi-word fillers like "you know"
    candidate_text_lower = candidate_text.lower()
    for filler in FILLER_WORDS:
        # Regex to match whole phrase/word
        pattern = r"\b" + re.escape(filler) + r"\b"
        matches = len(re.findall(pattern, candidate_text_lower))
        if matches > 0:
            filler_counts[filler] = matches
            total_fillers += matches

    filler_ratio = total_fillers / total_words
    
    # Simple score deduction: lose 1 point for every 2% filler word ratio
    communication_rating = max(1.0, round(10.0 - (filler_ratio * 50.0), 1))

    if filler_ratio < 0.02:
        feedback = "Exceptional articulation. Speech is highly focused and contains almost zero filler words."
    elif filler_ratio < 0.05:
        feedback = "Clear communication. A few filler words were detected, but they do not distract from the content."
    elif filler_ratio < 0.08:
        feedback = f"Moderate filler word usage. Try to pause intentionally instead of using filler words like {', '.join(list(filler_counts.keys())[:2])}."
    else:
        feedback = "High frequency of filler words. We recommend practicing silent pauses to improve articulation and command of the room."

    return {
        "total_candidate_words": total_words,
        "filler_words_found": filler_counts,
        "total_filler_count": total_fillers,
        "filler_ratio": round(filler_ratio * 100, 1),
        "communication_rating": communication_rating,
        "filler_feedback": feedback
    }
