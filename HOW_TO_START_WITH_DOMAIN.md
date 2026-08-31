# Start Superset With a Domain

This guide starts the local Superset codebase with Docker Compose and exposes it through Nginx Proxy Manager at `dashboards.idtcities.com`.

The setup uses the existing external Docker network `s4idtcities`. Superset's backend, frontend, websocket service, and nginx container are attached to that network so Nginx Proxy Manager can reach Superset by the Docker service name `nginx`.

## Architecture

```text
Internet
  |
  | HTTPS :443
  v
Nginx Proxy Manager
  |
  | s4idtcities network -> http://nginx:80
  v
Superset nginx
  |-- superset:8088          backend
  |-- superset-node:9000     frontend dev server/static assets
  `-- superset-websocket:8080
```

## Requirements

- Docker Engine and Docker Compose plugin
- Repository path: `/Services/Haris/superset`
- DNS control for `idtcities.com`
- Nginx Proxy Manager already running on the `s4idtcities` network
- The external network must exist:

```bash
docker network inspect s4idtcities >/dev/null 2>&1 || \
  docker network create s4idtcities
```

## One-Time Database Setup

This server already has a shared Postgres container named `postgres`. It was initialized for Keycloak, so Superset needs its own database and login inside that Postgres server.

Run this once:

```bash
docker exec postgres psql -U keycloak -d keycloak -v ON_ERROR_STOP=1 -c \
"DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'superset') THEN
    CREATE ROLE superset LOGIN PASSWORD 'idtcities123';
  ELSE
    ALTER ROLE superset WITH LOGIN PASSWORD 'idtcities123';
  END IF;
END \$\$;"

docker exec postgres createdb -U keycloak -O superset superset 2>/dev/null || true

docker exec postgres psql -U keycloak -d superset -v ON_ERROR_STOP=1 -c \
"ALTER DATABASE superset OWNER TO superset;
 GRANT ALL PRIVILEGES ON DATABASE superset TO superset;"
```

The values must match `docker/.env`:

```env
DATABASE_HOST=postgres
DATABASE_DB=superset
DATABASE_USER=superset
DATABASE_PASSWORD=idtcities123
```

Do not delete the existing Postgres volume unless you intentionally want to destroy the databases used by other applications.

## First Start

From the repository root:

```bash
cd /Services/Haris/superset

docker compose config --quiet

docker compose up -d --build
```

The first start can take several minutes. The frontend container installs dependencies and builds the development bundle. Follow startup logs with:

```bash
docker compose logs -f superset-init superset superset-node nginx
```

The init container should finish with:

```text
Init Step 3/3 [Complete] -- Setting up roles and perms
```

Check all services:

```bash
docker compose ps
```

The important states are:

- `superset`: `Up (healthy)`
- `superset-init`: `Exited (0)`
- `superset-node`: `Up`
- `nginx`: `Up`
- `superset-websocket`: `Up`

The worker may show `unhealthy` because its default healthcheck probes HTTP port `8088`, while a Celery worker does not serve HTTP on that port. This does not prevent the Superset web application from running.

## Nginx Proxy Manager

Create or edit a Proxy Host with these values:

| Field | Value |
|---|---|
| Domain Names | `dashboards.idtcities.com` |
| Scheme | `http` |
| Forward Hostname / IP | `nginx` |
| Forward Port | `80` |
| Access List | `Publicly Accessible` |
| Cache Assets | Disabled initially |
| Block Common Exploits | Enabled |
| Websockets Support | Enabled |

Nginx Proxy Manager must be attached to `s4idtcities`. Do not use `localhost`, `127.0.0.1`, host port `8090`, or the Superset container IP in the Forward Hostname field.

In the SSL tab:

1. Request a new Let's Encrypt certificate.
2. Select `Force SSL`.
3. Select `HTTP/2 Support` if desired.
4. Save.

## DNS

Create an `A` record at your DNS provider:

```text
Host: dashboards
Type: A
Value: <public IP of this Docker server>
Proxy/CDN: disabled while testing, if your DNS provider offers proxying
```

Verify DNS from the server or another machine:

```bash
getent hosts dashboards.idtcities.com
```

Then open:

```text
https://dashboards.idtcities.com
```

A healthy unauthenticated response normally redirects to `/welcome/` or `/login/`.

## Login

The default admin user created by `docker-init.sh` is:

```text
Username: admin
Password: admin
```

Change this password after the first login. To reset it from the running app:

```bash
docker compose exec superset superset fab reset-password \
  --username admin \
  --password 'NEW_STRONG_PASSWORD'
```

## Starting After a Reboot or Stop

When images are already built:

```bash
cd /Services/Haris/superset
docker compose up -d --no-build
```

Check status:

```bash
docker compose ps
```

The external `s4idtcities` network and named volumes should not be removed.

## Applying Code Changes

### Backend changes

Backend source is mounted into the container at `/app/superset`. Start or restart without rebuilding:

```bash
cd /Services/Haris/superset
docker compose up -d --no-build
```

The development server reloads Python changes. If it does not reload:

```bash
docker compose restart superset
```

### Frontend or plugin changes

Frontend source and `superset-frontend/plugins` are mounted into `superset-node`. The webpack development server rebuilds changes automatically.

Watch frontend logs:

```bash
docker compose logs -f superset-node
```

If the frontend container stops or its dependencies changed:

```bash
docker compose up -d --no-build superset-node
```

### Dependency or Dockerfile changes

Rebuild only when changing `Dockerfile`, Python dependency files, `package.json`, the frontend lockfile, or the websocket image:

```bash
cd /Services/Haris/superset
docker compose up -d --build
```

A source-only backend or plugin change does not require `--build`.

## Useful Commands

```bash
# Start without rebuilding
docker compose up -d --no-build

# Rebuild and start
docker compose up -d --build

# View status
docker compose ps

# Follow all logs
docker compose logs -f

# Follow one service
docker compose logs -f superset

# Stop containers but keep volumes
docker compose down

# Check backend health
curl http://127.0.0.1:8088/health

# Check the domain using the local HTTPS endpoint
curl -kI --resolve dashboards.idtcities.com:443:127.0.0.1 \
  https://dashboards.idtcities.com/
```

## Troubleshooting

### 502 Bad Gateway

Check the app first:

```bash
docker compose ps superset
curl http://127.0.0.1:8088/health
```

The app must be `Up (healthy)`. If it is only `Created`, initialization has not completed. Check:

```bash
docker compose logs --tail=100 superset-init
```

Also verify that Nginx Proxy Manager and Superset nginx share `s4idtcities`:

```bash
docker inspect nginx-proxy-manager --format '{{json .NetworkSettings.Networks}}'
docker inspect superset-nginx-1 --format '{{json .NetworkSettings.Networks}}'
```

### Nginx waits for the frontend

The Compose file checks:

```text
http://superset-node:9000/static/assets/manifest.json
```

Check the frontend:

```bash
docker compose logs -f superset-node
```

Do not change the check back to `host.docker.internal:9000`; the frontend is running inside the `superset-node` container.

### Database authentication failure

The existing `postgres` container uses its own administrator credentials. Superset must use the separate `superset` database and role created in the one-time setup above. Verify the values in `docker/.env` and recreate only the Superset services:

```bash
docker compose up -d --no-build --force-recreate superset-init superset
```

### Port already allocated

Current host bindings are:

```text
Superset app:   8088
Superset nginx: 8090 (localhost only)
Websocket:      8082 (localhost only)
Cypress:        8083 (localhost only)
Frontend:       9003 (localhost only)
```

The public domain does not use these host ports. Nginx Proxy Manager connects to `nginx:80` over `s4idtcities`.

### Exit code 137

Exit code `137` means a process was killed. Check memory and logs:

```bash
free -h
docker stats
docker compose logs --tail=100 superset
```

The first startup installs packages and can use significant memory. Start again in detached mode and allow the bootstrap process to finish:

```bash
docker compose up -d --no-build superset
```

## Current Compose Changes

The working domain setup includes:

- External `s4idtcities` network declaration.
- Superset nginx attached to `s4idtcities`.
- Docker service-name routing for `superset`, `superset-node`, and `superset-websocket`.
- Frontend readiness check using `superset-node:9000`.
- Websocket host port moved to `8082` because `8080` was already occupied.
- Cypress host port moved to `8083` because `8081` was already occupied.
- Optional example loading disabled because this deployment has no `db` example-data service.
- Superset initialization explicitly runs `/app/docker/docker-init.sh`.
