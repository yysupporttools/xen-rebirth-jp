"""Local atlas. Two independent sightings promote titles/exits; no inferred reverse links."""
import json
import math
import re
from collections import deque
from pathlib import Path
from . import map_guide as guide


def title_name(raw):
    text = re.sub(r'[^A-Za-z0-9\x27 -]', '', raw).strip()
    text = re.sub(r'\s+', ' ', text)
    if not 3 <= len(text) <= 65 or not re.search(r'[A-Za-z]{3}', text):
        return ''
    if text.lower() in {'map', 'world map', 'inventory', 'quest', 'unknown'}:
        return ''
    canonical = guide.canonical_name(text)
    if canonical in guide.graph():
        return canonical
    short = re.search(r'\b(Eir|Yvel)\b', text, re.IGNORECASE)
    return guide.canonical_name(short.group(1)) if short else canonical


class Atlas:
    def __init__(self, path):
        self.path = Path(path)
        self.ignored = set()
        try:
            saved = json.loads(self.path.read_text(encoding='utf-8'))
            self.maps = saved['maps']
            self.ignored = set(saved.get('ignored', []))
        except (OSError, ValueError, KeyError):
            self.maps = {}
        self.pending = {}

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix('.tmp')
        temp.write_text(json.dumps({'version': 1, 'maps': self.maps, 'ignored': sorted(self.ignored)}, ensure_ascii=False), encoding='utf-8')
        temp.replace(self.path)

    def observe(self, name, exits):
        name = title_name(name)
        if not name or name in self.ignored:
            return False
        self.pending[name] = self.pending.get(name, 0) + 1
        if self.pending[name] < 2:
            return False
        record = self.maps.setdefault(name, {'exits': {}, 'visits': 0})
        record['visits'] += 1
        for target, point in exits.items():
            target = title_name(target)
            if not target or target == name or len(point) != 2:
                continue
            if not all(isinstance(v, (int, float)) and math.isfinite(v) and 0 <= v <= 508 for v in point):
                continue
            previous = record['exits'].get(target)
            stable = previous and sum((previous['point'][i] - point[i]) ** 2 for i in (0, 1)) < 35 ** 2
            record['exits'][target] = {'point': list(point), 'count': previous['count'] + 1 if stable else 1}
        self.save()
        return True

    def graph(self):
        links = guide.graph()
        for name, record in self.maps.items():
            links.setdefault(name, set())
            for target, exit_ in record['exits'].items():
                if exit_['count'] >= 2:
                    links[name].add(target)
                    links.setdefault(target, set())
        return links

    def route(self, start, goal, transports=False):
        graph = self.graph()
        queue = deque([(start, [start])])
        visited = {start}
        while queue:
            current, path = queue.popleft()
            if current == goal and current in graph:
                return path
            for following in sorted(graph.get(current, ())):
                if following in visited or (not transports and guide.is_teleport_edge(current, following)):
                    continue
                visited.add(following)
                queue.append((following, path + [following]))
        return []

    def point(self, source, target):
        data = self.maps.get(source, {}).get('exits', {}).get(target)
        return data['point'] if data and data['count'] >= 2 else None

    def remove(self, name):
        self.ignored.add(name)
        self.maps.pop(name, None)
        self.pending.pop(name, None)
        for record in self.maps.values():
            record['exits'].pop(name, None)
        self.save()
