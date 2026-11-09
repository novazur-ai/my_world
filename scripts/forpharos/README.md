# Forpharos : sources du jeu (hors appli)

Ce dossier n'est **pas** mis en ligne : la publication (`.github/workflows/deploy.yml`) exclut `scripts/`.
Il garde tout ce qu'il faut pour refaire ou retoucher les éléments du jeu, sans repartir de zéro.
Le jeu lui-même est dans `modules/game/`.

## `blender/` : modèle 3D de Tito

Chaîne complète, à lancer dans l'ordre depuis ce dossier, avec Blender 5 utilisé comme module Python (`pip install bpy`) :

| Étape | Script | Entrée → sortie |
|---|---|---|
| 1. Allègement | `tito_opt.py` | `tito_meshy.glb` (modèle Meshy d'origine, 187 000 triangles) → `tito_low.blend` (22 000 triangles) |
| 2. Squelette | `tito_rig.py` | `tito_low.blend` → `tito_rig.blend` (20 os du corps, 9 os de cape, 2 os de cheveux ; poids automatiques corrigés par zone de couleur) |
| 3. Épée et animations | `tito_anim.py` | `tito_rig.blend` → `tito_anim.blend` + `tito.glb` (6 animations : Attente, Course, Attaque, CoupRecu, Victoire, Defense) |

Le `tito.glb` produit est à copier dans `modules/game/assets/tito.glb`.

Outils de contrôle :
- `tito_clash.py` : vérifie image par image que la lame ne traverse ni le corps, ni les cheveux, ni le sol, et mesure la torsion du poignet.
- `tito_sheet.py -- <sortie> "Attente:1,Attaque:14" <angle>` : planche de rendus des poses.
- `tito_grip.py`, `tito_nat.py`, `tito_who.py`, `tito_sword_prev.py` : position de la poignée, direction naturelle de la lame, partie du corps touchée, aperçu de l'épée.

`tito_anim.blend` est gardé tel quel pour retoucher à la main dans Blender.

## `maquettes/` : maquettes validées (9 novembre 2026)

- `village-pixel-B.html` : village en pixel art isométrique (rendu **B3** retenu : lumières douces par-dessus les pixels).
- `combat-3d-serie6.html` : combat en WebGL 2 (rendu **C3 « 3D douce »**, Lande du Phare). Il charge `tito-glb.txt` (le GLB encodé en base64) posé à côté.
- `capture-combat.js` : capture d'écran de la maquette avec Playwright (`node capture-combat.js <temps> <qualité> <dpr> <sortie.png> [Animation]`).
