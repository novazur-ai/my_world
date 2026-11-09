import bpy, os
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='tito_meshy.glb')
ob=[o for o in bpy.data.objects if o.type=='MESH'][0]; bpy.context.view_layer.objects.active=ob; ob.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0004); bpy.ops.object.mode_set(mode='OBJECT')
me=ob.data; me.calc_loop_triangles(); print('apres fusion', len(me.vertices), len(me.loop_triangles))
m=ob.modifiers.new('dec','DECIMATE'); m.ratio=22000/len(me.loop_triangles); m.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier='dec')
me.calc_loop_triangles(); print('apres reduction', len(me.vertices), len(me.loop_triangles))
bpy.ops.object.shade_smooth()
# composantes séparées (pour le rigging)
import bmesh
bm=bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
seen=set(); comps=[]
for v in bm.verts:
    if v.index in seen: continue
    st=[v]; seen.add(v.index); n=0
    while st:
        a=st.pop(); n+=1
        for e in a.link_edges:
            b=e.other_vert(a)
            if b.index not in seen: seen.add(b.index); st.append(b)
    comps.append(n)
print('morceaux', len(comps), sorted(comps, reverse=True)[:8])
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('tito_low.blend'))
