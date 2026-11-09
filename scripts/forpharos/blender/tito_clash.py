# Vérifie, image par image, que la lame ne traverse ni le corps/les cheveux ni le sol, et mesure la torsion du poignet
import bpy, os, sys, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
bpy.ops.wm.open_mainfile(filepath=os.path.abspath(sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'tito_anim.blend'))
sc = bpy.context.scene; arm = bpy.data.objects['Rig']; sw = bpy.data.objects['Epee']; ti = bpy.data.objects['Tito']
zs = [v.co.z for v in sw.data.vertices]; zmin, zmax = min(zs), max(zs)
GROUND = min((ti.matrix_world @ v.co).z for v in ti.data.vertices)
print('sol', round(GROUND, 3), 'epee z', round(zmin, 3), round(zmax, 3))
# échantillons de lame : de la garde (exclue) à la pointe, + pommeau
blade_z = [-0.13 + (zmin + 0.13)*i/14 for i in range(15)]
REST_HAND = arm.data.bones['hand.R'].matrix_local.to_3x3()
worst = 0
for act in ['Attente', 'Course', 'Attaque', 'CoupRecu', 'Victoire', 'Defense']:
    a = bpy.data.actions[act]; arm.animation_data.action = a; f0, f1 = map(int, a.frame_range)
    rep = []
    for f in range(f0, f1 + 1):
        sc.frame_set(f); dg = bpy.context.evaluated_depsgraph_get()
        te = ti.evaluated_get(dg); me = te.to_mesh(); mw = te.matrix_world
        bvh = BVHTree.FromPolygons([mw @ v.co for v in me.vertices], [p.vertices[:] for p in me.polygons])
        te.to_mesh_clear()
        M = sw.matrix_world; bad = []; low = 9
        for z in blade_z + [zmax]:
            p = M @ Vector((0, 0, z)); low = min(low, p.z - GROUND)
            loc, nor, idx, d = bvh.find_nearest(p)
            if loc is not None and ((nor.dot(p - loc) < 0 and d < 0.08) or d < 0.012): bad.append(round(z, 2))
        pb = arm.pose.bones['hand.R']; tw = math.degrees(pb.rotation_quaternion.angle)
        rep.append((f, bad, round(low, 3), round(tw)))
    nb = [r for r in rep if r[1]]; gr = [r for r in rep if r[2] < 0.02]
    print(f'{act:9s} images {f1-f0+1:3d} | traversées {len(nb):3d} {[(r[0], r[1][:3]) for r in nb[:6]]} | sol {len(gr)} min {min(r[2] for r in rep)} | poignet max {max(r[3] for r in rep)}°')
