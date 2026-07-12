"""
model.py  (backend/ml/model.py)
---------------------------------
PyTorch LSTM model for sign language word recognition.

Architecture (right-sized for ~200 classes, dual-hand 126-dim input):
    Input  (batch, 30, 126)
      │
      ├─ Bidirectional LSTM 128 units (→ 256 per step), return_sequences=True
      ├─ Dropout 0.4
      │
      ├─ Bidirectional LSTM 64 units (→ 128 per step), return_sequences=True
      ├─ Dropout 0.3
      │
      ├─ Temporal attention → weighted sum over time steps (batch, 128)
      │
      ├─ Dense 256 units, ReLU + BatchNorm + Dropout 0.4
      │
      └─ Dense num_classes (logits)

Why this architecture:
-----------------------
INPUT — both hands (126 features):
  The full 126-dim vector captures BOTH hands simultaneously. Real sign
  language uses both hands; tracking only one loses the co-articulation
  patterns that distinguish many signs.
  Layout: left_hand(63 floats) | right_hand(63 floats)
  Both slots are filled by landmarks.py — missing hand = zero vector.

BIDIRECTIONAL LSTM:
  Reads the 30-frame window forward AND backward. The end of a gesture
  is often as diagnostic as its start. BiLSTM doubles contextual
  information without adding extra depth.

TEMPORAL ATTENTION:
  Learns which frames carry the most discriminative information and
  up-weights them. Signing gestures typically occupy only the middle
  10–20 frames of a 30-frame window; uniform averaging dilutes the signal.

HIDDEN SIZE 128 (→256 bidirectional):
  Matched to ~200 classes. Larger would overfit on ~63 samples/class.
  With 200 classes and heavy augmentation (×9 total samples per video),
  this size provides good generalisation without memorisation.

AUGMENTATION (in preprocess_dataset.py, --augmentations 8):
  8 variants per original video → 7 originals × 9 = 63 samples/class.
  Variants: noise, scale, crop, mirror, time-warp, rotation,
            noise+mirror, scale+time-warp.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


# ------------------------------------------------------------------
# Constants (must match preprocessing)
# ------------------------------------------------------------------
SEQUENCE_LENGTH = 30
LANDMARK_VECTOR_SIZE = 126   # 21 landmarks × 3 (x, y, z) × 2 hands


# ------------------------------------------------------------------
# Temporal attention module
# ------------------------------------------------------------------
class TemporalAttention(nn.Module):
    """
    Soft attention over the time axis.
    Given a sequence (batch, T, H), learns a scalar weight per time step
    and returns the weighted sum (batch, H).

    Why: sign gestures don't fill all 30 frames equally — the peak of
    the motion is the most diagnostic part. Attention lets the model
    focus on those frames rather than averaging over blank/transition frames.
    """

    def __init__(self, hidden_size: int):
        super().__init__()
        self.attn = nn.Linear(hidden_size, 1, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, T, H)
        scores  = self.attn(x).squeeze(-1)        # (batch, T)
        weights = F.softmax(scores, dim=-1)        # (batch, T)  — sum=1 over T
        context = (weights.unsqueeze(-1) * x).sum(dim=1)   # (batch, H)
        return context


# ------------------------------------------------------------------
# Main model
# ------------------------------------------------------------------
class GestureBridgeLSTM(nn.Module):
    """
    Two-layer Bidirectional LSTM + temporal attention for ~200-class
    sign language recognition using BOTH hands (126-dim input).

    Input shape  : (batch, 30, 126)   — left_hand(63) | right_hand(63)
    Output shape : (batch, num_classes)  — raw logits (no softmax)
    """

    def __init__(self, num_classes: int):
        super().__init__()

        # ── BiLSTM layer 1: 126 → 128*2 = 256 per step ──────────────
        self.lstm1 = nn.LSTM(
            input_size=LANDMARK_VECTOR_SIZE,
            hidden_size=128,
            num_layers=1,
            batch_first=True,
            bidirectional=True,
        )
        self.drop1 = nn.Dropout(0.4)

        # ── BiLSTM layer 2: 256 → 64*2 = 128 per step ───────────────
        self.lstm2 = nn.LSTM(
            input_size=256,
            hidden_size=64,
            num_layers=1,
            batch_first=True,
            bidirectional=True,
        )
        self.drop2 = nn.Dropout(0.3)

        # ── Temporal attention → (batch, 128) ────────────────────────
        self.attention = TemporalAttention(hidden_size=128)

        # ── Classifier head ──────────────────────────────────────────
        self.fc1    = nn.Linear(128, 256)
        self.bn1    = nn.BatchNorm1d(256)
        self.drop3  = nn.Dropout(0.4)
        self.out    = nn.Linear(256, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, 30, 126)

        # ── BiLSTM 1 ──
        x, _ = self.lstm1(x)     # (batch, 30, 256)
        x = self.drop1(x)

        # ── BiLSTM 2 ──
        x, _ = self.lstm2(x)     # (batch, 30, 128)
        x = self.drop2(x)

        # ── Temporal attention ──
        x = self.attention(x)    # (batch, 128)

        # ── Classifier ──
        x = F.relu(self.bn1(self.fc1(x)))   # (batch, 256)
        x = self.drop3(x)
        x = self.out(x)                     # (batch, num_classes) — logits
        return x


# ------------------------------------------------------------------
# Factory helpers
# ------------------------------------------------------------------
def build_model(num_classes: int, learning_rate: float = 1e-3):
    """
    Build the GestureBridge model and Adam optimizer.

    Returns
    -------
    model     : GestureBridgeLSTM
    optimizer : torch.optim.Adam
    criterion : nn.CrossEntropyLoss
    """
    model = GestureBridgeLSTM(num_classes=num_classes)
    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=learning_rate,
        weight_decay=1e-4,
    )
    criterion = nn.CrossEntropyLoss()
    return model, optimizer, criterion


def load_saved_model(model_path: str, num_classes: int) -> "GestureBridgeLSTM":
    """Load a previously saved GestureBridge model from a .pt file."""
    model = GestureBridgeLSTM(num_classes=num_classes)
    state = torch.load(model_path, map_location="cpu", weights_only=True)
    model.load_state_dict(state)
    model.eval()
    return model


# ------------------------------------------------------------------
# Quick self-test
# ------------------------------------------------------------------
if __name__ == "__main__":
    NUM_CLASSES = 200
    model, optimizer, criterion = build_model(num_classes=NUM_CLASSES)
    print(model)
    total = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\nTrainable parameters: {total:,}")

    dummy = torch.zeros(4, SEQUENCE_LENGTH, LANDMARK_VECTOR_SIZE)
    model.eval()
    with torch.no_grad():
        logits = model(dummy)
    assert logits.shape == (4, NUM_CLASSES), f"Unexpected shape: {logits.shape}"
    print(f"Smoke test passed — output shape: {tuple(logits.shape)}")
