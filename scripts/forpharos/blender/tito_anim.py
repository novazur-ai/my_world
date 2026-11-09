# Tito : épée à part fixée à la main + 6 animations, puis export GLB optimisé pour le mobile
import bpy, os, math, sys
from mathutils import Vector, Quaternion, Matrix

bpy.ops.wm.open_mainfile(filepath=os.path.abspath('tito_rig.blend'))
sc = bpy.context.scene; sc.render.fps = 24
arm = bpy.data.objects['Rig']; tito = bpy.data.objects['Tito']
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))

# ---------- épée (lame d'acier, garde et pommeau dorés, poignée de cuir) ----------
def mat(name, rgb, metal, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True; p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*rgb, 1); p.inputs['Metallic'].default_value = metal; p.inputs['Roughness'].default_value = rough; return m
M_STEEL, M_GOLD, M_LEATHER = mat('Acier', (0.62, 0.64, 0.68), 0.9, 0.28), mat('Or', (0.95, 0.66, 0.16), 0.9, 0.35), mat('Cuir', (0.24, 0.12, 0.06), 0.0, 0.7)
import bmesh
def mk(name, verts, faces, matl, smooth_angle=None):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o); me.materials.append(matl)
    for pl in me.polygons: pl.use_smooth = True
    return o
def lathe(name, prof, matl, seg=24, z0=0.0):
    # prof : liste (rayon, z) ; révolution autour de l'axe Z
    V, F = [], []
    for r, z in prof:
        for k in range(seg): a = 2*math.pi*k/seg; V.append((r*math.cos(a), r*math.sin(a), z0 + z))
    for i in range(len(prof) - 1):
        for k in range(seg): a, b = i*seg + k, i*seg + (k + 1) % seg; F.append((a, b, b + seg, a + seg))
    V.append((0, 0, z0 + prof[0][1])); c0 = len(V) - 1; V.append((0, 0, z0 + prof[-1][1])); c1 = len(V) - 1
    for k in range(seg): F.append((c0, (k + 1) % seg, k)); F.append((c1, (len(prof) - 1)*seg + k, (len(prof) - 1)*seg + (k + 1) % seg))
    return mk(name, V, F, matl)
parts = []
# --- lame : section en losange avec gorge centrale, pointe en ogive ---
Z0, Z1 = -0.088, -0.66; N = 34; V = []; F = []
def half_w(t):   # t = 0 à la garde, 1 à la pointe
    base = 0.026 - 0.006*t
    if t > 0.78: u = (t - 0.78)/0.22; base *= math.sqrt(max(0.0, 1 - u*u))
    return base
for i in range(N + 1):
    t = i/N; z = Z0 + (Z1 - Z0)*t; w = half_w(t); th = 0.0065*(1 - 0.55*t) if t < 1 else 0.0
    fz = max(0.0, 1 - t/0.62)   # gorge qui s'estompe avant la pointe
    g = 0.0035*fz
    ring = [(-w, 0, z), (-w*0.42, th, z), (0, th - g, z), (w*0.42, th, z), (w, 0, z), (w*0.42, -th, z), (0, -th + g, z), (-w*0.42, -th, z)]
    V.extend(ring)
for i in range(N):
    for k in range(8): a, b = i*8 + k, i*8 + (k + 1) % 8; F.append((a, b, b + 8, a + 8))
V.append((0, 0, Z1 - 0.004)); tip = len(V) - 1
for k in range(8): F.append((N*8 + k, N*8 + (k + 1) % 8, tip))
F.append(tuple(range(7, -1, -1)))
blade = mk('Lame', V, F, M_STEEL); parts.append(blade)
# --- garde : barre recourbée vers la lame, extrémités en boules, écusson central ---
V = []; F = []; seg = 9; NG = 14
for i in range(NG + 1):
    t = i/NG; x = -0.105 + 0.21*t; c = (2*t - 1); z = -0.075 - 0.022*c*c; r = 0.0115 + 0.004*(1 - abs(c))
    for k in range(seg):
        a = 2*math.pi*k/seg; V.append((x, r*math.cos(a)*0.85, z + r*math.sin(a)))
for i in range(NG):
    for k in range(seg): a, b = i*seg + k, i*seg + (k + 1) % seg; F.append((a, b, b + seg, a + seg))
F.append(tuple(range(seg - 1, -1, -1))); F.append(tuple(NG*seg + k for k in range(seg)))
parts.append(mk('Garde', V, F, M_GOLD))
for dx in (-0.108, 0.108):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.019, location=(dx, 0, -0.098), segments=10, ring_count=7); o = bpy.context.active_object; o.data.materials.append(M_GOLD); parts.append(o)
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, 0, -0.08), segments=12, ring_count=8); o = bpy.context.active_object; o.scale = (0.03, 0.017, 0.026); o.data.materials.append(M_GOLD); parts.append(o)
M_GEM = mat('Gemme', (0.55, 0.06, 0.08), 0.1, 0.15)
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, -0.015, -0.08), segments=8, ring_count=6); o = bpy.context.active_object; o.scale = (0.011, 0.006, 0.011); o.data.materials.append(M_GEM); parts.append(o)
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, 0.015, -0.08), segments=8, ring_count=6); o = bpy.context.active_object; o.scale = (0.011, 0.006, 0.011); o.data.materials.append(M_GEM); parts.append(o)
# --- poignée gainée de cuir (spirale de lanières), viroles dorées ---
prof = []
for i in range(25):
    z = -0.058 + 0.116*i/24; prof.append((0.0155 + 0.0018*abs(math.sin(i*math.pi/3)), z))
parts.append(lathe('Poignee', prof, M_LEATHER, seg=10))
parts.append(lathe('Virole1', [(0.0, 0), (0.019, 0), (0.021, 0.006), (0.019, 0.012), (0.0, 0.012)], M_GOLD, seg=12, z0=-0.066))
parts.append(lathe('Virole2', [(0.0, 0), (0.019, 0), (0.021, 0.006), (0.019, 0.012), (0.0, 0.012)], M_GOLD, seg=12, z0=0.054))
# --- pommeau en disque avec bouton ---
bpy.ops.mesh.primitive_cylinder_add(radius=0.03, depth=0.022, location=(0, 0, 0.095), rotation=(math.pi/2, 0, 0), vertices=16); o = bpy.context.active_object; o.data.materials.append(M_GOLD); parts.append(o)
bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.006, segments=2, affect='EDGES'); bm.to_mesh(o.data); bm.free()
for dy in (-0.012, 0.012):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.011, location=(0, dy, 0.095), segments=8, ring_count=6); o = bpy.context.active_object; o.data.materials.append(M_GEM); parts.append(o)
parts.append(lathe('Bouton', [(0.0, 0), (0.008, 0), (0.007, 0.012), (0.0, 0.016)], M_GOLD, seg=8, z0=0.122))
bpy.ops.object.select_all(action='DESELECT')
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join(); sword = bpy.context.active_object; sword.name = 'Epee'; sword.data.name = 'Epee'
# origine de l'épée = centre de la poignée (point tenu dans le poing)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
# position au repos : poignée dans le poing droit, lame qui sort du poing vers le HAUT (pommeau sous le poing)
sword.location = (-0.635, -0.055, -0.135); sword.rotation_euler = (math.radians(180 - 12), 0, 0)
bpy.context.view_layer.update()
mw = sword.matrix_world.copy(); sword.parent = arm; sword.parent_type = 'BONE'; sword.parent_bone = 'hand.R'; sword.matrix_world = mw

# ---------- outils d'animation ----------
REST = {pb.name: pb.bone.matrix_local.to_3x3() for pb in arm.pose.bones}
def qw(rots):
    q = Quaternion()
    for ax, deg in rots: q = Quaternion(ax, math.radians(deg)) @ q
    return q
def pose(spec, loc=None):
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'; pb.location = (0, 0, 0)
        r = spec.get(pb.name, [])
        R = REST[pb.name]; pb.rotation_quaternion = (R.inverted() @ qw(r).to_matrix() @ R).to_quaternion()
    if loc:
        R = REST['root']; arm.pose.bones['root'].location = R.inverted() @ Vector(loc)
def aim(target):
    if target is None: return
    bpy.context.view_layer.update()
    m = sword.matrix_world; d = ((m @ Vector((0, 0, -0.5))) - m.translation).normalized()
    qd = d.rotation_difference(Vector(target).normalized())
    pb = arm.pose.bones['hand.R']; mm = pb.matrix.copy()
    pb.matrix = Matrix.Translation(mm.translation) @ (qd.to_matrix() @ mm.to_3x3()).to_4x4()
    bpy.context.view_layer.update()
def key(f):
    for pb in arm.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=f); pb.keyframe_insert('location', frame=f)
def action(name, frames, cyclic):
    a = bpy.data.actions.new(name); a.use_fake_user = True
    arm.animation_data_create(); arm.animation_data.action = a
    for it in frames:
        f, spec, loc = it[:3]; pose(spec, loc); aim(it[3] if len(it) > 3 else AIM); key(f)
    a.frame_range = (frames[0][0], frames[-1][0]); a.use_frame_range = True; a.use_cyclic = cyclic
    return a
def merge(*ds):
    out = {}
    for d in ds:
        for k, v in d.items(): out.setdefault(k, []).extend(v)
    return out
s = lambda ph: math.sin(ph*2*math.pi)

# posture de base : bras droit abaissé, épée vers le sol légèrement en avant
BASE = {'upper_arm.R': [(Y, -52), (Z, 14)], 'forearm.R': [(Z, 10)],
        'upper_arm.L': [(Y, 6)], 'cape.L.1': [(Y, -10)], 'cape.C.1': [(X, 4)]}

AIM = (-0.22, -0.42, 0.88)   # garde haute : lame dressée, vers l'avant et l'extérieur
# 1. Attente (respiration, cheveux et cape qui ondulent)
fr = []
for i in range(5):
    f = 1 + i*12; ph = i/4
    fr.append((f, merge(BASE, {'chest': [(X, 2*s(ph))], 'spine': [(X, -1*s(ph))], 'head': [(Z, 3*s(ph + .25)), (X, -1.5*s(ph))],
        'hair.1': [(X, -4*s(ph + .1))], 'hair.2': [(X, -5*s(ph + .2))],
        'cape.C.2': [(X, 3*s(ph + .1))], 'cape.C.3': [(X, 4*s(ph + .2))], 'cape.L.2': [(X, 3*s(ph + .15))], 'cape.L.3': [(X, 5*s(ph + .25))], 'cape.R.2': [(X, 3*s(ph + .2))], 'cape.R.3': [(X, 4*s(ph + .3))],
        'upper_arm.L': [(X, 2*s(ph))], 'upper_arm.R': [(X, -2*s(ph))]}), (0, 0, 0.006*s(ph))))
action('Attente', fr, True)

# 2. Course (cycle de 16 images)
fr = []
for i in range(9):
    f = 1 + i*2; ph = i/8; a = s(ph); c = math.cos(ph*2*math.pi)
    fr.append((f, merge({k: v for k, v in BASE.items() if not k.startswith('cape')}, {
        'thigh.R': [(X, -34*a)], 'thigh.L': [(X, 34*a)],
        'shin.R': [(X, 50*max(0, a) + 10)], 'shin.L': [(X, 50*max(0, -a) + 10)],
        'foot.R': [(X, -18*max(0, c))], 'foot.L': [(X, -18*max(0, -c))],
        'hips': [(Z, -8*a)], 'spine': [(X, 12), (Z, 6*a)], 'chest': [(Z, 4*a)], 'head': [(X, -8), (Z, -6*a)],
        'upper_arm.R': [(X, 24*a), (Y, 14)], 'upper_arm.L': [(X, -30*a)], 'forearm.L': [(X, -20)],
        'cape.C.1': [(X, 28)], 'cape.C.2': [(X, 14 + 8*s(ph*2))], 'cape.C.3': [(X, 14 + 10*s(ph*2 + .2))],
        'cape.L.1': [(X, 24), (Y, -8)], 'cape.L.2': [(X, 12 + 8*s(ph*2 + .1))], 'cape.L.3': [(X, 12 + 10*s(ph*2 + .3))],
        'cape.R.1': [(X, 24)], 'cape.R.2': [(X, 12 + 8*s(ph*2 + .15))], 'cape.R.3': [(X, 12 + 10*s(ph*2 + .35))],
        'hair.1': [(X, 12 + 5*s(ph*2))], 'hair.2': [(X, 8 + 6*s(ph*2 + .2))]}), (0, 0, 0.035*abs(c)), (-0.65, -0.30, 0.70)))
action('Course', fr, True)

# 3. Attaque (élan, coup d'épée en diagonale, retour)
WIND = merge(BASE, {'upper_arm.R': [(Y, 62), (Z, -48)], 'forearm.R': [(Y, 30)],
        'spine': [(Z, -22), (X, -4)], 'chest': [(Z, -12)], 'head': [(Z, 18)], 'thigh.R': [(X, 10)], 'thigh.L': [(X, -18)], 'shin.L': [(X, 14)],
        'cape.C.1': [(X, 10)], 'cape.R.1': [(X, 10)], 'upper_arm.L': [(Z, -10), (Y, 20)]})
SLASH = merge(BASE, {'upper_arm.R': [(Y, 10), (Z, 75)], 'forearm.R': [(Z, 15)],
        'spine': [(Z, 26), (X, 14)], 'chest': [(Z, 12)], 'head': [(Z, -16), (X, -6)], 'thigh.R': [(X, -38)], 'shin.R': [(X, 26)], 'thigh.L': [(X, 22)], 'shin.L': [(X, 10)],
        'cape.C.1': [(X, 22)], 'cape.C.2': [(X, 12)], 'cape.L.1': [(X, 20)], 'cape.R.1': [(X, 26)], 'hair.1': [(X, 10)], 'upper_arm.L': [(Y, 30), (Z, -20)]})
action('Attaque', [(1, BASE, (0, 0, 0)), (8, WIND, (0, 0.04, -0.02), (-0.55, 0.05, 0.83)), (11, merge(WIND, {}), (0, 0.03, -0.02), (-0.52, 0.02, 0.85)), (14, SLASH, (0, -0.14, -0.05), (0.70, -0.48, -0.53)),
                   (19, SLASH, (0, -0.15, -0.05), (0.72, -0.42, -0.55)), (28, BASE, (0, 0, 0))], False)

# 4. Coup reçu (recul, tête rejetée, retour)
HIT = merge(BASE, {'spine': [(X, -16)], 'chest': [(X, -10)], 'head': [(X, -16), (Z, 8)], 'upper_arm.L': [(Y, 30), (X, 20)], 'upper_arm.R': [(Y, 20)],
        'thigh.R': [(X, 8)], 'thigh.L': [(X, -6)], 'cape.C.1': [(X, -10)], 'cape.C.2': [(X, -8)], 'hair.1': [(X, -12)], 'hair.2': [(X, -10)]})
action('CoupRecu', [(1, BASE, (0, 0, 0)), (4, HIT, (0, 0.08, 0.01)), (9, merge(BASE, {'spine': [(X, -6)], 'head': [(X, -5)]}), (0, 0.04, 0)), (17, BASE, (0, 0, 0))], False)

# 5. Victoire (élan, saut, épée levée au ciel, tenue)
CROUCH = merge(BASE, {'thigh.R': [(X, -24)], 'thigh.L': [(X, -24)], 'shin.R': [(X, 40)], 'shin.L': [(X, 40)], 'foot.R': [(X, -16)], 'foot.L': [(X, -16)], 'spine': [(X, 10)]})
RAISE = {'upper_arm.R': [(Y, 35), (Z, 10)], 'forearm.R': [(Y, 20)], 'upper_arm.L': [(Y, -20), (Z, -25)], 'forearm.L': [(Z, -60)],
         'head': [(X, 10)], 'chest': [(X, -6)], 'cape.C.1': [(X, -6)], 'cape.C.2': [(X, -10)], 'cape.L.2': [(X, -8)], 'hair.1': [(X, -8)]}
action('Victoire', [(1, BASE, (0, 0, 0)), (7, CROUCH, (0, 0, -0.07)), (13, merge(RAISE, {'thigh.R': [(X, 8)], 'shin.R': [(X, 30)], 'shin.L': [(X, 14)], 'cape.C.2': [(X, 18)], 'cape.C.3': [(X, 20)]}), (0, 0, 0.16), (-0.15, -0.10, 0.98)),
                    (19, merge(RAISE, {'thigh.R': [(X, -10)], 'thigh.L': [(X, -10)], 'shin.R': [(X, 20)], 'shin.L': [(X, 20)]}), (0, 0, -0.03), (-0.15, -0.10, 0.98)),
                    (25, RAISE, (0, 0, 0), (-0.15, -0.10, 0.98)), (37, merge(RAISE, {'head': [(X, 12), (Z, 5)], 'chest': [(X, -8)]}), (0, 0, 0.004), (-0.13, -0.08, 0.99))], False)

# 6. Défense (garde basse, épée en travers, souffle)
fr = []
for i in range(3):
    f = 1 + i*12; ph = i/2
    fr.append((f, merge(BASE, {'upper_arm.R': [(Y, 70), (Z, 80)], 'forearm.R': [(Z, 55)],
        'upper_arm.L': [(Y, 25), (Z, -30)], 'forearm.L': [(Z, -40)], 'hand.L': [(Z, -20)],
        'thigh.R': [(X, -20), (Y, -6)], 'thigh.L': [(X, -8), (Y, 6)], 'shin.R': [(X, 28)], 'shin.L': [(X, 22)], 'foot.R': [(X, -8)],
        'spine': [(X, 10 + 1.5*s(ph))], 'chest': [(X, 4)], 'head': [(X, 4)], 'cape.C.1': [(X, 6)], 'cape.C.2': [(X, 4 + 2*s(ph))]}), (0, 0, -0.06 + 0.005*s(ph)), (0.92, -0.15, 0.36)))
action('Defense', fr, True)

arm.animation_data.action = bpy.data.actions['Attente']; sc.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('tito_anim.blend'))

# ---------- export GLB optimisé : texture 1024 px, sans carte normale ni métal/rugosité ----------
m = bpy.data.materials['Material_0']; nt = m.node_tree; pr = nt.nodes['Principled BSDF']
for l in list(nt.links):
    if l.to_node == pr and l.to_socket.name in ('Metallic', 'Roughness', 'Normal'): nt.links.remove(l)
pr.inputs['Metallic'].default_value = 0.0; pr.inputs['Roughness'].default_value = 0.72
img = bpy.data.images['Image_0']; img.scale(1024, 1024)
bpy.ops.object.select_all(action='DESELECT')
for o in (tito, arm, sword): o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath('tito.glb'), export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='ACTIONS', export_skins=True, export_yup=True,
    export_image_format='JPEG', export_jpeg_quality=86, export_apply=False, export_force_sampling=True)
print('GLB', os.path.getsize('tito.glb'))
