# Audit Handoff — Actions manuelles

Récap des actions que **toi** dois exécuter (impossible côté code seul).

---

## Ticket #14 — Déplacer le `.env` hors du clone sur le VPS

Le workflow CI/CD actuel (`.github/workflows/deploy.yml`) ne fait plus de backup/restore du `.env`. Le fichier doit vivre **hors** du dossier git pour ne plus risquer d'être écrasé par un `git reset --hard`.

### Sur le VPS (SSH manuel)

```bash
# 1. Créer un dossier permanent hors du clone
sudo mkdir -p /opt/venio-config
sudo chmod 700 /opt/venio-config

# 2. Déplacer le .env existant
sudo mv /chemin/vers/clone/.env /opt/venio-config/venio.env
sudo chmod 600 /opt/venio-config/venio.env
sudo chown root:docker /opt/venio-config/venio.env

# 3. Vérifier que le clone n'a plus de .env
ls -la /chemin/vers/clone/.env  # doit retourner "No such file"
```

### Modifier `docker-compose.prod.yml` dans le repo

Remplacer la section actuelle (qui s'attend à un `.env` à côté) par :

```yaml
services:
  app:
    # ... reste de la config ...
    env_file:
      - /opt/venio-config/venio.env
```

Commit + déploiement déclencheront le redémarrage avec le bon montage.

### Vérification après déploiement

```bash
docker compose -f docker-compose.prod.yml config | grep -A 5 environment
docker compose -f docker-compose.prod.yml exec app printenv JWT_SECRET | head -c 8
```

---

## Ticket #20 — Configurer Redis pour rate-limiting partagé

Le code détecte `REDIS_URL` et bascule en partagé, sinon fallback in-memory (warning au boot).

### Option A — Redis managé (recommandé prod)

Provisioner un Redis (Upstash, Aiven, RedisCloud — free tier OK).
Ajouter dans `/opt/venio-config/venio.env` :
```
REDIS_URL=rediss://default:PASSWORD@host:port
```

### Option B — Container Docker à côté de l'app

Ajouter à `docker-compose.prod.yml` :
```yaml
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data
    command: redis-server --requirepass ${REDIS_PASSWORD}
    networks:
      - venio-internal

volumes:
  redis-data:
```

Et dans `venio.env` : `REDIS_URL=redis://:PASSWORD@redis:6379`.

---

## Tickets #1, #2, #18 — Migration DB

Au prochain démarrage du backend, les nouveaux indexes Mongo se créent automatiquement (`User` partial unique, `Project` composé, `Document`, `PasswordResetToken` TTL). **Surveille le log de démarrage** la première fois — un index conflictuel sur `User.role` pourrait échouer si la collection contient déjà 2 SUPER_ADMIN. Si c'est le cas, fusionne-les manuellement avant deploy :

```js
// dans mongo shell
db.users.find({ role: 'SUPER_ADMIN' }).pretty()
// si plus d'un, garde le bon, supprime/dégrade les autres
```

---

## Ticket #13 — GitHub secrets pour la CI

Le workflow `deploy.yml` (rename de `deploy-ionos.yml`) s'attend à ces secrets repo :
- `SSH_PRIVATE_KEY` — clé privée d'un user déploiement sur le VPS
- `SSH_HOST` — IP/hostname du VPS
- `SSH_USER` — user SSH

Vérifie : `gh secret list` ou Settings → Secrets and variables → Actions.

---

## Suivi recommandé

- `npm run images:optimize` à lancer une fois pour générer les `.webp`/`.avif` (482KB → ~150KB attendus).
- `npm run build` génère désormais `dist/stats.html` (bundle analyzer) — ouvre-le pour identifier les prochains gains.
- Logger central (`src/lib/logger.ts`) : 21/47 `console.error` migrés. Le reste à faire au fil de l'eau.
- Tests : couverture passée de ~6% à plus large sur lib/contexts. Ajouter `@vitest/coverage-v8` pour mesurer (`npm i -D @vitest/coverage-v8` puis `vitest --coverage`).
- Forms a11y : `Contact`, `AdminLogin` ok. Forms admin secondaires (CGU/CGV/ProjectForm/ClientAccountNew) à migrer vers `FormField` (le composant a maintenant la prop `htmlFor`).
