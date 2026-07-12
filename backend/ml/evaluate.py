"""
evaluate.py  (backend/ml/evaluate.py)
--------------------------------------
Post-training evaluation script for the GestureBridge LSTM model.

What it produces (all saved to <output_dir>/evaluation/):
  - confusion_matrix.png       — heatmap of true vs. predicted labels
  - classification_report.txt  — per-class precision, recall, F1
  - metrics_summary.json       — macro/weighted averages, accuracy
  - top1_top5_accuracy.txt     — Top-1 and Top-5 accuracy on test set

Usage (from backend/):
    python -m ml.evaluate \\
        --model_path   ml/gesture_model.keras \\
        --test_dir     ml/processed/test \\
        --labels_path  ml/labels.json \\
        --output_dir   ml

The test split (X_test.npy, y_test.npy) is created by ml/train.py.
If you want to re-evaluate on the full dataset, point --test_dir at
ml/processed/ and make sure X.npy / y.npy are present there.
"""

import argparse
import json
import logging
import sys
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Loaders
# ------------------------------------------------------------------
def load_test_data(test_dir: Path):
    x_candidates = [test_dir / "X_test.npy", test_dir / "X.npy"]
    y_candidates = [test_dir / "y_test.npy", test_dir / "y.npy"]

    X_path = next((p for p in x_candidates if p.exists()), None)
    y_path = next((p for p in y_candidates if p.exists()), None)

    if X_path is None or y_path is None:
        log.error("Could not find X/y arrays in %s", test_dir)
        sys.exit(1)

    return np.load(X_path).astype(np.float32), np.load(y_path).astype(np.int32)


def load_labels(labels_path: Path) -> dict:
    with open(labels_path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return {int(k): v for k, v in raw.items()}


# ------------------------------------------------------------------
# Metrics helpers
# ------------------------------------------------------------------
def top_k_accuracy(y_true: np.ndarray, y_prob: np.ndarray, k: int = 5) -> float:
    """Fraction of samples where the true label is in the top-k predicted classes."""
    top_k = np.argsort(y_prob, axis=1)[:, -k:]
    correct = sum(1 for i, t in enumerate(y_true) if t in top_k[i])
    return correct / len(y_true)


def plot_confusion_matrix(
    cm: np.ndarray,
    class_names: list,
    output_path: Path,
    max_classes: int = 40,
):
    """
    Save a confusion matrix heatmap.

    For readability, if num_classes > max_classes only the top-max_classes
    most-frequent true labels are shown.
    """
    n = cm.shape[0]
    if n > max_classes:
        # Select the max_classes with the highest row-sum (most true samples)
        row_sums = cm.sum(axis=1)
        top_indices = np.argsort(row_sums)[-max_classes:][::-1]
        cm = cm[np.ix_(top_indices, top_indices)]
        class_names = [class_names[i] for i in top_indices]
        n = max_classes

    fig_size = max(10, n // 2)
    fig, ax = plt.subplots(figsize=(fig_size, fig_size))
    im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
    plt.colorbar(im, ax=ax)

    ax.set(
        xticks=np.arange(n),
        yticks=np.arange(n),
        xticklabels=class_names,
        yticklabels=class_names,
        ylabel="True label",
        xlabel="Predicted label",
        title="GestureBridge — Confusion Matrix",
    )
    plt.setp(ax.get_xticklabels(), rotation=45, ha="right", fontsize=7)
    plt.setp(ax.get_yticklabels(), fontsize=7)

    # Annotate cells only when num_classes is small enough
    if n <= 20:
        thresh = cm.max() / 2.0
        for i in range(n):
            for j in range(n):
                ax.text(
                    j, i, str(cm[i, j]),
                    ha="center", va="center",
                    color="white" if cm[i, j] > thresh else "black",
                    fontsize=6,
                )

    fig.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    log.info("Confusion matrix saved → %s", output_path)


# ------------------------------------------------------------------
# Main evaluation
# ------------------------------------------------------------------
def run_evaluation(
    model_path: Path,
    test_dir: Path,
    labels_path: Path,
    output_dir: Path,
):
    import tensorflow as tf
    from sklearn.metrics import (
        classification_report,
        confusion_matrix,
        precision_recall_fscore_support,
    )

    eval_dir = output_dir / "evaluation"
    eval_dir.mkdir(parents=True, exist_ok=True)

    # ── Load everything ────────────────────────────────────────────
    log.info("Loading model from %s …", model_path)
    model = tf.keras.models.load_model(str(model_path))

    X_test, y_test = load_test_data(test_dir)
    idx_to_label = load_labels(labels_path)
    class_names = [idx_to_label[i] for i in range(len(idx_to_label))]

    log.info("Test set: %d samples  |  Classes: %d", len(X_test), len(class_names))

    # ── Inference ──────────────────────────────────────────────────
    y_prob = model.predict(X_test, batch_size=64, verbose=1)   # (N, num_classes)
    y_pred = np.argmax(y_prob, axis=1)

    # ── Top-1 / Top-5 accuracy ─────────────────────────────────────
    top1 = float(np.mean(y_pred == y_test))
    top5 = top_k_accuracy(y_test, y_prob, k=5)
    log.info("Top-1 Accuracy: %.4f  |  Top-5 Accuracy: %.4f", top1, top5)

    acc_text = f"Top-1 Accuracy : {top1 * 100:.2f}%\nTop-5 Accuracy : {top5 * 100:.2f}%\n"
    with open(eval_dir / "top1_top5_accuracy.txt", "w") as f:
        f.write(acc_text)

    # ── Precision / Recall / F1 ────────────────────────────────────
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test, y_pred, average="weighted", zero_division=0
    )
    log.info(
        "Weighted — Precision: %.4f  Recall: %.4f  F1: %.4f",
        precision, recall, f1,
    )

    metrics_summary = {
        "top1_accuracy": round(top1, 4),
        "top5_accuracy": round(top5, 4),
        "weighted_precision": round(float(precision), 4),
        "weighted_recall": round(float(recall), 4),
        "weighted_f1": round(float(f1), 4),
        "num_test_samples": int(len(X_test)),
        "num_classes": len(class_names),
    }
    with open(eval_dir / "metrics_summary.json", "w") as f:
        json.dump(metrics_summary, f, indent=2)
    log.info("Metrics summary → %s", eval_dir / "metrics_summary.json")

    # ── Classification report ──────────────────────────────────────
    # Only include labels actually present in the test set to avoid sklearn
    # warnings when some glosses have no test samples.
    present_labels = sorted(set(y_test.tolist()))
    present_names = [idx_to_label.get(i, str(i)) for i in present_labels]

    report_str = classification_report(
        y_test,
        y_pred,
        labels=present_labels,
        target_names=present_names,
        zero_division=0,
    )
    print("\n" + "=" * 60)
    print("Classification Report")
    print("=" * 60)
    print(report_str)

    with open(eval_dir / "classification_report.txt", "w") as f:
        f.write(report_str)
    log.info("Classification report → %s", eval_dir / "classification_report.txt")

    # ── Confusion matrix ───────────────────────────────────────────
    cm = confusion_matrix(y_test, y_pred, labels=present_labels)
    plot_confusion_matrix(
        cm,
        class_names=present_names,
        output_path=eval_dir / "confusion_matrix.png",
    )

    print(f"\nAll evaluation files saved to: {eval_dir}")
    return metrics_summary


# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Evaluate the trained GestureBridge LSTM model."
    )
    parser.add_argument(
        "--model_path",
        type=str,
        default="ml/gesture_model.keras",
        help="Path to the saved .keras or .h5 model file.",
    )
    parser.add_argument(
        "--test_dir",
        type=str,
        default="ml/processed/test",
        help="Directory containing X_test.npy and y_test.npy.",
    )
    parser.add_argument(
        "--labels_path",
        type=str,
        default="ml/labels.json",
        help="Path to labels.json.",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default="ml",
        help="Root output directory; evaluation/ sub-folder is created here.",
    )
    args = parser.parse_args()

    run_evaluation(
        model_path=Path(args.model_path).resolve(),
        test_dir=Path(args.test_dir).resolve(),
        labels_path=Path(args.labels_path).resolve(),
        output_dir=Path(args.output_dir).resolve(),
    )


if __name__ == "__main__":
    main()
