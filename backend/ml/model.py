import torch
import torch.nn as nn
import torch.nn.functional as F


SEQUENCE_LENGTH = 45
LANDMARK_VECTOR_SIZE = 218


# Soft attention over the time axis; returns weighted sum (batch, H) from (batch, T, H)
class TemporalAttention(nn.Module):
    def __init__(self, hidden_size: int):
        super().__init__()
        self.attn = nn.Linear(hidden_size, 1, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        scores  = self.attn(x).squeeze(-1)
        weights = F.softmax(scores, dim=-1)
        context = (weights.unsqueeze(-1) * x).sum(dim=1)
        return context


# Two-layer BiLSTM + temporal attention for ASL recognition; input (batch, 45, 218)
class GestureBridgeLSTM(nn.Module):
    def __init__(self, num_classes: int):
        super().__init__()
        self.lstm1 = nn.LSTM(
            input_size=LANDMARK_VECTOR_SIZE,
            hidden_size=128,
            num_layers=1,
            batch_first=True,
            bidirectional=True,
        )
        self.drop1 = nn.Dropout(0.4)
        self.lstm2 = nn.LSTM(
            input_size=256,
            hidden_size=64,
            num_layers=1,
            batch_first=True,
            bidirectional=True,
        )
        self.drop2 = nn.Dropout(0.3)
        self.attention = TemporalAttention(hidden_size=128)
        self.fc1    = nn.Linear(128, 256)
        self.bn1    = nn.BatchNorm1d(256)
        self.drop3  = nn.Dropout(0.4)
        self.out    = nn.Linear(256, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x, _ = self.lstm1(x)
        x = self.drop1(x)
        x, _ = self.lstm2(x)
        x = self.drop2(x)
        x = self.attention(x)
        x = F.relu(self.bn1(self.fc1(x)))
        x = self.drop3(x)
        x = self.out(x)
        return x


# Build the GestureBridge model with Adam optimizer and CrossEntropyLoss
def build_model(num_classes: int, learning_rate: float = 1e-3):
    model = GestureBridgeLSTM(num_classes=num_classes)
    optimizer = torch.optim.Adam(
        model.parameters(),
        lr=learning_rate,
        weight_decay=1e-4,
    )
    criterion = nn.CrossEntropyLoss()
    return model, optimizer, criterion


# Load a previously saved GestureBridge model from a .pt file
def load_saved_model(model_path: str, num_classes: int) -> "GestureBridgeLSTM":
    model = GestureBridgeLSTM(num_classes=num_classes)
    state = torch.load(model_path, map_location="cpu", weights_only=True)
    model.load_state_dict(state)
    model.eval()
    return model


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
