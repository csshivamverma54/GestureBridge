"""
train.py  (backend/ml/train.py)
---------------------------------
Full training pipeline for the GestureBridge LSTM gesture classifier.

What it does:
  1. Loads X.npy and y.npy produced by ml/preprocess_dataset.py.
  2. Loads labels.json for num_classes.
  3. Stratified train / validation / test split (70 / 15 / 15).
  4. Builds the LSTM model (ml/model.py).
  5. Trains with:
       - EarlyStopping (patience 15, restore best weights)
       - ReduceLROnPlateau (factor 0.5, patience 7)
       - Best-model checkpoint (saves gesture_model.pt)
       - CSV training log (training_history.json)
  6. Saves:
       - ml/gesture_model.pt       (primary production model — state dict)
       - ml/training_history.json  (epoch-level metrics)
  7. Generates and saves:
       - ml/plots/accuracy.png
       - ml/plots/loss.png
  8. Runs final evaluation on the held-out test set and prints
       accuracy, loss, classification report.
     (Full confusion matrix + detailed report → ml/evaluate.py)

Usage (from backend/):
    python -m ml.train \\
        --processed_dir ml/processed \\
        --output_dir    ml \\
        --epochs        100 \\
        --batch_size    32 \\
        --learning_rate 0.001
"""

import argparse
import json
import logging
import os
import shutil
import sys
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")           # non-interactive backend for server environments
import matplotlib.pyplot as plt
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset

# Add backend root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sklearn.model_selection import train_test_split

from ml.model import build_model

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Data loading
# ------------------------------------------------------------------
def load_data(processed_dir: Path):
    """
    Load X.npy, y.npy, and labels.json from the processed directory.

    Returns
    -------
    X          : np.ndarray (N, 30, 126) float32
    y          : np.ndarray (N,)        int64
    idx_to_label : dict {int: str}
    num_classes  : int
    """
    X_path = processed_dir / "X.npy"
    y_path = processed_dir / "y.npy"
    labels_path = processed_dir / "labels.json"

    for p in (X_path, y_path, labels_path):
        if not p.exists():
            log.error("Required file not found: %s", p)
            sys.exit(1)

    X = np.load(X_path).astype(np.float32)
    y = np.load(y_path).astype(np.int64)

    with open(labels_path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    idx_to_label = {int(k): v for k, v in raw.items()}
    num_classes = len(idx_to_label)

    log.info("Loaded X=%s  y=%s  classes=%d", X.shape, y.shape, num_classes)
    return X, y, idx_to_label, num_classes


# ------------------------------------------------------------------
# Splitting
# ------------------------------------------------------------------
def split_data(X, y, val_size=0.15, test_size=0.15, random_state=42):
    """
    Stratified 70 / 15 / 15 split.

    For glosses with very few samples (< 3) stratification falls back
    to a plain shuffle split to avoid sklearn errors.
    """
    try:
        X_trainval, X_test, y_trainval, y_test = train_test_split(
            X, y,
            test_size=test_size,
            random_state=random_state,
            stratify=y,
        )
    except ValueError:
        log.warning("Stratified split failed — falling back to random split for test set.")
        X_trainval, X_test, y_trainval, y_test = train_test_split(
            X, y,
            test_size=test_size,
            random_state=random_state,
        )

    relative_val = val_size / (1.0 - test_size)
    try:
        X_train, X_val, y_train, y_val = train_test_split(
            X_trainval, y_trainval,
            test_size=relative_val,
            random_state=random_state,
            stratify=y_trainval,
        )
    except ValueError:
        log.warning("Stratified split failed — falling back to random split for val set.")
        X_train, X_val, y_train, y_val = train_test_split(
            X_trainval, y_trainval,
            test_size=relative_val,
            random_state=random_state,
        )

    log.info(
        "Split → train: %d  val: %d  test: %d",
        len(X_train), len(X_val), len(X_test),
    )
    return (X_train, y_train), (X_val, y_val), (X_test, y_test)


# ------------------------------------------------------------------
# DataLoader helpers
# ------------------------------------------------------------------
def make_loader(X: np.ndarray, y: np.ndarray, batch_size: int, shuffle: bool) -> DataLoader:
    Xt = torch.from_numpy(X)
    yt = torch.from_numpy(y)
    return DataLoader(TensorDataset(Xt, yt), batch_size=batch_size, shuffle=shuffle)


# ------------------------------------------------------------------
# Plotting helpers
# ------------------------------------------------------------------
def _save_metric_plot(history: dict, metric: str, output_dir: Path):
    """Save a train vs. validation curve for `metric`."""
    train_vals = history.get(metric, [])
    val_vals   = history.get(f"val_{metric}", [])
    epochs     = range(1, len(train_vals) + 1)

    fig, ax = plt.subplots(figsize=(9, 5))
    ax.plot(epochs, train_vals, label=f"Train {metric}", linewidth=2)
    ax.plot(epochs, val_vals,   label=f"Val {metric}",   linewidth=2, linestyle="--")
    ax.set_title(f"GestureBridge — {metric.capitalize()} over Epochs")
    ax.set_xlabel("Epoch")
    ax.set_ylabel(metric.capitalize())
    ax.legend()
    ax.grid(True, alpha=0.3)

    plots_dir = output_dir / "plots"
    plots_dir.mkdir(parents=True, exist_ok=True)
    path = plots_dir / f"{metric}.png"
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    log.info("Saved %s plot → %s", metric, path)


# ------------------------------------------------------------------
# One epoch helpers
# ------------------------------------------------------------------
def _train_epoch(model, loader, optimizer, criterion, device):
    model.train()
    total_loss, correct, n = 0.0, 0, 0
    for Xb, yb in loader:
        Xb, yb = Xb.to(device), yb.to(device)
        optimizer.zero_grad()
        logits = model(Xb)
        loss = criterion(logits, yb)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * len(yb)
        correct    += (logits.argmax(1) == yb).sum().item()
        n          += len(yb)
    return total_loss / n, correct / n


def _eval_epoch(model, loader, criterion, device):
    model.eval()
    total_loss, correct, n = 0.0, 0, 0
    with torch.no_grad():
        for Xb, yb in loader:
            Xb, yb = Xb.to(device), yb.to(device)
            logits = model(Xb)
            loss = criterion(logits, yb)
            total_loss += loss.item() * len(yb)
            correct    += (logits.argmax(1) == yb).sum().item()
            n          += len(yb)
    return total_loss / n, correct / n


# ------------------------------------------------------------------
# Main training function
# ------------------------------------------------------------------
def run_training(
    processed_dir: Path,
    output_dir: Path,
    epochs: int,
    batch_size: int,
    learning_rate: float,
):
    device = torch.device("cpu")

    # ── Load data ──────────────────────────────────────────────────
    X, y, idx_to_label, num_classes = load_data(processed_dir)
    (X_train, y_train), (X_val, y_val), (X_test, y_test) = split_data(X, y)

    # ── Z-score standardization using TRAINING-SET statistics only ─
    # X shape: (N, 30, 63).  Compute mean/std over (N, T) → shape (63,).
    # This preserves inter-sample differences that global per-sequence
    # min-max normalization was destroying.
    feat_mean = X_train.reshape(-1, X_train.shape[-1]).mean(axis=0)   # (63,)
    feat_std  = X_train.reshape(-1, X_train.shape[-1]).std(axis=0)    # (63,)
    feat_std  = np.where(feat_std < 1e-8, 1.0, feat_std)             # avoid /0

    X_train = ((X_train - feat_mean) / feat_std).astype(np.float32)
    X_val   = ((X_val   - feat_mean) / feat_std).astype(np.float32)
    X_test  = ((X_test  - feat_mean) / feat_std).astype(np.float32)

    # Save normalizer stats so predictor can apply the same transform at runtime
    output_dir.mkdir(parents=True, exist_ok=True)
    np.savez(output_dir / "normalizer.npz", mean=feat_mean, std=feat_std)
    log.info("Saved normalizer stats → %s", output_dir / "normalizer.npz")

    # Save the test split for evaluation script
    test_dir = processed_dir / "test"
    test_dir.mkdir(parents=True, exist_ok=True)
    np.save(test_dir / "X_test.npy", X_test)
    np.save(test_dir / "y_test.npy", y_test)
    log.info("Saved test split → %s", test_dir)

    train_loader = make_loader(X_train, y_train, batch_size, shuffle=True)
    val_loader   = make_loader(X_val,   y_val,   batch_size, shuffle=False)
    test_loader  = make_loader(X_test,  y_test,  batch_size, shuffle=False)

    # ── Build model ────────────────────────────────────────────────
    model, optimizer, _ = build_model(
        num_classes=num_classes, learning_rate=learning_rate
    )
    # Label smoothing reduces overconfidence and helps when per-class samples are few
    criterion = torch.nn.CrossEntropyLoss(label_smoothing=0.1)
    model.to(device)
    log.info("Model:\n%s", model)
    total_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    log.info("Trainable parameters: %d", total_params)

    # ── Schedulers (mimic Keras callbacks) ─────────────────────────
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=7, min_lr=1e-6
    )

    # ── Training loop ──────────────────────────────────────────────
    history = {
        "loss": [], "accuracy": [],
        "val_loss": [], "val_accuracy": [],
    }
    best_val_acc  = -1.0
    best_state    = None
    patience      = 20
    no_improve    = 0
    output_dir.mkdir(parents=True, exist_ok=True)
    model_path    = output_dir / "gesture_model.pt"

    for epoch in range(1, epochs + 1):
        tr_loss, tr_acc = _train_epoch(model, train_loader, optimizer, criterion, device)
        vl_loss, vl_acc = _eval_epoch(model,  val_loader,   criterion,            device)
        scheduler.step(vl_loss)

        history["loss"].append(tr_loss)
        history["accuracy"].append(tr_acc)
        history["val_loss"].append(vl_loss)
        history["val_accuracy"].append(vl_acc)

        log.info(
            "Epoch %3d/%d — loss: %.4f  acc: %.4f  val_loss: %.4f  val_acc: %.4f",
            epoch, epochs, tr_loss, tr_acc, vl_loss, vl_acc,
        )

        # EarlyStopping + ModelCheckpoint (monitor val_accuracy)
        if vl_acc > best_val_acc:
            best_val_acc = vl_acc
            best_state   = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            torch.save(best_state, model_path)
            log.info("  ✓ val_accuracy improved → saved %s", model_path)
            no_improve = 0
        else:
            no_improve += 1
            if no_improve >= patience:
                log.info("EarlyStopping triggered at epoch %d (patience=%d).", epoch, patience)
                break

    # Restore best weights
    if best_state is not None:
        model.load_state_dict(best_state)
        log.info("Restored best weights (val_acc=%.4f).", best_val_acc)

    # ── Copy labels.json to output_dir ─────────────────────────────
    src_labels = processed_dir / "labels.json"
    dst_labels = output_dir / "labels.json"
    if src_labels != dst_labels:
        shutil.copy2(src_labels, dst_labels)
    log.info("labels.json → %s", dst_labels)

    # Save num_classes alongside the model so predictor can reconstruct it
    meta_path = output_dir / "model_meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({"num_classes": num_classes}, f)
    log.info("model_meta.json → %s", meta_path)

    # ── Save training history ──────────────────────────────────────
    history_path = output_dir / "training_history.json"
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)
    log.info("Training history → %s", history_path)

    # ── Plots ──────────────────────────────────────────────────────
    _save_metric_plot(history, "accuracy", output_dir)
    _save_metric_plot(history, "loss", output_dir)

    # ── Quick evaluation on test set ──────────────────────────────
    test_loss, test_acc = _eval_epoch(model, test_loader, criterion, device)
    log.info("Test loss: %.4f  |  Test accuracy: %.4f", test_loss, test_acc)

    print("\n" + "=" * 50)
    print(f"  Final test accuracy : {test_acc * 100:.2f}%")
    print(f"  Final test loss     : {test_loss:.4f}")
    print("=" * 50)
    print("\nRun ml/evaluate.py for full confusion matrix and classification report.")

    return model, history


# ------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Train the GestureBridge LSTM gesture classifier."
    )
    parser.add_argument(
        "--processed_dir",
        type=str,
        default="ml/processed",
        help="Directory containing X.npy, y.npy, labels.json (output of preprocess_dataset.py).",
    )
    parser.add_argument(
        "--output_dir",
        type=str,
        default="ml",
        help="Directory to save the model, plots, and history.",
    )
    parser.add_argument("--epochs",        type=int,   default=150)
    parser.add_argument("--batch_size",    type=int,   default=32)
    parser.add_argument("--learning_rate", type=float, default=0.001)
    args = parser.parse_args()

    run_training(
        processed_dir=Path(args.processed_dir).resolve(),
        output_dir=Path(args.output_dir).resolve(),
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
    )


if __name__ == "__main__":
    main()
