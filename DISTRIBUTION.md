# Distribution — APK Android & Desktop Windows

GestiPrint est une PWA installable, et aussi packageable en **APK Android**
(Capacitor) et en **installateur Windows .exe** (Tauri). Les binaires sont
produits automatiquement par GitHub Actions et publiés en **GitHub Release**.

## Pré-requis (une seule fois)

Dans le dépôt GitHub → **Settings → Secrets and variables → Actions → New
repository secret**, ajouter :

| Secret | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | `https://fdbgtrqonermnfpisgmb.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | votre clé **anon** (publique, celle du frontend) |

Ces valeurs sont injectées au build pour que l'app installée pointe vers votre
Supabase. (La clé anon est protégée par la RLS — voir `database/README.md`.)

## Lancer un build

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions compile alors, en parallèle :
- **`gestiprint.apk`** (Android, build *debug* installable — activer « sources
  inconnues » sur le téléphone) ;
- **`GestiPrint_x.y.z_x64-setup.exe`** (Windows, installateur NSIS).

Les deux fichiers sont attachés à la **Release** du tag, et aussi disponibles en
**artefacts** du run (Actions → le run → Artifacts) — utile pour un build manuel
(*Run workflow*) sans créer de tag.

## Notes

- L'icône du .exe est générée automatiquement depuis `client/public/gesp.png`.
- Pour un APK **signé** (Play Store / mise à jour propre), il faudra ajouter un
  keystore et passer `assembleRelease` — non nécessaire pour une distribution
  directe au pilote.
- Web (Vercel) reste la voie principale ; l'APK/.exe servent l'usage atelier
  hors-ligne.
