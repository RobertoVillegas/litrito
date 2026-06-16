import csv, glob, math, re, unicodedata, json, os, shutil
from collections import defaultdict

def norm(s):
    if not s: return ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip()

BRANDS = [
 ("Pemex", r"\bpemex\b"), ("G500", r"\bg\s?500\b"), ("Mobil", r"\bmobil\b"),
 ("Shell", r"\bshell\b"), ("BP", r"\bbp\b"), ("Repsol", r"\brepsol\b"),
 ("Chevron", r"\bchevron\b"), ("TotalEnergies", r"\btotal\b"), ("Arco", r"\barco\b"),
 ("Oxxo Gas", r"\boxxo\b"), ("Gulf", r"\bgulf\b"), ("Hidrosina", r"\bhidrosina\b"),
 ("Orsan", r"\borsan\b"), ("Gazpro", r"\bgazpro\b"), ("Petro-7", r"\bpetro[\s-]?7\b|\bpetro\s?seven\b|\b7[\s-]?eleven\b"),
 ("Rendichicas", r"\brendichicas?\b"), ("FullGas", r"\bfull\s?gas\b"), ("Akron", r"\bakron\b"),
 ("Redco", r"\bredco\b"), ("La Gas", r"\bla\s?gas\b"), ("Petromax", r"\bpetromax\b"),
 ("GOGAS", r"\bgogas\b"), ("Combured", r"\bcombured\b"), ("Costco", r"\bcostco\b"),
 ("Walmart", r"\bwalmart\b"), ("Carso", r"\bcarso\b"), ("Valero", r"\bvalero\b"),
 ("Octano", r"\boctano\b"), ("Lodemo", r"\blodemo\b"), ("Caza", r"\bcaza\b"),
 ("Chedraui", r"\bchedraui\b"), ("Soriana", r"\bsoriana\b"),
]
BRANDS = [(b, re.compile(r)) for b, r in BRANDS]
RAZON = re.compile(r"\b(s\.?a\.?|de\s?c\.?v\.?|s\s?de\s?rl|sapi|scp)\b")

def derive_brand(name, brand_field):
    for src in (brand_field, name):
        nn = norm(src)
        for b, rx in BRANDS:
            if rx.search(nn): return b
    # keep an overture brand value if it doesn't look like a legal entity name
    if brand_field and brand_field.strip() and not RAZON.search(norm(brand_field)):
        return brand_field.strip()
    return None

pois = []
with open("/tmp/overture_mx_fuel2.csv") as f:
    for r in csv.DictReader(f):
        try: lat=float(r["lat"]); lon=float(r["lon"])
        except: continue
        pois.append((lat, lon, r.get("name","") or "", r.get("brand","") or "", r.get("id","") or ""))

CELL=0.01
grid=defaultdict(list)
for i,p in enumerate(pois):
    grid[(round(p[0]/CELL), round(p[1]/CELL))].append(i)

def haversine(la1,lo1,la2,lo2):
    R=6371000; p=math.pi/180
    dla=(la2-la1)*p; dlo=(lo2-lo1)*p
    a=math.sin(dla/2)**2+math.cos(la1*p)*math.cos(la2*p)*math.sin(dlo/2)**2
    return 2*R*math.asin(math.sqrt(a))

THRESH=80
def best_match(lat, lon):
    cands=[]
    cy=round(lat/CELL); cx=round(lon/CELL)
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            for i in grid.get((cy+dy,cx+dx),[]):
                pla,plo,nm,br,pid=pois[i]
                d=haversine(lat,lon,pla,plo)
                if d<=THRESH: cands.append((d,nm,br,pid))
    if not cands: return None
    # prefer the closest candidate that yields a chain brand; else closest overall
    branded=[c for c in cands if derive_brand(c[1],c[2])]
    pick=min(branded, key=lambda c:c[0]) if branded else min(cands, key=lambda c:c[0])
    d,nm,br,pid=pick
    return {"brand":derive_brand(nm,br),"displayName":nm or None,"sourceId":pid or None,
            "sourceName":nm or None,"matchDistanceMeters":round(d)}

stcsv=sorted(glob.glob("/Users/rob/Developer/litrito/data/stations-*.csv"))[-1]
rows=[]
for r in csv.DictReader(open(stcsv)):
    try: lat=float(r["latitude"]); lon=float(r["longitude"])
    except: continue
    m=best_match(lat,lon)
    if not m: continue
    row={"permitNumber":r["permitNumber"], **m}
    rows.append({k:v for k,v in row.items() if v is not None})

branded=sum(1 for x in rows if x.get("brand"))
print(f"matched rows: {len(rows)}  withBrand: {branded}")

outdir="/tmp/enr_batches"; shutil.rmtree(outdir, ignore_errors=True); os.makedirs(outdir)
BATCH=150
for i in range(0,len(rows),BATCH):
    batch=rows[i:i+BATCH]
    payload={"source":"overture","sourceRelease":"overture-2026-05-20.0","rows":batch}
    with open(f"{outdir}/b{i//BATCH:03d}.json","w") as f:
        json.dump(payload,f,ensure_ascii=False)
print(f"wrote {len(os.listdir(outdir))} batch files to {outdir}")
