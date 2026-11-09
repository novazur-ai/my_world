# Tito : squelette humanoïde chibi + os de cape et de cheveux, pondération automatique corrigée par zones
import bpy, os, math, bmesh
from mathutils import Vector

bpy.ops.wm.open_mainfile(filepath=os.path.abspath('tito_low.blend'))
ob = [o for o in bpy.data.objects if o.type == 'MESH'][0]
ob.name = 'Tito'; ob.data.name = 'Tito'

# ---------- squelette (coordonnées Blender : X = gauche du personnage, -Y = avant, Z = haut) ----------
B = {
  # nom : (tête, queue, parent, déforme)
  'root':        ((0, -0.04, -0.97), (0, -0.04, -0.80), None, False),
  'hips':        ((0, -0.06, -0.44), (0, -0.07, -0.24), 'root', True),
  'spine':       ((0, -0.07, -0.24), (0, -0.08, -0.02), 'hips', True),
  'chest':       ((0, -0.08, -0.02), (0, -0.07, 0.15), 'spine', True),
  'neck':        ((0, -0.07, 0.15), (0, -0.05, 0.24), 'chest', True),
  'head':        ((0, -0.05, 0.24), (0, -0.05, 0.90), 'neck', True),
  'shoulder.R':  ((-0.06, -0.08, 0.08), (-0.24, -0.06, 0.0), 'chest', True),
  'upper_arm.R': ((-0.24, -0.06, 0.0), (-0.45, 0.03, -0.10), 'shoulder.R', True),
  'forearm.R':   ((-0.45, 0.03, -0.10), (-0.58, -0.02, -0.14), 'upper_arm.R', True),
  'hand.R':      ((-0.58, -0.02, -0.14), (-0.68, -0.06, -0.16), 'forearm.R', True),
  'shoulder.L':  ((0.06, -0.08, 0.08), (0.24, -0.08, 0.0), 'chest', True),
  'upper_arm.L': ((0.24, -0.08, 0.0), (0.33, -0.20, -0.13), 'shoulder.L', True),
  'forearm.L':   ((0.33, -0.20, -0.13), (0.40, -0.38, -0.22), 'upper_arm.L', True),
  'hand.L':      ((0.40, -0.38, -0.22), (0.42, -0.52, -0.28), 'forearm.L', True),
  'thigh.R':     ((-0.14, -0.06, -0.47), (-0.15, -0.08, -0.71), 'hips', True),
  'shin.R':      ((-0.15, -0.08, -0.71), (-0.15, -0.02, -0.88), 'thigh.R', True),
  'foot.R':      ((-0.15, -0.02, -0.88), (-0.15, -0.24, -0.94), 'shin.R', True),
  'thigh.L':     ((0.15, -0.06, -0.47), (0.17, -0.08, -0.71), 'hips', True),
  'shin.L':      ((0.17, -0.08, -0.71), (0.17, -0.02, -0.88), 'thigh.L', True),
  'foot.L':      ((0.17, -0.02, -0.88), (0.17, -0.24, -0.94), 'shin.L', True),
}
CAPE = {
  'C': [(0, 0.12, 0.10), (0, 0.26, -0.14), (0, 0.33, -0.38), (0, 0.38, -0.62)],
  'L': [(0.20, 0.06, 0.08), (0.38, 0.12, -0.15), (0.53, 0.14, -0.38), (0.63, 0.12, -0.60)],
  'R': [(-0.20, 0.08, 0.08), (-0.28, 0.16, -0.18), (-0.31, 0.21, -0.42), (-0.32, 0.22, -0.60)],
}
HAIR = [(0, 0.22, 0.42), (0, 0.36, 0.26), (0, 0.42, 0.08)]

arm_d = bpy.data.armatures.new('Rig'); arm = bpy.data.objects.new('Rig', arm_d); bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
eb = arm_d.edit_bones
for n, (h, t, p, d) in B.items():
    b = eb.new(n); b.head = h; b.tail = t; b.use_deform = d
    if p: b.parent = eb[p]; b.use_connect = (Vector(eb[p].tail) - Vector(h)).length < 1e-4
for side, pts in CAPE.items():
    prev = 'chest'
    for i in range(3):
        b = eb.new(f'cape.{side}.{i+1}'); b.head = pts[i]; b.tail = pts[i+1]; b.parent = eb[prev]; b.use_connect = i > 0; prev = b.name
prev = 'head'
for i in range(2):
    b = eb.new(f'hair.{i+1}'); b.head = HAIR[i]; b.tail = HAIR[i+1]; b.parent = eb[prev]; b.use_connect = i > 0; prev = b.name
# orientation des os : axe Z local vers l'avant (-Y monde) pour des rotations lisibles
for b in eb:
    b.align_roll(Vector((0, -1, 0)) if abs((b.tail - b.head).normalized().y) < .9 else Vector((0, 0, 1)))
bpy.ops.object.mode_set(mode='OBJECT')

# ---------- pondération automatique (chaleur) sur les os du corps ----------
for b in arm_d.bones:
    b.use_deform = not (b.name.startswith('cape') or b.name.startswith('hair') or b.name == 'root')
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
for b in arm_d.bones:
    b.use_deform = b.name != 'root'

# ---------- zones par couleur de texture : cape (rouge) et cheveux ----------
img = bpy.data.images['Image_0']; W, H = img.size; px = list(img.pixels)
me = ob.data; uv = me.uv_layers.active.data
col = [[0, 0, 0, 0] for _ in me.vertices]
for poly in me.polygons:
    for li in poly.loop_indices:
        u, v = uv[li].uv; x = min(W - 1, max(0, int(u*W))); y = min(H - 1, max(0, int(v*H))); k = (y*W + x)*4
        c = col[me.loops[li].vertex_index]; c[0] += px[k]; c[1] += px[k+1]; c[2] += px[k+2]; c[3] += 1
col = [(c[0]/c[3], c[1]/c[3], c[2]/c[3]) if c[3] else (0, 0, 0) for c in col]

for n in [f'cape.{s}.{i}' for s in 'CLR' for i in (1, 2, 3)] + ['hair.1', 'hair.2']:
    if n not in ob.vertex_groups: ob.vertex_groups.new(name=n)
VG = {g.name: g for g in ob.vertex_groups}
def seg_dist(p, a, b):
    a, b = Vector(a), Vector(b); ab = b - a; t = max(0, min(1, (p - a).dot(ab)/ab.length_squared)); return (p - (a + ab*t)).length, t
def set_w(v, weights):
    for g in VG.values():
        try: g.remove([v.index])
        except RuntimeError: pass
    s = sum(weights.values()) or 1
    for n, w in weights.items():
        if w/s > 0.01: VG[n].add([v.index], w/s, 'REPLACE')

LIMBS = ['upper_arm.R','forearm.R','hand.R','upper_arm.L','forearm.L','hand.L','thigh.R','shin.R','foot.R','thigh.L','shin.L','foot.L']
cape_n = hair_n = 0
for v in me.vertices:
    p = v.co; r, g, b = col[v.index]
    is_red = r > 0.42 and r > g*3.2 and r > b*2.4
    near_limb = min(seg_dist(p, B[n][0], B[n][1])[0] for n in LIMBS) < 0.085
    if near_limb: is_red = False
    # cape : rouge, sous la nuque, pas sur le devant du torse (fermoirs exclus)
    if is_red and p.z < 0.16 and not (p.y < -0.12 and abs(p.x) < 0.2 and p.z > -0.1):
        ws = {}
        for s, pts in CAPE.items():
            for i in range(3):
                d, t = seg_dist(p, pts[i], pts[i+1]); ws[f'cape.{s}.{i+1}'] = 1/(d**3 + 1e-4)
        top = max(0.0, min(1.0, (p.z - 0.0)/0.14))   # haut de la cape : reste accroché au buste
        tot = sum(ws.values()); ws = {k: w/tot*(1 - top) for k, w in ws.items()}
        if top > 0: ws['chest'] = top
        set_w(v, ws); cape_n += 1; continue
    # tête entière (visage, barbe, cheveux) au-dessus du cou
    if p.z > 0.2 or (p.z > 0.08 and p.y > 0.05 and not is_red) or (p.z > 0.1 and abs(p.x) > 0.24 and p.y > -0.15 and not is_red):
        ws = {'head': 1.0}
        if p.y > 0.18 and p.z < 0.42:   # mèches du dos : un peu de souplesse
            d, t = seg_dist(p, HAIR[0], HAIR[2]); k = 0.6*max(0, min(1, (0.42 - p.z)/0.3))
            ws = {'head': 1 - k, 'hair.1': k*(1 - t), 'hair.2': k*t}
        elif 0.15 < p.z < 0.24 and abs(p.x) < 0.16 and p.y < 0.05:
            k = (p.z - 0.15)/0.09; ws = {'head': k, 'neck': 1 - k}
        set_w(v, ws); hair_n += 1
print('sommets cape', cape_n, 'tête/cheveux', hair_n, 'total', len(me.vertices))
# normalisation + limite de 4 influences par sommet (glTF)
bpy.context.view_layer.objects.active = ob; ob.select_set(True)
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_limit_total(limit=4); bpy.ops.object.vertex_group_normalize_all(lock_active=False)
bpy.ops.object.mode_set(mode='OBJECT')
empty = [v.index for v in me.vertices if not v.groups]
print('sommets sans poids', len(empty))
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('tito_rig.blend'))
