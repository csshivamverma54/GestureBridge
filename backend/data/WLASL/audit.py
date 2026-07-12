import json
from pathlib import Path

base = Path(__file__).parent
json_path = base / "WLASL_v0.3.json"
missing_path = base / "missing.txt"
videos_dir = base / "videos"

with open(json_path, encoding="utf-8") as f:
    data = json.load(f)

with open(missing_path, encoding="utf-8") as f:
    missing = {l.strip() for l in f if l.strip()}

per_class = {}
for item in data:
    gloss = item["gloss"]
    total = 0
    usable = 0
    missing_count = 0
    absent = 0
    for inst in item.get("instances", []):
        vid_id = str(inst.get("video_id", ""))
        total += 1
        if vid_id in missing:
            missing_count += 1
            continue
        vp = videos_dir / f"{vid_id}.mp4"
        if not vp.exists():
            absent += 1
            continue
        sz = vp.stat().st_size
        if sz < 1000:
            absent += 1
            continue
        usable += 1
    per_class[gloss] = {
        "total": total,
        "usable": usable,
        "missing": missing_count,
        "absent": absent,
    }

out = [{"gloss": g, **v} for g, v in per_class.items()]
out.sort(key=lambda x: -x["usable"])

with open(base / "per_class_stats.json", "w") as f:
    json.dump(out, f, indent=2)

print(f"Total classes  : {len(out)}")
print(f"usable >= 5    : {sum(1 for x in out if x['usable'] >= 5)}")
print(f"usable >= 3    : {sum(1 for x in out if x['usable'] >= 3)}")
print(f"usable >= 2    : {sum(1 for x in out if x['usable'] >= 2)}")
print(f"usable == 1    : {sum(1 for x in out if x['usable'] == 1)}")
print(f"usable == 0    : {sum(1 for x in out if x['usable'] == 0)}")
print("\nTop 30 by usable samples:")
for x in out[:30]:
    print(f"  {x['gloss']:<32} usable={x['usable']}  total={x['total']}")
print("\nBottom 20 (by usable):")
for x in out[-20:]:
    print(f"  {x['gloss']:<32} usable={x['usable']}")
