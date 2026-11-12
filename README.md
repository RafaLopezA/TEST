# Team Hub

Aplicación web multiusuario para gestionar un equipo organizado por **chapters** y **grados**, con **histórico completo**, organigrama, vacantes y reportes.

## Funcionalidades

- **Usuarios y roles**: inicio de sesión; `admin` (todo + usuarios), `editor` (gestiona datos e importaciones), `viewer` (solo consulta).
- **Histórico con fecha efectiva**: cada cambio de chapter, grado, manager, título o ubicación crea una versión nueva. Nada se sobrescribe.
- **Viaje en el tiempo**: el selector de fecha de la barra superior muestra resumen, organigrama, miembros y estructura tal como estaban ese día (el pasado es de solo lectura). También admite cambios planificados a futuro.
- **Miembros**: alta, cambio organizativo (con fecha y motivo), corrección sin histórico, baja con reasignación de reportes, reincorporación, ficha con línea de tiempo y auditoría.
- **Organigrama**: jerarquía real por manager, en diagrama (una página por responsable, exportable a PDF) o árbol; incluye vacantes abiertas.
- **Vacantes (TBH)**: tablero por estado, PRF/SAP, antigüedad, "cubrir vacante" (crea a la persona), tiempos de cobertura.
- **Reportes**: evolución del headcount (por chapter, grado o equipo), movimientos (altas, bajas, promociones, traslados), comparación entre dos fechas, estructura (matrices, pirámide, span of control, antigüedad, skills), rotación y vacantes. Exportación CSV e impresión/PDF.
- **Importación Excel/CSV** con previsualización: detecta altas, cambios y ausencias, y los aplica con una fecha efectiva (sirve como carga inicial y como sincronización periódica).
- **Auditoría**: quién cambió qué y cuándo.
- **Seguridad**: contraseñas con scrypt, cookie de sesión `HttpOnly`/`SameSite=Strict`, límite de intentos de login y cierre de las sesiones abiertas al cambiar contraseña, rol o estado de un usuario.

## Puesta en marcha

Requiere Node.js ≥ 22.18 (usa el SQLite integrado; no necesita servidor de base de datos).

```bash
npm install
npm run build        # compila el frontend
npm start            # http://localhost:3000
```

En el primer arranque se crea un usuario administrador (`ADMIN_EMAIL` / `ADMIN_PASSWORD`; si no se indican, `admin@teamhub.local` y una contraseña aleatoria que se muestra en la consola).

Datos de demostración (ficticios, con 3 años de histórico) sobre una base de datos vacía:

```bash
npm run seed         # crea además admin@demo.local, editor@demo.local y lector@demo.local (contraseña demo1234)
```

### Docker

```bash
docker compose up -d --build
```

La base de datos queda en el volumen `teamhub-data` (`/data/teamhub.db`). Para copias de seguridad basta con copiar ese fichero (p. ej. `sqlite3 teamhub.db ".backup copia.db"`).

### Variables de entorno

| Variable | Descripción |
|---|---|
| `PORT` | Puerto HTTP (3000) |
| `DB_PATH` | Ruta del fichero SQLite (`data/teamhub.db`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Administrador inicial (solo si no hay usuarios) |
| `SESSION_SECRET` | Secreto para firmar sesiones (por defecto se genera y se guarda en la BD) |
| `COOKIE_SECURE=1` | Marca la cookie como `Secure` (usar con HTTPS) |
| `TRUST_PROXY=1` | Si hay un proxy inverso delante |
| `SEED_DEMO=1` | Carga datos de demostración si no hay miembros |

## Desarrollo

```bash
npm run dev          # API en :3000 y Vite en :5173 (con proxy a /api)
npm test             # tests de la API
npm run typecheck
```

- `server/` — API REST (Express + TypeScript ejecutado directamente por Node, SQLite). `src/temporal.ts` contiene las consultas históricas y `src/members.ts` las reglas de versionado.
- `web/` — SPA (React + Vite + TypeScript).

## Importar desde Excel

En **Importar** se admite `.xlsx` o `.csv` con una fila de cabeceras que incluya `Name` y, opcionalmente, `Mail`, `Manager`, `Title`, `Grade (Level)`, `Chapter`, `Country`, `City`, `HiringStatus`, `PRF number`, `SAP position number`, `Comments`. Las filas cuyo nombre empieza por `TBH` se cargan como vacantes. Las personas se identifican por email y, si no lo hay, por nombre; los managers se resuelven por nombre.
