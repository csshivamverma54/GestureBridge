"""
model.py  (backend/ml/model.py)
---------------------------------
PyTorch LSTM model for continuous sign language recognition (CSLR).

Architecture (~350 classes, 218-dim multi-modal input, 45-frame sequences):
    Input  (batch, 45, 218)
      │   [left_hand(63)|right_hand(63)|pose(24)|face(27)|vel(3)|dist(2)|
      │    accel(3)|nmm(10)|finger_angles(15)|wrist_quat(4)|body_dist(4)]
      │
      ├─ Bidirectional LSTM 128 units (→ 256 per step), return_sequences=True
      ├─ Dropout 0.4
      │
      ├─ Bidirectional LSTM 64 units (→ 128 per step), return_sequences=True
      ├─ Dropout 0.3
      │
      ├─ Temporal attention → weighted sum over time steps (batch, 128)
      │
      ├─ Dense 256, ReLU + BatchNorm + Dropout 0.4
      │
      └─ Dense num_classes (logits)

INPUT — 218-dim multi-modal feature vector (from landmarks.py):
  left_hand(63) + right_hand(63)
    BOTH hands, wrist-normalised. Two-handed signs (help, open, clap)
    are only distinguishable when both hand shapes are present.
  pose(24)  — 8 upper-body joints, shoulder-width normalised.
    Captures arm arc and body-relative hand location. Resolves signs
    like "mother" (chin) vs "father" (forehead) — same hand shape,
    different body-space location.
  face(27)  — 9 lip/chin/nose landmarks, nose-bridge anchored.
    Spatial target for contact signs: "good", "thank you", "eat",
    "drink", "kiss". The face coordinates reveal WHERE the hand is
    relative to the face regardless of camera distance.
  velocity(3)  — Δ(x,y,z) of dominant (right) wrist per frame.
    Encodes signing speed and trajectory direction. Signs with
    identical end-poses but different movements are disambiguated.
  interaction(2) — [fingertips→lips dist, fingertips→palm dist].
    Explicit contact-boundary features that spike near 0 on contact
    signs. The temporal attention naturally up-weights frames where
    these distances are minimised (the "hold" of a sign).

TEMPORAL ATTENTION:
  Learns a scalar weight per time step. Peaks at frames where
  velocity is near zero (the "hold") and interaction distances are
  smallest — the most diagnostically rich moments of each sign.

BIDIRECTIONAL LSTM:
  Reads the sequence forward AND backward. The release trajectory
  after the hold is as informative as the approach.

SEQUENCE LENGTH:
  45 frames at 30 FPS ≈ 1.5 seconds per window — long enough to
  capture the full motion arc of most ASL signs including approach,
  hold, and release phases. Training uses a 45-frame FIFO window;
  inference passes the last 45 frames of the live capture buffer.

AUGMENTATION (preprocess_dataset.py --augmentations 8):
  noise | scale | crop | mirror(L↔R) | time-warp |
  rotation | noise+mirror | scale+warp
  → 7 originals × 9 = 63 samples/class for ~350 classes.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


# ------------------------------------------------------------------
# Constants (must match landmarks.py and preprocess.py)
# ------------------------------------------------------------------
SEQUENCE_LENGTH = 45   # 45 frames at 30 FPS ≈ 1.5 s — full approach+hold+release
LANDMARK_VECTOR_SIZE = 218   # v2: 182 + accel(3)+nmm(10)+finger_ang(15)+wrist_orient(4)+body_dist(4)


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
    Two-layer Bidirectional LSTM + temporal attention for continuous
    sign language recognition with full multi-modal 218-dim input.

    Input shape  : (batch, 45, 218)   — multi-modal feature vector
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
        # x: (batch, 45, 218)

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
    NUM_CLASSES = 350
    model, optimizer, criterion = build_model(num_classes=NUM_CLASSES)
    print(model)
    total = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\nTrainable parameters: {total:,}")
    print(f"Input: (batch, {SEQUENCE_LENGTH}, {LANDMARK_VECTOR_SIZE})")

    dummy = torch.zeros(4, SEQUENCE_LENGTH, LANDMARK_VECTOR_SIZE)
    model.eval()
    with torch.no_grad():
        logits = model(dummy)
    assert logits.shape == (4, NUM_CLASSES), f"Unexpected shape: {logits.shape}"
    print(f"Smoke test passed — output shape: {tuple(logits.shape)}")
