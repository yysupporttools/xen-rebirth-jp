"""Fetch the public schedule used by Xen Rebirth's official boss timer.
No recurring schedule is guessed; timestamps are absolute UTC seconds.
"""
import argparse
import datetime as dt
import email.utils
import json
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://www.xenrebirth.com/events.php'
KNOWN = {
    'w1': ('Super Hippogras', 'Essene Shipdock', 'hippo.png'),
    'w2': ('Snake Dragon Hematosou', 'Temple of Pansidia', 'snaked.png'),
    'w3': ('Ra of the Obelisk', 'Hellein Plateau', 'ra.png'),
    'w4': ('Amaranth Wyrm', 'Amorica Cave', 'amaranth.png'),
}

def normalize(raw, now):
    if not isinstance(raw, dict) or not raw:
        raise ValueError('Empty or unexpected schedule')
    result = []
    for key, row in raw.items():
        boss_id = row.get('id')
        if boss_id not in KNOWN:
            raise ValueError('Unrecognized boss: ' + str(boss_id))
        end = int(row['despawn'])
        # The official endpoint uses key 0 for the current one-hour window.
        start = int(key) if int(key) > 0 else end - 3600
        if not (0 < end-start <= 86400) or abs(start-now) > 7*86400:
            raise ValueError('Unexpected event timestamp')
        if start > now and abs((start-now)-float(row['timeleft'])) > 180:
            raise ValueError('Server timestamp mismatch')
        name, location, image = KNOWN[boss_id]
        result.append(dict(id=boss_id, name=name, location=location,
                           image='assets/bosses/'+image, start=start*1000, end=end*1000))
    result.sort(key=lambda row: row['start'])
    if not any(row['start'] > now*1000 for row in result):
        raise ValueError('No future events')
    return dict(source=URL, fetchedAt=int(now*1000),
                validUntil=max(row['end'] for row in result), events=result)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--images', action='store_true')
    args=parser.parse_args()
    request=urllib.request.Request(URL, headers={'User-Agent':'Mozilla/5.0 (Xen-Rebirth-JP-Guide; schedule refresh)'})
    with urllib.request.urlopen(request, timeout=30) as response:
        date=response.headers.get('Date')
        now=email.utils.parsedate_to_datetime(date).timestamp() if date else time.time()
        data=normalize(json.load(response),now)
    folder=ROOT/'dist/assets'
    folder.mkdir(parents=True,exist_ok=True)
    serialized=json.dumps(data, ensure_ascii=False, indent=2)
    for filename, content in [('boss-data.js','window.BOSS_DATA = '+serialized+';\n'),('boss-data.json',serialized+'\n')]:
        path=folder/filename
        temporary=path.with_suffix('.tmp')
        temporary.write_text(content,encoding='utf-8')
        temporary.replace(path)
    if args.images:
        image_dir=folder/'bosses';image_dir.mkdir(exist_ok=True)
        for _,_,image in KNOWN.values():
            r=urllib.request.Request('https://www.xenrebirth.com/images/db/events/'+image,headers={'User-Agent':'Mozilla/5.0'})
            with urllib.request.urlopen(r,timeout=30) as response:
                (image_dir/image).write_bytes(response.read())
    print('Updated',len(data['events']),'events at',dt.datetime.fromtimestamp(now,dt.timezone.utc).isoformat())

if __name__=='__main__':
    main()
