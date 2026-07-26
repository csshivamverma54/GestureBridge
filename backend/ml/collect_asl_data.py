"""
collect_asl_data.py  (backend/ml/collect_asl_data.py)
------------------------------------------------------
Webcam-based ASL letter data collector.

Adapted from database/Letter-to-sentence/collect_asl_data.py.

Controls
--------
  A–Z        choose the letter label (J and Z are motion-based — collected
             separately if desired)
  6          save current hand sample
  1          quit and write asl_data.npz

Output
------
  backend/database/asl_data.npz   — appends to existing dataset if present
    X : float32 (N, 63)  — raw 21-landmark hand vectors (wrist-centered +
                            scale normalisation applied during training)
    y : str     (N,)     — letter labels

Run from backend/:
    python -m ml.collect_asl_data
"""

import cv2
import mediapipe as mp
import numpy as np
import os
from collections import Counter
from pathlib import Path

mp_hands   = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils

# Output path — same location that train_asl_letter.py reads from
_BASE_DIR  = Path(__file__).parent.parent
_DATA_PATH = _BASE_DIR / "database" / "asl_data.npz"

# Supported letters — J and Z are motion-detected at inference time and
# therefore excluded from static hand-pose training data.
VALID_LABELS = [ch for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" if ch not in ("J", "Z")]

# Target samples per letter before the collector marks it as "done"
TARGET_PER_LETTER = 200


def _extract_features(hand_landmarks) -> np.ndarray:
    """Return raw 63-float vector from a MediaPipe hand result (no normalisation)."""
    features = []
    for lm in hand_landmarks.landmark:
        features.extend([lm.x, lm.y, lm.z])
    return np.array(features, dtype=np.float32)


def _build_counts(y_labels) -> dict:
    counts = Counter(y_labels)
    return {label: counts.get(label, 0) for label in VALID_LABELS}


def main():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Could not open webcam.")
        return

    X: list[np.ndarray] = []
    y: list[str]        = []
    current_label       = ""

    # Append mode — load existing dataset if present
    if _DATA_PATH.exists():
        data = np.load(str(_DATA_PATH), allow_pickle=True)
        X = list(data["X"])
        y = list(data["y"])
        print(f"Loaded existing dataset: {_DATA_PATH}")
        print(f"  Existing total samples: {len(y)}")
    else:
        print("No existing dataset found. Starting fresh.")

    counts = _build_counts(y)

    print("\nASL Data Collector  (SAVE = 6, QUIT = 1)")
    print("------------------------------------------")
    print("Supported static letters (J/Z are motion-based):", " ".join(VALID_LABELS))
    print("Controls:")
    print("  Press A–Z (except J/Z) to choose label.")
    print(f"  Press 6 to SAVE the current hand sample (target: {TARGET_PER_LETTER}/letter).")
    print("  Press 1 to quit and save asl_data.npz.\n")

    print("Current counts per letter:")
    for lbl in VALID_LABELS:
        print(f"  {lbl}: {counts[lbl]}")
    need_list = [lbl for lbl in VALID_LABELS if counts[lbl] < TARGET_PER_LETTER]
    print(f"\nLetters still below {TARGET_PER_LETTER} samples:", " ".join(need_list) if need_list else "None ✓")

    with mp_hands.Hands(
        max_num_hands=1,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.5,
    ) as hands:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame      = cv2.flip(frame, 1)
            rgb        = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result     = hands.process(rgb)
            h, w, _    = frame.shape
            hand_lms   = None

            if result.multi_hand_landmarks:
                hand_lms = result.multi_hand_landmarks[0]
                mp_drawing.draw_landmarks(
                    frame, hand_lms, mp_hands.HAND_CONNECTIONS,
                    mp_drawing.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=3),
                    mp_drawing.DrawingSpec(color=(0, 150, 0), thickness=2),
                )
                cv2.putText(frame, "Hand detected", (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2, cv2.LINE_AA)
            else:
                cv2.putText(frame, "Show one hand to the camera", (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2, cv2.LINE_AA)

            # Current label + total
            cv2.putText(frame, f"Label: {current_label or '-'}", (10, h - 70),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
            cv2.putText(frame, f"Total samples: {len(y)}", (10, h - 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2, cv2.LINE_AA)

            # Per-letter count grid
            start_x       = int(w * 0.45)
            start_y       = 40
            row_height    = 20
            col_width     = 80
            letters_per_row = 6

            cv2.putText(frame, f"Counts (target {TARGET_PER_LETTER}):",
                        (start_x, start_y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.45,
                        (200, 200, 200), 1, cv2.LINE_AA)

            for idx, lbl in enumerate(VALID_LABELS):
                row    = idx // letters_per_row
                col    = idx %  letters_per_row
                x      = start_x + col * col_width
                y_txt  = start_y + row * row_height
                txt    = f"{lbl}:{counts[lbl]:03d}"
                color  = (0, 255, 0) if counts[lbl] >= TARGET_PER_LETTER else (180, 180, 180)
                cv2.putText(frame, txt, (x, y_txt), cv2.FONT_HERSHEY_SIMPLEX,
                            0.45, color, 1, cv2.LINE_AA)

            # "Need" line
            need_letters = [lbl for lbl in VALID_LABELS if counts[lbl] < TARGET_PER_LETTER]
            need_text    = "Need: " + (" ".join(need_letters) if need_letters else "All reached target!")
            cv2.putText(frame, need_text, (10, 60), cv2.FONT_HERSHEY_SIMPLEX,
                        0.5, (0, 255, 0) if not need_letters else (0, 200, 255), 1, cv2.LINE_AA)

            cv2.imshow("ASL Data Collector — GestureBridge", frame)
            key = cv2.waitKey(1) & 0xFF

            # Quit + save
            if key == ord("1"):
                break

            # Label selection (A–Z except J/Z)
            if ord("a") <= key <= ord("z") or ord("A") <= key <= ord("Z"):
                ch = chr(key).upper()
                if ch in VALID_LABELS:
                    current_label = ch
                    print(f"\nLabel set to: {current_label}  (count: {counts[current_label]})")
                else:
                    print(f"'{ch}' is motion-based — no static sample needed.")

            # Save sample
            if key == ord("6"):
                if not current_label:
                    print("Choose a label first (A–Z except J/Z).")
                elif hand_lms is None:
                    print("No hand detected — can't save.")
                else:
                    feat = _extract_features(hand_lms)
                    X.append(feat)
                    y.append(current_label)
                    counts[current_label] += 1
                    need_list = [lbl for lbl in VALID_LABELS if counts[lbl] < TARGET_PER_LETTER]
                    print(
                        f"Saved {current_label} → count={counts[current_label]}  "
                        f"total={len(y)}  "
                        f"remaining: {' '.join(need_list) if need_list else 'All done ✓'}"
                    )

    cap.release()
    cv2.destroyAllWindows()

    if not y:
        print("No samples collected.")
        return

    X_arr = np.array(X,  dtype=np.float32)
    y_arr = np.array(y,  dtype=object)
    np.savez(str(_DATA_PATH), X=X_arr, y=y_arr)
    print(f"\nSaved combined dataset → {_DATA_PATH}")
    print(f"  Final total samples : {len(y_arr)}")
    final_counts = _build_counts(y_arr.tolist())
    print("  Final per-letter counts:")
    for lbl in VALID_LABELS:
        print(f"    {lbl}: {final_counts[lbl]}")


if __name__ == "__main__":
    main()
